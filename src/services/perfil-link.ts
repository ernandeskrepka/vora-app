import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Link do perfil para o cliente: a grade do feed como vai ficar, sem login.
 *
 * Mesma ideia do link do relatorio: assinado com a ENCRYPTION_KEY para
 * ninguem trocar o cliente na barra de enderecos. Nao expira: o cliente
 * guarda o link e abre sempre que quiser ver como esta o planejamento.
 */
export function assinarPerfil(clienteId: string): string {
  const segredo = env.ENCRYPTION_KEY ?? "chave-local-de-desenvolvimento";
  return createHmac("sha256", segredo).update(`perfil:v1:${clienteId}`).digest("base64url");
}

export function assinaturaDoPerfilValida(clienteId: string, assinatura: string): boolean {
  const esperada = Buffer.from(assinarPerfil(clienteId));
  const recebida = Buffer.from(assinatura ?? "");
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}

export function linkDoPerfil(clienteId: string): string {
  const base = env.APP_URL.replace(/\/+$/, "");
  return `${base}/perfil/${clienteId}?a=${assinarPerfil(clienteId)}`;
}
