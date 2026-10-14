import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { tokenDoPedido } from "../src/lib/crypto.ts";
import { registrarDecisao } from "../src/services/aprovacao.ts";
import { redis } from "../src/lib/queue/conexao.ts";

/**
 * Teste de fumaca do caminho completo, em desenvolvimento:
 * aprova o post pendente do seed com horario alguns segundos a frente e
 * deixa o worker publicar (em dry-run). Rode o worker em outro terminal.
 *
 *   npm run worker
 *   npx tsx scripts/smoke-publicacao.ts
 */
const pedido = await prisma.approvalRequest.findFirstOrThrow({
  where: { status: "PENDENTE" },
  include: { post: { include: { client: true } } },
  orderBy: { createdAt: "desc" },
});

const quando = new Date(Date.now() + 5_000);
await prisma.post.update({ where: { id: pedido.postId }, data: { scheduledAt: quando } });
await prisma.approvalRequest.update({
  where: { id: pedido.id },
  data: { expiresAt: new Date(Date.now() + 3_600_000) },
});

console.log(`Post: ${pedido.post.client.name} (${pedido.postId})`);
console.log(`Novo horario: ${quando.toISOString()}`);

await registrarDecisao({
  token: tokenDoPedido(pedido.id),
  nome: "Cliente do Teste",
  decisao: "APROVADO",
  ipAddress: "127.0.0.1",
  userAgent: "smoke-script",
});
console.log("Aprovado pelo cliente. Publicacao agendada na fila.");

for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 2_000));
  const post = await prisma.post.findUniqueOrThrow({
    where: { id: pedido.postId },
    include: { publications: true, publishAttempts: true },
  });
  console.log(`  [${i * 2}s] status=${post.status} publicacoes=${post.publications.length}`);
  if (post.status === "PUBLICADO" || post.status === "FALHOU") {
    for (const p of post.publications) {
      console.log(`  -> ${p.network}: ${p.externalId} ${p.dryRun ? "(dry-run)" : ""} ${p.permalink ?? ""}`);
    }
    break;
  }
}

await prisma.$disconnect();
await redis.quit();
