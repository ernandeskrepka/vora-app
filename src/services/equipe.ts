import { prisma } from "@/lib/db.ts";
import { hashSenha, senhaConfere } from "@/lib/crypto.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import {
  EQUIPE_VORA,
  normalizarFuncao,
  papelDaFuncao,
  senhaForte,
  senhaInicial,
  type Funcao,
} from "@/domain/equipe.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

/**
 * Equipe: um login por pessoa, com funcao. Cada acao no sistema fica com o
 * nome de quem fez, entao conta compartilhada nao serve.
 */
export async function criarUsuario(input: {
  nome: string;
  email: string;
  senha: string;
  funcao: Funcao;
  /** Papel explicito; sem ele, vem da funcao (gestao e coordenacao administram). */
  papel?: "ADMIN" | "EDITOR";
  /** Obriga a trocar a senha na primeira entrada. */
  trocarSenhaNoPrimeiroAcesso?: boolean;
  ator: Ator;
}) {
  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase();
  if (nome.length < 2) throw new ErroDeRegra("Informe o nome.");
  if (!email.includes("@")) throw new ErroDeRegra("E-mail invalido.");
  const problema = senhaForte(input.senha);
  if (problema) throw new ErroDeRegra(problema);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new ErroDeRegra("Ja existe usuario com esse e-mail.");
  }

  const usuario = await prisma.user.create({
    data: {
      name: nome,
      email,
      passwordHash: hashSenha(input.senha),
      role: input.papel ?? papelDaFuncao(input.funcao),
      funcao: input.funcao,
      mustChangePassword: input.trocarSenhaNoPrimeiroAcesso ?? false,
    },
  });

  await registrarAuditoria({
    entityType: "user",
    entityId: usuario.id,
    action: "usuario_criado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { email, papel: usuario.role, funcao: usuario.funcao },
  });

  return usuario;
}

export async function atualizarFuncao(input: {
  usuarioId: string;
  funcao: Funcao;
  ator: Ator;
}) {
  const usuario = await prisma.user.update({
    where: { id: input.usuarioId },
    data: { funcao: input.funcao, role: papelDaFuncao(input.funcao) },
  });
  await registrarAuditoria({
    entityType: "user",
    entityId: usuario.id,
    action: "funcao_alterada",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    toStatus: input.funcao,
  });
  return usuario;
}

/**
 * Cria as contas da equipe da VORA que ainda nao existem, com senha inicial
 * previsivel e troca obrigatoria na primeira entrada. Idempotente: quem ja
 * existe so ganha a funcao certa (sem mexer na senha).
 */
export async function criarEquipeInicial(input: { sufixo: string; ator: Ator }) {
  const criados: Array<{ nome: string; email: string; funcao: Funcao; senha: string }> = [];
  const existentes: string[] = [];

  for (const pessoa of EQUIPE_VORA) {
    const existente = await prisma.user.findUnique({ where: { email: pessoa.email } });
    if (existente) {
      if (existente.funcao === "OUTRA") {
        await atualizarFuncao({ usuarioId: existente.id, funcao: pessoa.funcao, ator: input.ator });
      }
      existentes.push(pessoa.email);
      continue;
    }
    const senha = senhaInicial(pessoa.nome, input.sufixo);
    await criarUsuario({
      nome: pessoa.nome,
      email: pessoa.email,
      senha,
      funcao: pessoa.funcao,
      trocarSenhaNoPrimeiroAcesso: true,
      ator: input.ator,
    });
    criados.push({ nome: pessoa.nome, email: pessoa.email, funcao: pessoa.funcao, senha });
  }

  return { criados, existentes };
}

/** A propria pessoa troca a senha. Encerra as outras sessoes dela. */
export async function trocarSenha(input: {
  usuarioId: string;
  senhaAtual: string;
  novaSenha: string;
  /** Hash do token da sessao que fica viva (a atual). */
  manterSessaoTokenHash?: string | null;
  ator: Ator;
}) {
  const usuario = await prisma.user.findUniqueOrThrow({ where: { id: input.usuarioId } });
  if (!senhaConfere(input.senhaAtual, usuario.passwordHash)) {
    throw new ErroDeRegra("A senha atual nao confere.");
  }
  const problema = senhaForte(input.novaSenha);
  if (problema) throw new ErroDeRegra(problema);
  if (input.novaSenha === input.senhaAtual) {
    throw new ErroDeRegra("A nova senha precisa ser diferente da atual.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: usuario.id },
      data: { passwordHash: hashSenha(input.novaSenha), mustChangePassword: false },
    }),
    prisma.session.deleteMany({
      where: {
        userId: usuario.id,
        ...(input.manterSessaoTokenHash ? { tokenHash: { not: input.manterSessaoTokenHash } } : {}),
      },
    }),
  ]);

  await registrarAuditoria({
    entityType: "user",
    entityId: usuario.id,
    action: "senha_trocada",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    ipAddress: input.ator.ipAddress ?? null,
    userAgent: input.ator.userAgent ?? null,
  });
}

/** Admin define uma senha nova para alguem que esqueceu a sua. */
export async function redefinirSenha(input: {
  usuarioId: string;
  novaSenha: string;
  ator: Ator;
}) {
  const problema = senhaForte(input.novaSenha);
  if (problema) throw new ErroDeRegra(problema);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.usuarioId },
      data: { passwordHash: hashSenha(input.novaSenha), mustChangePassword: true },
    }),
    prisma.session.deleteMany({ where: { userId: input.usuarioId } }),
  ]);
  await registrarAuditoria({
    entityType: "user",
    entityId: input.usuarioId,
    action: "senha_redefinida",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
  });
}

export { normalizarFuncao };
