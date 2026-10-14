import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------- mocks */

// A fila nao sobe nos testes: checamos o que o fluxo manda agendar.
const fila = {
  agendarPublicacao: vi.fn(async () => undefined),
  agendarCorteSemResposta: vi.fn(async () => undefined),
  agendarLembretes: vi.fn(async () => undefined),
  cancelarJobsDoPost: vi.fn(async () => undefined),
};
vi.mock("@/lib/queue/filas.ts", () => fila);

// A Meta nunca e chamada de verdade; controlamos o resultado por teste.
const publicarMock = vi.fn();
vi.mock("@/lib/meta/index.ts", async () => {
  const graph = await import("@/lib/meta/graph.ts");
  return {
    MetaApiError: graph.MetaApiError,
    modoDryRun: () => false,
    publicar: publicarMock,
    tokenDaConexao: () => "token-de-teste",
    consultarLimitePublicacao: vi.fn(),
  };
});

const { prisma } = await import("@/lib/db.ts");
const { MetaApiError } = await import("@/lib/meta/graph.ts");
const {
  ATOR_EQUIPE,
  aprovarNoBanco,
  criarClienteCompleto,
  criarPedidoPendente,
  criarPostNoBanco,
  limparBanco,
} = await import("@/testes/ajudantes.ts");
const { registrarDecisao, carregarPorToken } = await import("./aprovacao.ts");
const { marcarPostSemResposta, atualizarPost, enviarParaAprovacao, reagendarPost } = await import("./posts.ts");
const { publicarPost } = await import("./publicacao.ts");
const { enviarLembrete } = await import("./lembretes.ts");

beforeEach(async () => {
  await limparBanco();
  vi.clearAllMocks();
  publicarMock.mockReset();
});

/* ------------------------------------------- 1. silencio nunca publica */

describe("silencio do cliente", () => {
  it("vira POST SEM RESPOSTA no horario, sem publicar", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({
      clientId: cliente.id,
      status: "AGUARDANDO_APROVACAO",
      horasAFrente: -1,
    });
    await criarPedidoPendente({ postId: post.id });

    const r = await marcarPostSemResposta({ postId: post.id });

    expect(r).toBe("marcado");
    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.status).toBe("POST_SEM_RESPOSTA");
    expect(atual.publishedAt).toBeNull();
    expect(publicarMock).not.toHaveBeenCalled();
    expect(fila.agendarPublicacao).not.toHaveBeenCalled();

    // O link fica somente leitura.
    const pedido = await prisma.approvalRequest.findFirstOrThrow({ where: { postId: post.id } });
    expect(pedido.status).toBe("EXPIRADO");

    // A equipe e avisada.
    const aviso = await prisma.notification.findFirst({
      where: { postId: post.id, type: "INTERNO_POST_SEM_RESPOSTA" },
    });
    expect(aviso).not.toBeNull();
  });

  it("nao mexe no post se o cliente ja tinha respondido", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    expect(await marcarPostSemResposta({ postId: post.id })).toBe("ignorado");
    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.status).toBe("APROVADO");
  });

  it("um post aprovado nunca pode ser marcado como sem resposta", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "APROVADO" });
    expect(await marcarPostSemResposta({ postId: post.id })).toBe("ignorado");
  });
});

/* ------------------------------------------------ 2. decisao do cliente */

