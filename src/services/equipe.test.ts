import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { limparBanco, criarUsuario: criarUsuarioDeTeste } = await import("@/testes/ajudantes.ts");
const { criarEquipeInicial, criarUsuario, trocarSenha, redefinirSenha } =
  await import("./equipe.ts");
const { senhaConfere } = await import("@/lib/crypto.ts");

const ator = { tipo: "SISTEMA" as const, nome: "teste" };

beforeEach(async () => {
  await limparBanco();
});

describe("equipe", () => {
  it("cria as cinco contas com funcao, papel e troca de senha obrigatoria", async () => {
    const r = await criarEquipeInicial({ sufixo: "2026", ator });

    expect(r.criados).toHaveLength(5);
    expect(r.existentes).toHaveLength(0);

    const pamela = await prisma.user.findUniqueOrThrow({ where: { email: "pamela@vorabr.com" } });
    expect(pamela.funcao).toBe("PLANEJAMENTO");
    expect(pamela.role).toBe("EDITOR");
    expect(pamela.mustChangePassword).toBe(true);
    expect(senhaConfere("vora-pamela-2026", pamela.passwordHash)).toBe(true);

    const guilherme = await prisma.user.findUniqueOrThrow({
      where: { email: "guilherme@vorabr.com" },
    });
    expect(guilherme.role).toBe("ADMIN");

    // Rodar de novo nao duplica nem troca senha de quem ja existe.
    const r2 = await criarEquipeInicial({ sufixo: "9999", ator });
    expect(r2.criados).toHaveLength(0);
    expect(r2.existentes).toHaveLength(5);
    const pamela2 = await prisma.user.findUniqueOrThrow({ where: { email: "pamela@vorabr.com" } });
    expect(pamela2.passwordHash).toBe(pamela.passwordHash);

    const auditoria = await prisma.auditLog.count({ where: { action: "usuario_criado" } });
    expect(auditoria).toBe(5);
  });

  it("conta generica do primeiro acesso ganha o nome e a funcao da pessoa", async () => {
    await prisma.user.create({
      data: {
        name: "Equipe VORA",
        email: "ernandeskrepka@gmail.com",
        passwordHash: "x",
        role: "ADMIN",
      },
    });
    const r = await criarEquipeInicial({ sufixo: "2026", ator });
    expect(r.existentes).toEqual(["ernandeskrepka@gmail.com"]);
    const ernande = await prisma.user.findUniqueOrThrow({
      where: { email: "ernandeskrepka@gmail.com" },
    });
    expect(ernande.name).toBe("Ernande Skrepka");
    expect(ernande.funcao).toBe("GESTAO");
    expect(ernande.passwordHash).toBe("x");
  });

  it("recusa senha fraca e e-mail repetido", async () => {
    await expect(
      criarUsuario({ nome: "Fulano", email: "f@vorabr.com", senha: "curta", funcao: "DESIGN", ator }),
    ).rejects.toThrow(/10 caracteres/);
    await criarUsuario({ nome: "Fulano", email: "f@vorabr.com", senha: "senha-boa-123", funcao: "DESIGN", ator });
    await expect(
      criarUsuario({ nome: "Outro", email: "F@vorabr.com", senha: "senha-boa-123", funcao: "DESIGN", ator }),
    ).rejects.toThrow(/Ja existe/);
  });

  it("troca a propria senha, derruba as outras sessoes e limpa a obrigacao", async () => {
    const u = await criarUsuarioDeTeste();
    await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: true } });
    await prisma.session.createMany({
      data: [
        { userId: u.id, tokenHash: "atual", expiresAt: new Date(Date.now() + 100000) },
        { userId: u.id, tokenHash: "outra", expiresAt: new Date(Date.now() + 100000) },
      ],
    });

    await expect(
      trocarSenha({ usuarioId: u.id, senhaAtual: "errada", novaSenha: "nova-senha-123", ator }),
    ).rejects.toThrow(/nao confere/);

    await trocarSenha({
      usuarioId: u.id,
      senhaAtual: "senha-de-teste-123",
      novaSenha: "nova-senha-123",
      manterSessaoTokenHash: "atual",
      ator,
    });

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois.mustChangePassword).toBe(false);
    expect(senhaConfere("nova-senha-123", depois.passwordHash)).toBe(true);
    const sessoes = await prisma.session.findMany({ where: { userId: u.id } });
    expect(sessoes.map((s) => s.tokenHash)).toEqual(["atual"]);
  });

  it("admin redefine a senha de alguem e a pessoa precisa trocar ao entrar", async () => {
    const u = await criarUsuarioDeTeste();
    await redefinirSenha({ usuarioId: u.id, novaSenha: "temporaria-123", ator });
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois.mustChangePassword).toBe(true);
    expect(senhaConfere("temporaria-123", depois.passwordHash)).toBe(true);
  });
});
