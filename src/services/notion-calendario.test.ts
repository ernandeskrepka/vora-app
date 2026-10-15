import { beforeEach, describe, expect, it, vi } from "vitest";

// A pagina do Notion e trocada por um cronograma fixo: o que esta em teste e
// o que o sistema faz com ele, nao a rede.
const paginaFalsa = vi.fn();
vi.mock("@/lib/notion/client.ts", async () => {
  const real = await vi.importActual<typeof import("@/lib/notion/client.ts")>(
    "@/lib/notion/client.ts",
  );
  return { ...real, lerPagina: paginaFalsa };
});

const { prisma } = await import("@/lib/db.ts");
const { ATOR_EQUIPE, criarClienteCompleto, limparBanco } =
  await import("@/testes/ajudantes.ts");
const { sincronizarCalendarioDoNotion, sincronizarTodosOsCalendarios } =
  await import("./notion-planejamento.ts");

const PAGINA_NOTION =
  "https://app.notion.com/p/3f48b499e74381d6b63af048deef3927";

/** Dia relativo a hoje, no formato dd/MM que a equipe escreve. */
function dia(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function cliente() {
  const c = await criarClienteCompleto();
  await prisma.client.update({
    where: { id: c.id },
    data: { notionPageId: PAGINA_NOTION },
  });
  return c;
}

beforeEach(async () => {
  await limparBanco();
  paginaFalsa.mockReset();
});

describe("cronograma do Notion no calendario", () => {
  it("cria o rascunho na data do cronograma e liga a pauta nele", async () => {
    const c = await cliente();
    paginaFalsa.mockResolvedValue([
      { tipo: "heading_2", texto: `Sexta-feira — ${dia(3)} | Tour pela loja` },
      { tipo: "paragraph", texto: "**Formato:** video simples" },
      { tipo: "numbered_list_item", texto: "Filmar a entrada." },
    ]);

    const r = await sincronizarCalendarioDoNotion({
      clienteId: c.id,
      ator: ATOR_EQUIPE,
      criarPostos: true,
    });

    expect(r.postosNoCalendario).toBe(1);

    const post = await prisma.post.findFirstOrThrow({
      where: { clientId: c.id },
    });
    expect(post.status).toBe("RASCUNHO");
    expect(post.caption).toContain("Tour pela loja");
    expect(post.caption).toContain("video simples");
    expect(post.scheduledAt.getHours()).toBe(9);

    const pauta = await prisma.planningItem.findFirstOrThrow({
      where: { clientId: c.id },
    });
    expect(pauta.postId).toBe(post.id);
    expect(pauta.status).toBe("VIROU_POST");
  });

  it("dia que ja passou vira pauta, nunca post", async () => {
    const c = await cliente();
    paginaFalsa.mockResolvedValue([
      {
        tipo: "heading_2",
        texto: `Segunda-feira — ${dia(-5)} | Bastidores da equipe`,
      },
    ]);

    const r = await sincronizarCalendarioDoNotion({
      clienteId: c.id,
      ator: ATOR_EQUIPE,
      criarPostos: true,
    });

    expect(r.noPassado).toBe(1);
    expect(r.postosNoCalendario).toBe(0);
    expect(await prisma.post.count({ where: { clientId: c.id } })).toBe(0);
    expect(await prisma.planningItem.count({ where: { clientId: c.id } })).toBe(
      1,
    );
  });

  it("sem pedir, nao cria post nenhum - so a pauta", async () => {
    const c = await cliente();
    paginaFalsa.mockResolvedValue([
      {
        tipo: "heading_2",
        texto: `Quarta-feira — ${dia(4)} | Combo de exames`,
      },
    ]);

    const r = await sincronizarCalendarioDoNotion({
      clienteId: c.id,
      ator: ATOR_EQUIPE,
    });

    expect(r.criados).toBe(1);
    expect(r.postosNoCalendario).toBe(0);
    expect(await prisma.post.count({ where: { clientId: c.id } })).toBe(0);
  });

  it("rodar de novo nao duplica o post no calendario", async () => {
    const c = await cliente();
    paginaFalsa.mockResolvedValue([
      { tipo: "heading_2", texto: `Quinta-feira — ${dia(6)} | Dia do cliente` },
    ]);

    await sincronizarCalendarioDoNotion({
      clienteId: c.id,
      ator: ATOR_EQUIPE,
      criarPostos: true,
    });
    const segunda = await sincronizarCalendarioDoNotion({
      clienteId: c.id,
      ator: ATOR_EQUIPE,
      criarPostos: true,
    });

    expect(segunda.postosNoCalendario).toBe(0);
    expect(segunda.jaEramPost).toBe(1);
    expect(await prisma.post.count({ where: { clientId: c.id } })).toBe(1);
  });

  it("o post nasce rascunho: nada vai para aprovacao sozinho", async () => {
    const c = await cliente();
    paginaFalsa.mockResolvedValue([
      { tipo: "heading_2", texto: `Sabado — ${dia(5)} | Convite para a loja` },
    ]);

    await sincronizarCalendarioDoNotion({
      clienteId: c.id,
      ator: ATOR_EQUIPE,
      criarPostos: true,
    });

    expect(await prisma.approvalRequest.count()).toBe(0);
    expect(await prisma.postPublication.count()).toBe(0);
    const post = await prisma.post.findFirstOrThrow({
      where: { clientId: c.id },
    });
    expect(post.approvedAt).toBeNull();
  });

  it("respeita a hora pedida", async () => {
    const c = await cliente();
    paginaFalsa.mockResolvedValue([
      { tipo: "heading_2", texto: `Terca-feira — ${dia(2)} | Enquete do sofa` },
    ]);

    await sincronizarCalendarioDoNotion({
      clienteId: c.id,
      ator: ATOR_EQUIPE,
      criarPostos: true,
      hora: 19,
    });

    const post = await prisma.post.findFirstOrThrow({
      where: { clientId: c.id },
    });
    expect(post.scheduledAt.getHours()).toBe(19);
  });

  it("recusa sincronizar cliente sem pagina configurada", async () => {
    const c = await criarClienteCompleto();
    await expect(
      sincronizarCalendarioDoNotion({ clienteId: c.id, ator: ATOR_EQUIPE }),
    ).rejects.toThrow();
  });
});

describe("calendario geral: todos os clientes de uma vez", () => {
  /** Dois clientes com pagina e um sem: a carteira de verdade e assim. */
  async function carteira() {
    const a = await cliente();
    await prisma.client.update({
      where: { id: a.id },
      data: { name: "Santa Rita" },
    });
    const b = await cliente();
    await prisma.client.update({
      where: { id: b.id },
      data: { name: "Espaco Moveis" },
    });
    const semPagina = await criarClienteCompleto({ nome: "Sem Notion" });
    return { a, b, semPagina };
  }

  it("le cada cliente com pagina e deixa o resto em paz", async () => {
    const { a, b, semPagina } = await carteira();
    paginaFalsa.mockResolvedValue([
      { tipo: "heading_2", texto: `Sexta-feira — ${dia(3)} | Post da semana` },
    ]);

    const r = await sincronizarTodosOsCalendarios({ ator: ATOR_EQUIPE });

    expect(r.comPagina).toBe(2);
    expect(r.lidos).toHaveLength(2);
    expect(r.falhas).toHaveLength(0);
    expect(await prisma.planningItem.count({ where: { clientId: a.id } })).toBe(
      1,
    );
    expect(await prisma.planningItem.count({ where: { clientId: b.id } })).toBe(
      1,
    );
    expect(
      await prisma.planningItem.count({ where: { clientId: semPagina.id } }),
    ).toBe(0);
  });

  it("a pauta que veio do Notion fica marcada como tal", async () => {
    const { a } = await carteira();
    paginaFalsa.mockResolvedValue([
      { tipo: "heading_2", texto: `Terca-feira — ${dia(2)} | Enquete` },
    ]);

    await sincronizarTodosOsCalendarios({ ator: ATOR_EQUIPE });

    const pauta = await prisma.planningItem.findFirstOrThrow({
      where: { clientId: a.id },
    });
    expect(pauta.source).toBe("notion");
  });

  it("um cliente com pagina quebrada nao trava os outros", async () => {
    const { a, b } = await carteira();
    // "b" aponta para outra pagina, que o Notion recusa como recusa uma
    // pagina nao compartilhada com a integracao.
    const PAGINA_QUEBRADA =
      "https://app.notion.com/p/3e48b499e743815b9803dba97eafa85e";
    await prisma.client.update({
      where: { id: b.id },
      data: { notionPageId: PAGINA_QUEBRADA },
    });
    paginaFalsa.mockImplementation(async (pageId: string) => {
      if (pageId.startsWith("3e48b499")) {
        throw new Error(
          "Notion respondeu 404. Confira se a pagina foi compartilhada.",
        );
      }
      return [{ tipo: "heading_2", texto: `Quarta-feira — ${dia(4)} | Combo` }];
    });

    const r = await sincronizarTodosOsCalendarios({ ator: ATOR_EQUIPE });

    expect(r.lidos).toHaveLength(1);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].cliente).toBe("Espaco Moveis");
    expect(r.falhas[0].erro).toContain("404");
    expect(await prisma.planningItem.count({ where: { clientId: a.id } })).toBe(
      1,
    );
    expect(await prisma.planningItem.count({ where: { clientId: b.id } })).toBe(
      0,
    );
  });

  it("na agenda, nao rele quem foi lido ha pouco e respeita o maximo por rodada", async () => {
    const { a, b } = await carteira();
    paginaFalsa.mockResolvedValue([
      { tipo: "heading_2", texto: `Quinta-feira — ${dia(5)} | Bastidores` },
    ]);
    // "a" acabou de ser lido; "b" nunca foi.
    await prisma.client.update({
      where: { id: a.id },
      data: { notionSyncedAt: new Date() },
    });

    const r = await sincronizarTodosOsCalendarios({
      ator: ATOR_EQUIPE,
      lidoHaMenosDeHoras: 6,
      maximo: 5,
    });

    expect(r.lidos).toHaveLength(1);
    expect(r.lidos[0].cliente).toBe("Espaco Moveis");
    expect(r.pulados).toBe(1);
    expect(await prisma.planningItem.count({ where: { clientId: b.id } })).toBe(
      1,
    );

    // Com maximo 1 e ninguem lido ha pouco, so um entra na rodada.
    await prisma.client.updateMany({ data: { notionSyncedAt: null } });
    const segunda = await sincronizarTodosOsCalendarios({
      ator: ATOR_EQUIPE,
      maximo: 1,
    });
    expect(segunda.lidos).toHaveLength(1);
    expect(segunda.pulados).toBe(1);
  });

  it("quem nunca foi lido vai na frente de quem ja foi", async () => {
    const { a, b } = await carteira();
    paginaFalsa.mockResolvedValue([]);
    await prisma.client.update({
      where: { id: a.id },
      data: { notionSyncedAt: new Date(Date.now() - 48 * 3_600_000) },
    });

    const r = await sincronizarTodosOsCalendarios({
      ator: ATOR_EQUIPE,
      maximo: 1,
    });

    expect(r.lidos[0].cliente).toBe("Espaco Moveis");
    expect(b.id).toBeTruthy();
  });

  it("sem nenhuma pagina configurada, nao ha o que ler", async () => {
    await criarClienteCompleto({ nome: "So conteudo" });
    const r = await sincronizarTodosOsCalendarios({ ator: ATOR_EQUIPE });
    expect(r.comPagina).toBe(0);
    expect(r.lidos).toHaveLength(0);
  });
});
