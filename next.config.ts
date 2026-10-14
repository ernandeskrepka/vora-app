import type { NextConfig } from "next";

/**
 * Hosts aceitos nas Server Actions.
 *
 * O Next recusa uma Server Action quando o `origin` do navegador nao bate com
 * o host do servidor (protecao de CSRF). Isso acontece ao testar o site dentro
 * da previa do painel da Netlify, que serve a pagina num iframe em
 * `embed-<deploy>--<site>.netlify.app` enquanto o POST vai para
 * `<deploy>--<site>.netlify.app`.
 *
 * Em vez de afrouxar a protecao com curinga, montamos a lista no build a
 * partir dos enderecos que a propria Netlify entrega (URL, DEPLOY_URL,
 * DEPLOY_PRIME_URL) mais a variante `embed-` de cada um. Fora da Netlify essas
 * variaveis nao existem e a lista fica vazia, mantendo so a origem igual.
 */
function origensPermitidas(): string[] {
  const candidatos = [
    process.env.URL,
    process.env.DEPLOY_URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.APP_URL,
  ];
  const hosts = new Set<string>();
  for (const candidato of candidatos) {
    if (!candidato) continue;
    try {
      const { host } = new URL(candidato);
      hosts.add(host);
      hosts.add(`embed-${host}`);
    } catch {
      // Endereco invalido na variavel: ignora em vez de quebrar o build.
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis", "sharp", "@prisma/adapter-pg"],
  experimental: {
    serverActions: {
      // Uploads de criativo (carrossel com varios arquivos).
      bodySizeLimit: "25mb",
      allowedOrigins: origensPermitidas(),
    },
  },
};

export default nextConfig;
