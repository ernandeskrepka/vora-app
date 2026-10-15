import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { criarClienteCompleto, criarPostNoBanco, limparBanco } =
  await import("@/testes/ajudantes.ts");
const { carregarCalendario, situacaoDoNotion } =
  await import("./calendario.ts");

/** Mes fechado para o teste nao depender do dia de hoje. */
const INICIO = new Date("2026-11-01T03:00:00Z"); // 01/11 00:00 em Sao Paulo
const FIM = new Date("2026-12-01T03:00:00Z");

function em(dia: number, hora = 9) {
  return new Date(Date.UTC(2026, 10, dia, hora + 3, 0, 0));
}

async function pauta(input: {
  clientId: string;
  titulo: string;
  dia: number | null;
  status?: "IDEIA" | "EM_PRODUCAO" | "PRONTO" | "VIROU_POST" | "ARQUIVADO";
  source?: string;
}) {
  return prisma.planningItem.create({
    data: {
      clientId: input.clientId,
      title: input.titulo,
      targetDate: input.dia === null ? null : em(input.dia),
      status: input.status ?? "IDEIA",
      source: input.source ?? null,
    },
  });
}

beforeEach(async () => {
  await limparBanco();
});

describe("calendario geral", () => {
  it("junta post e pauta com data, de todos os clientes, em ordem", async () => {
    const a = await criarClienteCompleto({ nome: "Santa Rita" });
    const b = await criarClienteCompleto({ nome: "Camati" });

    const post = await prisma.post.create({
      data: {
        clientId: a.id,
        caption: "Post do dia 10\n\nsegunda linha",
        format: "IMAGEM_UNICA",
        networks: ["INSTAGRAM"],
        scheduledAt: em(10, 16),
        status: "APROVADO",
      },
    });
    await pauta({
      clientId: b.id,
      titulo: "Reels do dia 5",
      dia: 5,
      source: "notion",
    });
    await pauta({ clientId: a.id, titulo: "Carrossel do dia 20", dia: 20 });

    const r = await carregarCalendario({ inicio: INICIO, fim: FIM });

    expect(r.posts).toHaveLength(1);
    expect(r.pautas).toHaveLength(2);
    expect(r.itens.map((i) => i.tipo)).toEqual(["pauta", "post", "pauta"]);
    expect(r.itens[0]).toMatchObject({
      cliente: "Camati",
      titulo: "Reels do dia 5",
      doNotion: true,
    });
    expect(r.itens[1]).toMatchObject({
      id: post.id,
      resumo: "Post do dia 10",
      status: "APROVADO",
    });
    expect(r.itens[2]).toMatchObject({
      titulo: "Carrossel do dia 20",
      doNotion: false,
    });
  });

  it("pauta sem data, arquivada ou que ja virou post fica fora", async () => {
    const c = await criarClienteCompleto();
    await pauta({ clientId: c.id, titulo: "Sem data", dia: null });
    await pauta({
      clientId: c.id,
      titulo: "Arquivada",
      dia: 3,
      status: "ARQUIVADO",
    });
    await pauta({
      clientId: c.id,
      titulo: "Ja e post",
      dia: 4,
      status: "VIROU_POST",
    });
    await pauta({
      clientId: c.id,
      titulo: "Em producao",
      dia: 6,
      status: "EM_PRODUCAO",
    });

    const r = await carregarCalendario({ inicio: INICIO, fim: FIM });

    expect(r.pautas.map((p) => p.titulo)).toEqual(["Em producao"]);
  });

  it("so o mes pedido", async () => {
    const c = await criarClienteCompleto();
    await pauta({ clientId: c.id, titulo: "Novembro", dia: 15 });
    await prisma.planningItem.create({
      data: {
        clientId: c.id,
        title: "Dezembro",
        targetDate: new Date("2026-12-05T12:00:00Z"),
        status: "IDEIA",
      },
    });
    await criarPostNoBanco({ clientId: c.id, horasAFrente: 24 * 400 });

    const r = await carregarCalendario({ inicio: INICIO, fim: FIM });

    expect(r.pautas.map((p) => p.titulo)).toEqual(["Novembro"]);
    expect(r.posts).toHaveLength(0);
  });

  it("filtra por cliente", async () => {
    const a = await criarClienteCompleto({ nome: "A" });
    const b = await criarClienteCompleto({ nome: "B" });
    await pauta({ clientId: a.id, titulo: "de A", dia: 2 });
    await pauta({ clientId: b.id, titulo: "de B", dia: 2 });

    const r = await carregarCalendario({
      inicio: INICIO,
      fim: FIM,
      clienteId: b.id,
    });

    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ cliente: "B" });
  });
});

describe("situacao do Notion", () => {
  it("conta quem tem pagina, quem nunca foi lido e a leitura mais recente", async () => {
    const lido = await criarClienteCompleto({ nome: "Lido" });
    const nuncaLido = await criarClienteCompleto({ nome: "Nunca" });
    await criarClienteCompleto({ nome: "Sem pagina" });
    const quando = new Date("2026-10-14T12:00:00Z");
    await prisma.client.update({
      where: { id: lido.id },
      data: {
        notionPageId:
          "https://app.notion.com/p/3f48b499e74381d6b63af048deef3927",
        notionSyncedAt: quando,
      },
    });
    await prisma.client.update({
      where: { id: nuncaLido.id },
      data: {
        notionPageId:
          "https://app.notion.com/p/3e48b499e743815b9803dba97eafa85e",
      },
    });

    const s = await situacaoDoNotion();

    expect(s.comPagina).toBe(2);
    expect(s.semPagina).toBe(1);
    expect(s.nuncaLidos).toBe(1);
    expect(s.maisRecente?.getTime()).toBe(quando.getTime());
  });
});
