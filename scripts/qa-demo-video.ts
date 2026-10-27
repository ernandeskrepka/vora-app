import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db.ts";
import { tokenDoPedido } from "../src/lib/crypto.ts";
import { cancelarPost, criarPost, enviarParaAprovacao } from "../src/services/posts.ts";
import { registrarDecisao } from "../src/services/aprovacao.ts";

/**
 * Prepara o banco local para o video: tira os posts de teste de QA e cria
 * dois posts com arte de verdade para o Santa Rita, um aprovado pelo
 * cliente e um esperando aprovacao (para a tela do celular).
 */
const natalia = await prisma.user.findUniqueOrThrow({ where: { email: "natalia@vorabr.com" } });
const ernande = await prisma.user.findUniqueOrThrow({ where: { email: "ernandeskrepka@gmail.com" } });
const atorNatalia = { tipo: "USUARIO" as const, usuarioId: natalia.id, nome: natalia.name };
const atorErnande = { tipo: "USUARIO" as const, usuarioId: ernande.id, nome: ernande.name };

// 1. Posts de QA (legenda de teste) e aprovados velhos que nao sairam: cancela.
const deTeste = await prisma.post.findMany({
  where: {
    OR: [
      { caption: { contains: "fluxo QA" } },
      { status: { in: ["APROVADO", "PUBLICANDO"] }, scheduledAt: { lt: new Date() } },
    ],
    status: { notIn: ["CANCELADO", "PUBLICADO"] },
  },
});
for (const p of deTeste) {
  await cancelarPost({ postId: p.id, ator: atorErnande, motivo: "post de teste" });
}
console.log("cancelados:", deTeste.length);

// 2. Arte real do Santa Rita (pasta da demonstracao).
const base = ".storage/clientes/santa-rita-laboratorio/posts";
const artes = readdirSync(base)
  .flatMap((d) => readdirSync(join(base, d)).map((f) => join(base, d, f)))
  .filter((f) => f.endsWith(".jpg") && statSync(f).size > 80_000);
const cliente = await prisma.client.findFirstOrThrow({ where: { slug: "santa-rita" } });

async function post(caption: string, dias: number, arte: string) {
  const r = await criarPost({
    dados: {
      clientId: cliente.id,
      caption,
      formato: "IMAGEM_UNICA",
      networks: ["INSTAGRAM"],
      scheduledAt: new Date(Date.now() + dias * 86_400_000),
    },
    arquivos: [{ nome: "arte.jpg", mimeType: "image/jpeg", conteudo: readFileSync(arte) }],
    ator: atorNatalia,
  });
  await enviarParaAprovacao({ postId: r.postId, ator: atorNatalia, motivo: "primeiro_envio" });
  return r.postId;
}

const aprovado = await post(
  "Novembro Azul: cuidar da saude e um gesto de quem ama a vida. Agende seus exames e venha com a gente.",
  3,
  artes[0],
);
const pedido = await prisma.approvalRequest.findFirstOrThrow({ where: { postId: aprovado, status: "PENDENTE" } });
await registrarDecisao({
  token: tokenDoPedido(pedido.id),
  nome: "Ana Paula Vieira",
  decisao: "APROVADO",
  comentario: "Perfeito, pode seguir!",
  ipAddress: "177.22.10.41",
  userAgent: "WhatsApp/iPhone",
});

const pendente = await post(
  "Check-up completo com 12 exames por 150 reais. Sem fila, com resultado em ate 48h.",
  5,
  artes[1] ?? artes[0],
);
const pedido2 = await prisma.approvalRequest.findFirstOrThrow({ where: { postId: pendente, status: "PENDENTE" } });
console.log(JSON.stringify({ aprovado, pendente, clientId: cliente.id, token: tokenDoPedido(pedido2.id) }));
await prisma.$disconnect();
