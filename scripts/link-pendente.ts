import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { tokenDoPedido } from "../src/lib/crypto.ts";
import { env } from "../src/env.ts";

/**
 * Utilitario de desenvolvimento: mostra o link de aprovacao dos pedidos em
 * aberto (em producao o cliente recebe por WhatsApp).
 */
const pedidos = await prisma.approvalRequest.findMany({
  where: { status: "PENDENTE" },
  include: { post: { include: { client: true } } },
  orderBy: { createdAt: "desc" },
});

if (pedidos.length === 0) console.log("Nenhum pedido de aprovacao em aberto.");
for (const p of pedidos) {
  console.log(`${p.post.client.name}: ${env.APP_URL.replace(/\/$/, "")}/aprovar/${tokenDoPedido(p.id)}`);
}

await prisma.$disconnect();
