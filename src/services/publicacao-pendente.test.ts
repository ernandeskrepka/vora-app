import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { criarClienteCompleto, criarPostNoBanco, limparBanco } = await import("@/testes/ajudantes.ts");
const { registrarAuditoria } = await import("@/lib/audit.ts");
const { aprovadosQueNaoSairam, motivoDoUltimoAborto } = await import("./publicacao-pendente.ts");

beforeEach(async () => {
  await limparBanco();
});

describe("aprovados que nao sairam", () => {
  it("lista o aprovado com horario vencido e o motivo do aborto; ignora o futuro", async () => {
    const c = await criarClienteCompleto({ nome: "Santa Rita" });
    const vencido = await criarPostNoBanco({ clientId: c.id, horasAFrente: -2, status: "APROVADO" });
    await criarPostNoBanco({ clientId: c.id, horasAFrente: 5, status: "APROVADO" });
    await criarPostNoBanco({ clientId: c.id, horasAFrente: -5, status: "PUBLICADO" });
    await registrarAuditoria({
      entityType: "post",
      entityId: vencido.id,
      action: "publicacao_abortada",
      actorType: "SISTEMA",
      metadata: { motivo: "o cliente nao tem conexao INSTAGRAM cadastrada" },
    });

    const lista = await aprovadosQueNaoSairam();
    expect(lista.map((p) => p.id)).toEqual([vencido.id]);
    expect(lista[0]).toMatchObject({ cliente: "Santa Rita", motivo: "o cliente nao tem conexao INSTAGRAM cadastrada" });
    expect(await motivoDoUltimoAborto(vencido.id)).toMatchObject({ motivo: "o cliente nao tem conexao INSTAGRAM cadastrada" });
    expect(await motivoDoUltimoAborto("outro")).toBeNull();
  });
});
