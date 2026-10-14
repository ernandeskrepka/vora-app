import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Link do relatorio para o cliente.
 *
 * Mesma ideia do link de aprovacao: sem login, sem conta, aberto no celular.
 * A diferenca e que aqui nao ha nada a decidir, entao o link nao precisa ser
 * unico nem ficar guardado no banco - basta ser **assinado**, para que
 * ninguem troque o cliente ou a quinzena na barra de enderecos e veja o
 * relatorio de outra pessoa.
 *
 * A assinatura nao expira de proposito: relatorio e documento, o cliente volta
 * nele meses depois. Quem quiser derrubar todos os links de uma vez troca a
 * ENCRYPTION_KEY.
 */
export function assinarRelatorio(clienteId: string, quinzena: string): string {
  const segredo = env.ENCRYPTION_KEY ?? "chave-local-de-desenvolvimento";
  return createHmac("sha256", segredo)
    .update(`relatorio:v1:${clienteId}:${quinzena}`)
    .digest("base64url");
}

export function assinaturaDoRelatorioValida(
  clienteId: string,
  quinzena: string,
  assinatura: string,
): boolean {
  const esperada = Buffer.from(assinarRelatorio(clienteId, quinzena));
  const recebida = Buffer.from(assinatura ?? "");
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}

export async function linkDoRelatorio(clienteId: string, quinzena: string): Promise<string> {
  const base = env.APP_URL.replace(/\/+$/, "");
  return `${base}/relatorio/${clienteId}/${quinzena}?a=${assinarRelatorio(clienteId, quinzena)}`;
}
