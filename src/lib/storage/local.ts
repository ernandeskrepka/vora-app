import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";
import { assinarChave } from "./assinatura.ts";
import type { StorageDriver } from "./index.ts";

/**
 * Driver de desenvolvimento: grava em disco e serve por /api/media com
 * URL assinada e com prazo, igual ao comportamento do S3/R2.
 * Em producao use o driver s3 (a Meta precisa baixar a midia da internet).
 */
export function localStorageDriver(): StorageDriver {
  const base = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_LOCAL_DIR);

  const caminho = (key: string) => {
    const destino = path.resolve(/* turbopackIgnore: true */ base, key);
    if (!destino.startsWith(base)) throw new Error("Chave de midia invalida.");
    return destino;
  };

  return {
    nome: "local",
    async salvar(key, conteudo) {
      const destino = caminho(key);
      await mkdir(path.dirname(destino), { recursive: true });
      await writeFile(destino, conteudo);
    },
    async ler(key) {
      return readFile(caminho(key));
    },
    async remover(key) {
      await rm(caminho(key), { force: true });
    },
    async urlTemporaria(key, ttlSegundos = env.S3_SIGNED_URL_TTL_SECONDS) {
      const expiraEm = Math.floor(Date.now() / 1000) + ttlSegundos;
      const qs = new URLSearchParams({
        key,
        exp: String(expiraEm),
        sig: assinarChave(key, expiraEm),
      });
      return `${env.APP_URL}/api/media?${qs.toString()}`;
    },
  };
}
