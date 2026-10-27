import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { limparBanco } = await import("@/testes/ajudantes.ts");
const { quadroDeTarefas, basesConfiguradas, removerBase, sincronizarTarefas } =
  await import("./tarefas-notion.ts");

beforeEach(async () => {
  await limparBanco();
  await prisma.teamTask.deleteMany();
});

const ator = { tipo: "SISTEMA" as const, nome: "teste" };

function tarefa(input: {
  titulo: string;
  dia: string | null;
  owners?: string[];
  concluida?: boolean;
  cliente?: string | null;
}) {
  return prisma.teamTask.create({
    data: {
      notionPageId: `pg-${input.titulo}`,
      databaseId: "base-1",
      title: input.titulo,
      status: input.concluida ? "Publicado" : "Em edição",
      ownerNames: input.owners ?? [],
      dueAt: input.dia ? new Date(`${input.dia}T12:00:00-03:00`) : null,
      url: "https://notion.so/x",
      clientName: input.cliente ?? null,
      concluida: input.concluida ?? false,
      notionEditedAt: new Date("2026-10-26T10:00:00Z"),
    },
  });
}

describe("quadro de tarefas", () => {
  it("separa atrasadas, hoje, proximas e sem data, e marca as minhas", async () => {
    const hoje = new Date("2026-10-27T14:00:00-03:00");
    await tarefa({ titulo: "Atrasada", dia: "2026-10-24", owners: ["Natalia"] });
    await tarefa({ titulo: "Atrasada mais recente", dia: "2026-10-26", owners: ["Victor"] });
    await tarefa({ titulo: "Hoje", dia: "2026-10-27", owners: ["Natalia", "Victor"] });
    await tarefa({ titulo: "Amanha", dia: "2026-10-28" });
    await tarefa({ titulo: "Em duas semanas", dia: "2026-11-12" });
    await tarefa({ titulo: "Sem data", dia: null });
    await tarefa({ titulo: "Feita", dia: "2026-10-27", concluida: true });

    const q = await quadroDeTarefas({ nomeDaPessoa: "Natália Souza", referencia: hoje });

    expect(q.atrasadas.map((t) => t.titulo)).toEqual(["Atrasada mais recente", "Atrasada"]);
    expect(q.hoje.map((t) => t.titulo)).toEqual(["Hoje"]);
    expect(q.proximas.map((t) => t.titulo)).toEqual(["Amanha"]);
    expect(q.semData.map((t) => t.titulo)).toEqual(["Sem data"]);
    expect(q.concluidasRecentes.map((t) => t.titulo)).toEqual(["Feita"]);
    expect(q.total).toBe(6);
    expect(q.hoje[0].minha).toBe(true);
    expect(q.atrasadas[0].minha).toBe(false);
    expect(q.atrasadas[1].minha).toBe(true);
  });

  it("sem base configurada, sincronizar nao faz nada e nao quebra", async () => {
    const r = await sincronizarTarefas({ ator });
    expect(r).toMatchObject({ bases: 0, lidas: 0, novas: 0, falhas: [] });
    expect(await basesConfiguradas()).toEqual([]);
  });

  it("remover a base arquiva as tarefas dela", async () => {
    await prisma.setting.upsert({
      where: { key: "notion_bases_de_tarefas" },
      create: { key: "notion_bases_de_tarefas", value: [{ id: "base-1", nome: "Base" }] },
      update: { value: [{ id: "base-1", nome: "Base" }] },
    });
    await tarefa({ titulo: "X", dia: "2026-10-27" });
    await removerBase({ id: "base-1", ator });
    expect(await basesConfiguradas()).toEqual([]);
    const t = await prisma.teamTask.findUniqueOrThrow({ where: { notionPageId: "pg-X" } });
    expect(t.archived).toBe(true);
    expect((await quadroDeTarefas({ referencia: new Date("2026-10-27T14:00:00-03:00") })).total).toBe(0);
  });
});
