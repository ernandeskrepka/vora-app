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

const driver: StorageDriver =
  env.STORAGE_DRIVER === "s3"
    ? s3StorageDriver()
    : env.STORAGE_DRIVER === "netlify"
      ? netlifyStorageDriver()
      : localStorageDriver();

/**
 * Prefixo da midia de demonstracao, que mora em public/demonstracao e e
 * servida como arquivo estatico. Fica fora do driver de proposito: e material
 * versionado no repositorio, nao upload de cliente, entao nao deve ocupar
 * Blobs nem bucket, nem ser apagado junto com um post.
 */
export const PREFIXO_DEMO = "demonstracao/";

export const storage: StorageDriver = {
  ...driver,
  async urlTemporaria(key, ttlSegundos) {
    if (key.startsWith(PREFIXO_DEMO)) return `/${key}`;
    return driver.urlTemporaria(key, ttlSegundos);
  },
  async ler(key) {
    if (key.startsWith(PREFIXO_DEMO)) {
      const { readFile } = await import("node:fs/promises");
      const path = await import("node:path");
      return readFile(path.join(process.cwd(), "public", key));
    }
    return driver.ler(key);
  },
  async remover(key) {
    // Midia de demonstracao e do repositorio: apagar post nao apaga o arquivo.
    if (key.startsWith(PREFIXO_DEMO)) return;
    return driver.remover(key);
  },
};

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
