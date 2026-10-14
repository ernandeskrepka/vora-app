import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { ATOR_EQUIPE, criarClienteCompleto, criarPostNoBanco, limparBanco } =
  await import("@/testes/ajudantes.ts");
const { registrarRecarga } = await import("./saldo.ts");
const { resultadosDaCarteira, variacaoPercentual } =
  await import("./carteira-resultados.ts");
const { montarQuinzena } = await import("@/domain/quinzena.ts");

const QUINZENA = montarQuinzena(2026, 10, 1); // 01 a 15/10/2026
const ANTERIOR = montarQuinzena(2026, 9, 2); // 16 a 30/09/2026

/** Cliente com conta de anuncios ligada - o estado normal da carteira. */
async function clienteComConta(nome: string) {
  const c = await criarClienteCompleto({ nome });
  await prisma.metaConnection.create({
    data: {
      clientId: c.id,
      assetType: "AD_ACCOUNT",
      assetId: `act_${Math.random().toString().slice(2, 12)}`,
      status: "CONECTADO",
      authMode: "SYSTEM_USER",
    },
  });
  return c;
}

async function lancar(input: {
  clienteId: string;
  dia: string;
  campanha?: string;
  gasto: number;
  resultados: number;
  cliques?: number;
  impressoes?: number;
}) {
  await prisma.adInsightDaily.create({
    data: {
      clientId: input.clienteId,
      adAccountId: "act_1",
      date: new Date(`${input.dia}T00:00:00Z`),
      campaignId: input.campanha ?? "camp-1",
      campaignName: input.campanha ?? "camp-1",
      spend: input.gasto,
      impressions: input.impressoes ?? 1000,
      clicks: input.cliques ?? 20,
      conversions: input.resultados,
    },
  });
}

function linhaDe(
  r: Awaited<ReturnType<typeof resultadosDaCarteira>>,
  nome: string,
) {
  const linha = r.linhas.find((l) => l.cliente === nome);
  if (!linha) throw new Error(`cliente ${nome} nao veio na carteira`);
  return linha;
}

beforeEach(async () => {
  await limparBanco();
  await prisma.adAccountTopUp.deleteMany();
  await prisma.setting.deleteMany();
});