describe("decisao do cliente pelo link", () => {
  it("aprova, registra auditoria com nome e IP, e agenda a publicacao", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    const { token } = await criarPedidoPendente({ postId: post.id });

    await registrarDecisao({
      token,
      nome: "Danieli Souza",
      decisao: "APROVADO",
      ipAddress: "189.1.2.3",
      userAgent: "iPhone",
    });

    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.status).toBe("APROVADO");
    expect(atual.approvedAt).not.toBeNull();

    const decisao = await prisma.approvalDecision.findFirstOrThrow({ where: { postId: post.id } });
    expect(decisao.approverName).toBe("Danieli Souza");
    expect(decisao.ipAddress).toBe("189.1.2.3");
    expect(decisao.userAgent).toBe("iPhone");
    expect(decisao.postVersion).toBe(1);

    const auditoria = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: post.id, action: "cliente_aprovou" },
    });
    expect(auditoria.actorType).toBe("CLIENTE");
    expect(auditoria.actorName).toBe("Danieli Souza");
    expect(auditoria.ipAddress).toBe("189.1.2.3");

    expect(fila.agendarPublicacao).toHaveBeenCalledTimes(1);
  });

  it("reprova somente com comentario, e avisa a equipe", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    const { token } = await criarPedidoPendente({ postId: post.id });

    await expect(
      registrarDecisao({ token, nome: "Marcos", decisao: "REPROVADO" }),
    ).rejects.toThrow(/ajustado/i);

    await registrarDecisao({
      token,
      nome: "Marcos",
      decisao: "REPROVADO",
      comentario: "Trocar a foto principal.",
    });

    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.status).toBe("REPROVADO");
    expect(fila.agendarPublicacao).not.toHaveBeenCalled();

    const aviso = await prisma.notification.findFirstOrThrow({
      where: { postId: post.id, type: "INTERNO_POST_REPROVADO" },
    });
    expect(JSON.stringify(aviso.payload)).toContain("Trocar a foto principal.");
  });

  it("exige nome com pelo menos duas letras", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    const { token } = await criarPedidoPendente({ postId: post.id });

    await expect(registrarDecisao({ token, nome: " ", decisao: "APROVADO" })).rejects.toThrow(/nome/i);
  });

  it("recusa a segunda decisao no mesmo link", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    const { token } = await criarPedidoPendente({ postId: post.id });

    await registrarDecisao({ token, nome: "Primeira", decisao: "APROVADO" });
    await expect(registrarDecisao({ token, nome: "Segunda", decisao: "REPROVADO", comentario: "x" }))
      .rejects.toThrow(/ja foi respondido/i);

    expect(await prisma.approvalDecision.count({ where: { postId: post.id } })).toBe(1);
  });

  it("recusa token inexistente e link expirado", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    const { token } = await criarPedidoPendente({ postId: post.id, expiraEmHoras: -1 });

    await expect(registrarDecisao({ token: "token-inventado", nome: "Alguem", decisao: "APROVADO" }))
      .rejects.toThrow(/invalido/i);
    await expect(registrarDecisao({ token, nome: "Alguem", decisao: "APROVADO" }))
      .rejects.toThrow(/prazo/i);
  });

  it("recusa link de versao anterior do post", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({
      clientId: cliente.id,
      status: "AGUARDANDO_APROVACAO",
      version: 2,
    });
    const { token } = await criarPedidoPendente({ postId: post.id, postVersion: 1 });

    await expect(registrarDecisao({ token, nome: "Alguem", decisao: "APROVADO" }))
      .rejects.toThrow(/versao anterior/i);
  });

  it("mostra o status final em modo leitura depois de decidido", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    const { token } = await criarPedidoPendente({ postId: post.id });

    await registrarDecisao({ token, nome: "Danieli", decisao: "APROVADO" });

    const visao = await carregarPorToken(token);
    expect(visao?.estado).toBe("JA_DECIDIDO");
    expect(visao?.decisao?.nome).toBe("Danieli");
  });
});

/* ------------------------------------------ 3. revalidacao no disparo */

describe("revalidacao antes de publicar", () => {
  it("publica um post aprovado e grava o link", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    publicarMock.mockResolvedValue({
      externalId: "ig_123",
      permalink: "https://instagram.com/p/abc",
      dryRun: false,
    });

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("publicado");
    const atual = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { publications: true },
    });
    expect(atual.status).toBe("PUBLICADO");
    expect(atual.publishedAt).not.toBeNull();
    expect(atual.publications[0].externalId).toBe("ig_123");
  });

  it("nao publica post que nunca foi aprovado (job antigo na fila)", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("abortado");
    expect(publicarMock).not.toHaveBeenCalled();
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe(
      "AGUARDANDO_APROVACAO",
    );
    expect(
      await prisma.auditLog.count({ where: { entityId: post.id, action: "publicacao_abortada" } }),
    ).toBe(1);
  });

  it("nao publica quando a aprovacao e de uma versao antiga", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id, postVersion: 1 });
    // A agencia mexeu no post depois da aprovacao: versao 2, aprovacao e da 1.
    await prisma.post.update({
      where: { id: post.id },
      data: { version: 2, status: "APROVADO" },
    });

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("abortado");
    expect(r.resultado === "abortado" && r.motivo).toMatch(/versao 2/);
    expect(publicarMock).not.toHaveBeenCalled();
  });

  it("nao publica com a conexao da Meta fora do ar", async () => {
    const cliente = await criarClienteCompleto({ conectado: false });
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("abortado");
    expect(r.resultado === "abortado" && r.motivo).toMatch(/EXPIRADO/);
    expect(publicarMock).not.toHaveBeenCalled();
  });

  it("nao publica post cancelado", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });
    await prisma.post.update({ where: { id: post.id }, data: { status: "CANCELADO" } });

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });
    expect(r.resultado).toBe("abortado");
    expect(publicarMock).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------- 4. retries e idempotencia */

