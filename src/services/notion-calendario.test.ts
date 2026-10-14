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
const { sincronizarCalendarioDoNotion } =
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
