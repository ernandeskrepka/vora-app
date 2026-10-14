import { createHmac } from "node:crypto";
import { env } from "@/env";

/**
 * Assinatura usada pelo driver local para imitar a URL assinada do S3/R2:
 * a URL vale por um prazo e nao pode ser alterada.
 */
export function assinarChave(key: string, expiraEm: number): string {
  const segredo = env.ENCRYPTION_KEY ?? "chave-local-de-desenvolvimento";
  return createHmac("sha256", segredo).update(`${key}:${expiraEm}`).digest("base64url");
}

export function assinaturaValida(key: string, expiraEm: number, assinatura: string): boolean {
  if (!Number.isFinite(expiraEm) || expiraEm * 1000 < Date.now()) return false;
  return assinarChave(key, expiraEm) === assinatura;
}