describe("resultados da carteira", () => {
  it("soma por cliente e calcula o custo por resultado", async () => {
    const c = await clienteComConta("Danieli Moveis");
    await lancar({
      clienteId: c.id,
      dia: "2026-10-05",
      gasto: 120,
      resultados: 6,
    });
    await lancar({
      clienteId: c.id,
      dia: "2026-10-06",
      campanha: "camp-2",
      gasto: 80,
      resultados: 4,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });
    const l = linhaDe(r, "Danieli Moveis");

    expect(l.investimento).toBe(200);
    expect(l.resultados).toBe(10);
    expect(l.custoPorResultado).toBe(20);
    expect(l.temDados).toBe(true);
    expect(r.totais.investimento).toBe(200);
    expect(r.totais.custoPorResultado).toBe(20);
  });

  it("compara com a quinzena anterior e avisa quando o custo sobe", async () => {
    const c = await clienteComConta("Laborali");
    // Antes: 10 resultados a R$ 10. Agora: 5 a R$ 30.
    await lancar({
      clienteId: c.id,
      dia: "2026-09-20",
      gasto: 100,
      resultados: 10,
    });
    await lancar({
      clienteId: c.id,
      dia: "2026-10-05",
      gasto: 150,
      resultados: 5,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });
    const l = linhaDe(r, "Laborali");

    expect(l.variacao.custoPorResultado).toBe(200);
    expect(l.variacao.resultados).toBe(-50);
    expect(l.alertas.map((a) => a.chave)).toContain("custo_subiu");
    expect(l.alertas.map((a) => a.chave)).toContain("resultados_cairam");
  });

  it("nao inventa comparacao quando nao ha quinzena anterior", async () => {
    const c = await clienteComConta("Innova");
    await lancar({
      clienteId: c.id,
      dia: "2026-10-05",
      gasto: 90,
      resultados: 3,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });
    const l = linhaDe(r, "Innova");

    expect(l.variacao.investimento).toBeNull();
    expect(l.variacao.resultados).toBeNull();
    expect(l.variacao.custoPorResultado).toBeNull();
    expect(l.alertas.map((a) => a.chave)).not.toContain("custo_subiu");
  });

  it("avisa quando gastava e parou de gastar", async () => {
    const c = await clienteComConta("Videtip");
    await lancar({
      clienteId: c.id,
      dia: "2026-09-20",
      gasto: 200,
      resultados: 8,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });
    const l = linhaDe(r, "Videtip");

    expect(l.temDados).toBe(false);
    const alerta = l.alertas.find((a) => a.chave === "parou_de_gastar");
    expect(alerta?.texto).toContain("pausada");
    expect(alerta?.tom).toBe("atencao");
  });

  it("cliente que nunca anunciou nao disputa o topo com quem tem problema", async () => {
    const soConteudo = await clienteComConta("Darcisio Muller");
    const comProblema = await clienteComConta("Endogist");
    await lancar({
      clienteId: comProblema.id,
      dia: "2026-09-20",
      gasto: 200,
      resultados: 8,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });
    const parado = linhaDe(r, "Darcisio Muller");

    expect(parado.alertas.map((a) => a.chave)).toEqual(["sem_dados"]);
    expect(parado.alertas[0].tom).toBe("info");
    expect(parado.atencao).toBeLessThan(linhaDe(r, "Endogist").atencao);
    expect(r.linhas[0].cliente).toBe("Endogist");
  });

  it("cliente sem conta de anuncios nao entra como problema de campanha", async () => {
    const c = await criarClienteCompleto({ nome: "Sem Conta" });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });
    const l = linhaDe(r, "Sem Conta");

    expect(l.temConta).toBe(false);
    expect(l.alertas.map((a) => a.chave)).toEqual(["sem_conta"]);
    expect(c.id).toBe(l.clienteId);
  });

  it("saldo no limite e o alerta mais forte: vai para o topo da lista", async () => {
    const semSaldo = await clienteComConta("Fleming");
    const comTudoEmOrdem = await clienteComConta("Cepac");

    await registrarRecarga({
      clienteId: semSaldo.id,
      valor: 100,
      quando: new Date("2026-10-01T00:00:00Z"),
      ator: ATOR_EQUIPE,
    });
    await lancar({
      clienteId: semSaldo.id,
      dia: "2026-10-05",
      gasto: 60,
      resultados: 3,
    });
    await lancar({
      clienteId: comTudoEmOrdem.id,
      dia: "2026-10-05",
      gasto: 300,
      resultados: 15,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });

    expect(r.linhas[0].cliente).toBe("Fleming");
    expect(linhaDe(r, "Fleming").alertas[0].chave).toBe("saldo_baixo");
    expect(linhaDe(r, "Cepac").alertas).toHaveLength(0);
  });

  it("conta os posts da quinzena e cobra o que esta sem resposta", async () => {
    const c = await clienteComConta("Santa Rita");
    const dentro = { clientId: c.id, horasAFrente: 24 * 3 };
    await criarPostNoBanco({ ...dentro, status: "PUBLICADO" });
    await criarPostNoBanco({ ...dentro, status: "PUBLICADO" });
    await criarPostNoBanco({ ...dentro, status: "POST_SEM_RESPOSTA" });
    await criarPostNoBanco({ ...dentro, status: "AGUARDANDO_APROVACAO" });

    const quinzenaDeHoje = (await import("@/domain/quinzena.ts")).quinzenaDe(
      new Date(Date.now() + 24 * 3 * 3600 * 1000),
    );
    const r = await resultadosDaCarteira({ quinzena: quinzenaDeHoje });
    const l = linhaDe(r, "Santa Rita");

    expect(l.posts.publicados).toBe(2);
    expect(l.posts.semResposta).toBe(1);
    expect(l.posts.aguardando).toBe(1);
    expect(l.alertas.map((a) => a.chave)).toContain("sem_resposta");
    expect(l.alertas.map((a) => a.chave)).toContain("aguardando");
  });

  it("destaca a campanha mais barata e a mais cara da carteira", async () => {
    const a = await clienteComConta("Dental Care");
    const b = await clienteComConta("Amigovida");

    await lancar({
      clienteId: a.id,
      dia: "2026-10-04",
      campanha: "barata",
      gasto: 50,
      resultados: 10,
    });
    await lancar({
      clienteId: a.id,
      dia: "2026-10-04",
      campanha: "media",
      gasto: 100,
      resultados: 5,
    });
    await lancar({
      clienteId: b.id,
      dia: "2026-10-04",
      campanha: "cara",
      gasto: 300,
      resultados: 3,
    });
    await lancar({
      clienteId: b.id,
      dia: "2026-10-04",
      campanha: "media2",
      gasto: 120,
      resultados: 4,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });

    expect(r.destaques.melhores[0].campaignId).toBe("barata");
    expect(r.destaques.melhores[0].custoPorResultado).toBe(5);
    expect(r.destaques.piores[0].campaignId).toBe("cara");
    expect(r.destaques.piores[0].custoPorResultado).toBe(100);
  });

  it("campanha com resultado de sobra para sorte nao vira destaque", async () => {
    const c = await clienteComConta("Camati");
    await lancar({
      clienteId: c.id,
      dia: "2026-10-04",
      campanha: "sorte",
      gasto: 5,
      resultados: 1,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });

    expect(r.destaques.melhores).toHaveLength(0);
    expect(r.destaques.piores).toHaveLength(0);
  });

  it("serie diaria soma a carteira inteira", async () => {
    const a = await clienteComConta("Drummond");
    const b = await clienteComConta("JR Arquitetura");
    await lancar({
      clienteId: a.id,
      dia: "2026-10-07",
      gasto: 40,
      resultados: 2,
    });
    await lancar({
      clienteId: b.id,
      dia: "2026-10-07",
      gasto: 60,
      resultados: 3,
    });
    await lancar({
      clienteId: a.id,
      dia: "2026-10-08",
      gasto: 10,
      resultados: 1,
    });

    const r = await resultadosDaCarteira({ quinzena: QUINZENA });

    expect(r.serie).toHaveLength(2);
    expect(r.serie[0].investimento).toBe(100);
    expect(r.serie[0].resultados).toBe(5);
    expect(r.serie[1].investimento).toBe(10);
  });

  it("a quinzena anterior informada e a anterior de verdade", async () => {
    const r = await resultadosDaCarteira({ quinzena: QUINZENA });
    expect(r.anterior.chave).toBe(ANTERIOR.chave);
  });
});

describe("variacao percentual", () => {
  it("sem base nao ha variacao", () => {
    expect(variacaoPercentual(10, 0)).toBeNull();
  });

  it("dobrar e 100%", () => {
    expect(variacaoPercentual(20, 10)).toBe(100);
  });

  it("cair pela metade e -50%", () => {
    expect(variacaoPercentual(5, 10)).toBe(-50);
  });
});
