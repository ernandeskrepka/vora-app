import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db.ts";
import { gerarToken, hashToken, senhaConfere } from "@/lib/crypto.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import type { Usuario } from "@/lib/tipos.ts";

export const COOKIE_SESSAO = "vora_sessao";
const DIAS_DE_SESSAO = 7;

export type UsuarioLogado = Pick<Usuario, "id" | "name" | "email" | "role">;

/**
 * Sessao guardada no banco (hash do token no banco, token puro no cookie).
 * Encerrar uma sessao e apagar uma linha, sem depender de expiracao de JWT.
 */
export async function autenticar(input: {
  email: string;
  senha: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true; usuario: UsuarioLogado } | { ok: false; motivo: string }> {
  const email = input.email.trim().toLowerCase();
  const usuario = await prisma.user.findUnique({ where: { email } });

  // Mensagem unica para nao revelar quais e-mails existem.
  const generica = "E-mail ou senha incorretos.";
  if (!usuario || !usuario.active) return { ok: false, motivo: generica };
  if (!senhaConfere(input.senha, usuario.passwordHash)) return { ok: false, motivo: generica };

  const token = gerarToken();
  const expiresAt = new Date(Date.now() + DIAS_DE_SESSAO * 86_400_000);

  await prisma.session.create({
    data: {
      userId: usuario.id,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
  await prisma.user.update({ where: { id: usuario.id }, data: { lastLoginAt: new Date() } });
  await registrarAuditoria({
    entityType: "user",
    entityId: usuario.id,
    action: "login",
    actorType: "USUARIO",
    actorUserId: usuario.id,
    actorName: usuario.name,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return {
    ok: true,
    usuario: { id: usuario.id, name: usuario.name, email: usuario.email, role: usuario.role },
  };
}

export async function usuarioAtual(): Promise<UsuarioLogado | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;

  const sessao = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!sessao || sessao.expiresAt < new Date() || !sessao.user.active) return null;

  return {
    id: sessao.user.id,
    name: sessao.user.name,
    email: sessao.user.email,
    role: sessao.user.role,
  };
}

/** Use nas paginas e acoes do painel. Manda para o login se nao houver sessao. */
export async function exigirUsuario(): Promise<UsuarioLogado> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  return usuario;
}

export async function exigirAdmin(): Promise<UsuarioLogado> {
  const usuario = await exigirUsuario();
  if (usuario.role !== "ADMIN") redirect("/");
  return usuario;
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(COOKIE_SESSAO);
}

/** IP e user agent da requisicao atual (contexto de servidor do Next). */
export async function contextoDaRequisicao() {
  const h = await headers();
  const encaminhado = h.get("x-forwarded-for");
  return {
    ipAddress: encaminhado?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}
