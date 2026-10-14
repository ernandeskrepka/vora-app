import { env } from "@/env";
import type { StorageDriver } from "./index.ts";

/**
 * Netlify Blobs: usado quando o app roda em funcoes serverless, onde nao
 * existe disco. A leitura passa pela rota /api/media, que assina a URL do
 * mesmo jeito que o driver local.
 */
export function netlifyStorageDriver(): StorageDriver {
  // Import tardio: o pacote so existe quando o app roda na Netlify.
  async function store() {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: "vora-midia", consistency: "strong" });
  }

  return {
    nome: "netlify",
    async salvar(key, conteudo, contentType) {
      const s = await store();
      await s.set(key, new Blob([new Uint8Array(conteudo)], { type: contentType }));
    },
    async ler(key) {
      const s = await store();
      const dado = await s.get(key, { type: "arrayBuffer" });
      if (!dado) throw new Error(`Arquivo nao encontrado: ${key}`);
      return Buffer.from(dado);
    },
    async remover(key) {
      const s = await store();
      await s.delete(key);
    },
    async urlTemporaria(key, ttlSegundos = env.S3_SIGNED_URL_TTL_SECONDS) {
      const { assinarChave } = await import("./assinatura.ts");
      const expiraEm = Math.floor(Date.now() / 1000) + ttlSegundos;
      const qs = new URLSearchParams({
        key,
        exp: String(expiraEm),
        sig: assinarChave(key, expiraEm),
      });
      return `${env.APP_URL.replace(/\/$/, "")}/api/media?${qs.toString()}`;
    },
  };
}
