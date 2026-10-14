import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { redis } from "../src/lib/queue/conexao.ts";
import { agendarCorteSemResposta } from "../src/lib/queue/filas.ts";
import { enviarParaAprovacao } from "../src/services/posts.ts";

/**
 * Teste de fumaca da regra principal: silencio nunca publica.
 * Manda um rascunho para aprovacao, coloca o horario a poucos segundos e
 * nao responde. O worker tem que marcar POST SEM RESPOSTA, sem publicar.
 *
 *   npm run worker
 *   npx tsx scripts/smoke-sem-resposta.ts
 */
const post = await prisma.post.findFirstOrThrow({
  where: { status: "RASCUNHO" },
  include: { client: true },
});

await enviarParaAprovacao({
  postId: post.id,
  ator: { tipo: "USUARIO", nome: "Teste de fumaca" },
});

const quando = new Date(Date.now() + 5_000);
await prisma.post.update({ where: { id: post.id }, data: { scheduledAt: quando } });
await agendarCorteSemResposta({ postId: post.id, postVersion: post.version, quando });

console.log(`Post: ${post.client.name} (${post.id})`);
console.log(`Horario: ${quando.toISOString()} - ninguem vai responder.`);

for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 2_000));
  const atual = await prisma.post.findUniqueOrThrow({
    where: { id: post.id },
    include: { publications: true },
  });
  console.log(`  [${i * 2}s] status=${atual.status} publicacoes=${atual.publications.length}`);
  if (atual.status === "POST_SEM_RESPOSTA") {
    console.log(
      atual.publications.length === 0
        ? "  -> correto: nada foi publicado."
        : "  -> ERRO: publicou sem aprovacao!",
    );
    break;
  }
}

await prisma.$disconnect();
await redis.quit();
