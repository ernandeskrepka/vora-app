import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { criarClienteCompleto, criarPostNoBanco, criarUsuario, limparBanco } =
  await import("@/testes/ajudantes.ts");
const { registrarAuditoria } = await import("@/lib/audit.ts");
const { atividadeRecente } = await import("./historico.ts");

beforeEach(async () => {
  await limparBanco();
});

describe("atividade recente", () => {
  it("junta eventos de cliente e de post, com nome de quem fez e do cliente", async () => {
    const u = await criarUsuario();
    const a = await criarClienteCompleto({ nome: "Santa Rita" });
    const b = await criarClienteCompleto({ nome: "Camati" });
    const post = await criarPostNoBanco({ clientId: a.id });

    await registrarAuditoria({
      entityType: "client",
      entityId: b.id,
      action: "materiais_adicionados",
      actorType: "USUARIO",
      actorUserId: u.id,
      actorName: "Natalia",
      metadata: { arquivos: 2 },
    });
    await registrarAuditoria({
      entityType: "post",
      entityId: post.id,
      action: "post_criado",
      actorType: "USUARIO",
      actorUserId: u.id,
      actorName: "Victor",
      metadata: { arquivos: 1 },
    });
    await registrarAuditoria({
      entityType: "user",
      entityId: u.id,
      action: "login",
      actorType: "USUARIO",
      actorUserId: u.id,
      actorName: "Victor",
    });

    const geral = await atividadeRecente();
    expect(geral.map((e) => e.acao)).toEqual(["post_criado", "materiais_adicionados"]);
    expect(geral[0]).toMatchObject({
      quem: "Victor",
      rotulo: "Criou o post",
      detalhe: "1 arquivo(s) de criativo",
      cliente: { id: a.id, nome: "Santa Rita" },
      postId: post.id,
    });
    expect(geral[1]).toMatchObject({
      quem: "Natalia",
      cliente: { id: b.id, nome: "Camati" },
      postId: null,
    });

    // Com "tudo", o login aparece.
    expect((await atividadeRecente({ tudo: true })).map((e) => e.acao)).toContain("login");

    // Por cliente: so o que e dele (inclusive pelos posts).
    const deA = await atividadeRecente({ clienteId: a.id });
    expect(deA.map((e) => e.acao)).toEqual(["post_criado"]);
    const deB = await atividadeRecente({ clienteId: b.id });
    expect(deB.map((e) => e.acao)).toEqual(["materiais_adicionados"]);
  });
});
