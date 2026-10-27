import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { processarPendencias } from "../src/services/agenda.ts";

/**
 * Apoio ao teste de ponta a ponta: puxa o horario de um post aprovado para
 * o passado e roda a agenda uma vez (o que o cron faz de minuto em minuto).
 *
 *   npx tsx scripts/qa-agenda.ts <postId>
 */
const postId = process.argv[2];
if (postId) {
  await prisma.post.update({
    where: { id: postId },
    data: { scheduledAt: new Date(Date.now() - 60_000) },
  });
}
console.log(JSON.stringify(await processarPendencias()));
await prisma.$disconnect();