describe("retries e idempotencia da publicacao", () => {
  it("tenta de novo em erro temporario e registra cada tentativa", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    publicarMock
      .mockRejectedValueOnce(
        new MetaApiError("instabilidade", 500, 2, null, "trace", true, "temporaria"),
      )
      .mockResolvedValueOnce({ externalId: "ig_ok", permalink: null, dryRun: false });

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("publicado");
    const tentativas = await prisma.publishAttempt.findMany({
      where: { postId: post.id },
      orderBy: { attempt: "asc" },
    });
    expect(tentativas.map((t) => t.status)).toEqual(["ERRO", "SUCESSO"]);
  });

  it("nao insiste em erro de token (nao retentavel) e marca FALHOU", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    publicarMock.mockRejectedValue(
      new MetaApiError("token invalido", 400, 190, null, null, false, "token"),
    );

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("falhou");
    expect(publicarMock).toHaveBeenCalledTimes(1);
    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.status).toBe("FALHOU");
    expect(atual.lastError).toContain("token invalido");
    expect(
      await prisma.notification.count({
        where: { postId: post.id, type: "INTERNO_FALHA_DE_PUBLICACAO" },
      }),
    ).toBe(1);
  });

  it("para na terceira tentativa", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    publicarMock.mockRejectedValue(
      new MetaApiError("instavel", 500, 2, null, null, true, "temporaria"),
    );

    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("falhou");
    expect(publicarMock).toHaveBeenCalledTimes(3);
    expect(await prisma.publishAttempt.count({ where: { postId: post.id } })).toBe(3);
  });

  it("nao publica duas vezes na mesma rede", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    publicarMock.mockResolvedValue({ externalId: "ig_1", permalink: null, dryRun: false });
    await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    // Job repetido (reentrega da fila): nada deve sair de novo.
    const r = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(r.resultado).toBe("ignorado");
    expect(publicarMock).toHaveBeenCalledTimes(1);
    expect(await prisma.postPublication.count({ where: { postId: post.id } })).toBe(1);
  });

  it("em falha parcial, retoma apenas a rede que faltou", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({
      clientId: cliente.id,
      status: "AGUARDANDO_APROVACAO",
      networks: ["INSTAGRAM", "FACEBOOK"],
    });
    await aprovarNoBanco({ postId: post.id });

    publicarMock.mockImplementation(async ({ network }: { network: string }) => {
      if (network === "FACEBOOK") {
        throw new MetaApiError("pagina sem permissao", 403, 200, null, null, false, "permissao");
      }
      return { externalId: "ig_ok", permalink: null, dryRun: false };
    });

    const primeira = await publicarPost({ postId: post.id, baseBackoffMs: 1 });
    expect(primeira.resultado).toBe("falhou");
    expect(await prisma.postPublication.count({ where: { postId: post.id } })).toBe(1);

    // Corrigido do lado da Meta; o reprocessamento so tenta o Facebook.
    publicarMock.mockReset();
    publicarMock.mockResolvedValue({ externalId: "fb_ok", permalink: null, dryRun: false });
    await prisma.post.update({ where: { id: post.id }, data: { status: "APROVADO" } });

    const segunda = await publicarPost({ postId: post.id, baseBackoffMs: 1 });

    expect(segunda.resultado).toBe("publicado");
    expect(publicarMock).toHaveBeenCalledTimes(1);
    expect(publicarMock.mock.calls[0][0].network).toBe("FACEBOOK");
    expect(await prisma.postPublication.count({ where: { postId: post.id } })).toBe(2);
  });
});

/* ------------------------------------------ 5. edicao derruba aprovacao */

