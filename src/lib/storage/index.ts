import { env } from "@/env";
import { localStorageDriver } from "./local.ts";
import { netlifyStorageDriver } from "./netlify.ts";
import { s3StorageDriver } from "./s3.ts";

export { assinarChave, assinaturaValida } from "./assinatura.ts";

export type StorageDriver = {
  nome: "local" | "s3" | "netlify";
  salvar(key: string, conteudo: Buffer, contentType: string): Promise<void>;
  ler(key: string): Promise<Buffer>;
  remover(key: string): Promise<void>;
  /**
   * URL temporaria e publica do arquivo. A Meta baixa a midia dessa URL,
   * por isso ela precisa ser alcancavel da internet em producao.
   */
  urlTemporaria(key: string, ttlSegundos?: number): Promise<string>;
};

export const storage: StorageDriver =
  env.STORAGE_DRIVER === "s3"
    ? s3StorageDriver()
    : env.STORAGE_DRIVER === "netlify"
      ? netlifyStorageDriver()
      : localStorageDriver();

/** Caminho no storage: separado por cliente e post para facilitar limpeza. */
export function chaveDeMidia(input: {
  clientSlug: string;
  postId: string;
  posicao: number;
  extensao: string;
}): string {
  const { clientSlug, postId, posicao, extensao } = input;
  return `clientes/${clientSlug}/posts/${postId}/${String(posicao).padStart(2, "0")}.${extensao}`;
}
