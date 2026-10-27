import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { criarClienteCompleto, criarPostNoBanco, criarUsuario, limparBanco } =
  await import("@/testes/ajudantes.ts");
const { montarPrevia, handleDoCliente, iniciaisDoNome } = await import("./perfil.ts");

beforeEach(async () => {
  await limparBanco();
});

describe("previa do perfil", () => {
  it("handle e iniciais", () => {
    expect(handleDoCliente("Laboratorio Santa Rita")).toBe("@laboratoriosantarita");
    expect(handleDoCliente("Qualquer", "@santarita")).toBe("@santarita");
    expect(iniciaisDoNome("Laboratorio Santa Rita")).toBe("LS");
  });

  it("cliente so ve o que tem arte; a equipe ve tudo, com quem subiu", async () => {
    const u = await criarUsuario();
    const c = await criarClienteCompleto({ nome: "Santa Rita" });
    const comArte = await criarPostNoBanco({ clientId: c.id, horasAFrente: 24 });
    const semArte = await criarPostNoBanco({ clientId: c.id, horasAFrente: 48 });
    await prisma.postMedia.deleteMany({ where: { postId: semArte.id } });
    await prisma.postMedia.updateMany({ where: { postId: comArte.id }, data: { uploadedById: u.id } });

    const interno = await montarPrevia({ clienteId: c.id, interno: true });
    expect(interno?.aCaminho.map((i) => i.id)).toEqual([comArte.id, semArte.id]);
    expect(interno?.aCaminho[0].arte?.por).toBe("Equipe");

    const publico = await montarPrevia({ clienteId: c.id, interno: false });
    expect(publico?.aCaminho.map((i) => i.id)).toEqual([comArte.id]);
    expect(publico?.aCaminho[0].arte).toBeUndefined();
    expect(publico?.grade.map((i) => i.id)).toEqual([comArte.id]);
    expect(publico?.atualizadoEm).not.toBeNull();
  });

  it("cliente inexistente devolve nulo", async () => {
    expect(await montarPrevia({ clienteId: "nao-existe", interno: false })).toBeNull();
  });
});