describe("edicao da agencia", () => {
  it("derruba a aprovacao, sobe a versao e manda novo pedido", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    const r = await atualizarPost({
      postId: post.id,
      dados: { caption: "Legenda nova" },
      ator: ATOR_EQUIPE,
    });

    expect(r.novoPedidoEnviado).toBe(true);
    const atual = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { approvalRequests: { orderBy: { createdAt: "desc" } } },
    });
    expect(atual.status).toBe("AGUARDANDO_APROVACAO"); // novo pedido ja enviado
    expect(atual.version).toBe(2);
    expect(atual.approvedAt).toBeNull();
    expect(atual.caption).toBe("Legenda nova");
    expect(atual.approvalRequests[0].postVersion).toBe(2);
    expect(atual.approvalRequests[0].status).toBe("PENDENTE");
    // Existe um unico pedido em aberto, e ele e da versao nova.
    const pendentes = atual.approvalRequests.filter((p) => p.status === "PENDENTE");
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0].postVersion).toBe(2);
    expect(fila.cancelarJobsDoPost).toHaveBeenCalled();
  });

  it("invalida o link antigo quando edita um post que estava com o cliente", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "RASCUNHO" });
    const { link: linkAntigo } = await enviarParaAprovacao({ postId: post.id, ator: ATOR_EQUIPE });

    await atualizarPost({
      postId: post.id,
      dados: { caption: "Legenda corrigida" },
      ator: ATOR_EQUIPE,
    });

    const antigo = await carregarPorToken(linkAntigo.split("/aprovar/")[1]);
    expect(antigo?.estado).toBe("SUBSTITUIDO");
    await expect(
      registrarDecisao({ token: linkAntigo.split("/aprovar/")[1], nome: "Cliente", decisao: "APROVADO" }),
    ).rejects.toThrow(/substituido/i);
  });

  it("mudar o horario tambem derruba a aprovacao", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });

    const r = await reagendarPost({
      postId: post.id,
      novaData: new Date(Date.now() + 80 * 3_600_000),
      ator: ATOR_EQUIPE,
    });

    expect(r.exigiuNovaAprovacao).toBe(true);
    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.version).toBe(2);
    expect(atual.approvedAt).toBeNull();
  });

  it("reagendar depois de falha mantem a aprovacao", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "AGUARDANDO_APROVACAO" });
    await aprovarNoBanco({ postId: post.id });
    await prisma.post.update({
      where: { id: post.id },
      data: { status: "FALHOU", lastError: "erro antigo" },
    });

    const r = await reagendarPost({
      postId: post.id,
      novaData: new Date(Date.now() + 5 * 3_600_000),
      ator: ATOR_EQUIPE,
    });

    expect(r.exigiuNovaAprovacao).toBe(false);
    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.status).toBe("APROVADO");
    expect(atual.version).toBe(1);
    expect(atual.lastError).toBeNull();
    expect(fila.agendarPublicacao).toHaveBeenCalled();
  });

  it("nao edita post em publicacao", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "PUBLICANDO" });

    await expect(
      atualizarPost({ postId: post.id, dados: { caption: "x" }, ator: ATOR_EQUIPE }),
    ).rejects.toThrow(/nao e possivel editar/i);
  });

  it("edicao sem mudanca nenhuma nao sobe versao", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, caption: "igual" });

    const r = await atualizarPost({
      postId: post.id,
      dados: { caption: "igual" },
      ator: ATOR_EQUIPE,
    });

    expect(r.novoPedidoEnviado).toBe(false);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).version).toBe(1);
  });
});

/* ------------------------------------------------ 6. pedido e lembretes */

describe("pedido de aprovacao e lembretes", () => {
  it("envia o link, agenda lembretes e o corte de sem resposta", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "RASCUNHO" });

    const r = await enviarParaAprovacao({ postId: post.id, ator: ATOR_EQUIPE });

    expect(r.contatos).toBe(1);
    expect(r.link).toContain("/aprovar/");
    const atual = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(atual.status).toBe("AGUARDANDO_APROVACAO");

    expect(fila.agendarCorteSemResposta).toHaveBeenCalledTimes(1);
    expect(fila.agendarLembretes).toHaveBeenCalledTimes(1);

    // O banco guarda o hash, nunca o token do link.
    const pedido = await prisma.approvalRequest.findFirstOrThrow({ where: { postId: post.id } });
    const tokenPuro = r.link.split("/aprovar/")[1];
    expect(pedido.tokenHash).not.toBe(tokenPuro);
    expect(pedido.tokenHash).toHaveLength(64);

    // A mensagem para o cliente fica registrada.
    const mensagem = await prisma.notification.findFirstOrThrow({
      where: { postId: post.id, type: "APROVACAO_PENDENTE" },
    });
    expect(JSON.stringify(mensagem.payload)).toContain(tokenPuro);
  });

  it("recusa pedido para cliente sem contato aprovador", async () => {
    const cliente = await criarClienteCompleto({ comAprovador: false });
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "RASCUNHO" });

    await expect(enviarParaAprovacao({ postId: post.id, ator: ATOR_EQUIPE })).rejects.toThrow(
      /contato aprovador/i,
    );
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("RASCUNHO");
  });

  it("recusa pedido de post ja aprovado", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "APROVADO" });

    await expect(enviarParaAprovacao({ postId: post.id, ator: ATOR_EQUIPE })).rejects.toThrow(
      /nao pode ser enviado/i,
    );
  });

  it("lembrete usa o mesmo link e nao sai se o cliente ja respondeu", async () => {
    const cliente = await criarClienteCompleto();
    const post = await criarPostNoBanco({ clientId: cliente.id, status: "RASCUNHO" });
    const { link } = await enviarParaAprovacao({ postId: post.id, ator: ATOR_EQUIPE });

    expect(await enviarLembrete({ postId: post.id, horasAntes: 24 })).toBe("enviado");
    const lembrete = await prisma.notification.findFirstOrThrow({
      where: { postId: post.id, type: "LEMBRETE" },
    });
    expect(JSON.stringify(lembrete.payload)).toContain(link.split("/aprovar/")[1]);

    await prisma.post.update({ where: { id: post.id }, data: { status: "APROVADO" } });
    expect(await enviarLembrete({ postId: post.id, horasAntes: 2 })).toBe("ignorado");
  });
});
