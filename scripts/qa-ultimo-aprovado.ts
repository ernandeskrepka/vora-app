import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { tokenDoPedido } from "../src/lib/crypto.ts";

/** Apoio ao video: ultimo post com arte e o link de aprovacao pendente mais recente. */
const p = await prisma.post.findFirst({
  where: { status: { in: ["APROVADO", "AGUARDANDO_APROVACAO"] }, media: { some: {} } },
  orderBy: { createdAt: "desc" },
});
const pend = await prisma.approvalRequest.findFirst({
  where: { status: "PENDENTE", expiresAt: { gt: new Date() } },
  orderBy: { createdAt: "desc" },
});
console.log(JSON.stringify({ postId: p?.id, clientId: p?.clientId, token: pend ? tokenDoPedido(pend.id) : null }));
await prisma.$disconnect();
