import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db.ts";
import { hashSenha, hashToken, tokenDoPedido } from "@/lib/crypto.ts";
import type { Network, PostFormat, PostStatus } from "@/lib/tipos.ts";

/** Zera o banco de teste entre os casos. */
export async function limparBanco() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.planningItem.deleteMany(),
    prisma.clientAsset.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.approvalDecision.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.publishAttempt.deleteMany(),
    prisma.postPublication.deleteMany(),
    prisma.postMedia.deleteMany(),
    prisma.post.deleteMany(),
    prisma.adInsightDaily.deleteMany(),
    prisma.metaConnection.deleteMany(),
    prisma.clientContact.deleteMany(),
    prisma.client.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.teamTask.deleteMany(),
  ]);
}

export async function criarUsuario() {
  return prisma.user.create({
    data: {
      name: "Equipe Teste",
      email: `teste-${randomUUID().slice(0, 8)}@vorabr.com`,
      passwordHash: hashSenha("senha-de-teste-123"),
      role: "ADMIN",
    },
  });
}

export async function criarClienteCompleto(opcoes?: {
  nome?: string;
  conectado?: boolean;
  comAprovador?: boolean;
}) {
  const nome = opcoes?.nome ?? "Cliente Teste";
  const status = opcoes?.conectado === false ? "EXPIRADO" : "CONECTADO";

  return prisma.client.create({
    data: {
      name: nome,
      slug: `cliente-${randomUUID().slice(0, 8)}`,
      contacts:
        opcoes?.comAprovador === false
          ? undefined
          : {
              create: [
                {
                  name: "Aprovador Teste",
                  phoneE164: "5549999990000",
                  isApprover: true,
                  receivesReminders: true,
                },
              ],
            },
      metaConnections: {
        create: [
          { assetType: "INSTAGRAM", assetId: "17841400000000099", status, authMode: "SYSTEM_USER" },
          { assetType: "FACEBOOK_PAGE", assetId: "100000000000099", status, authMode: "SYSTEM_USER" },
        ],
      },
    },
    include: { contacts: true, metaConnections: true },
  });
}

/** Cria um post direto no banco, com midia, em qualquer status. */
export async function criarPostNoBanco(input: {
  clientId: string;
  status?: PostStatus;
  horasAFrente?: number;
  networks?: Network[];
  formato?: PostFormat;
  version?: number;
  caption?: string;
}) {
  const post = await prisma.post.create({
    data: {
      clientId: input.clientId,
      caption: input.caption ?? "Legenda de teste",
      format: input.formato ?? "IMAGEM_UNICA",
      networks: input.networks ?? ["INSTAGRAM"],
      scheduledAt: new Date(Date.now() + (input.horasAFrente ?? 24) * 3_600_000),
      status: input.status ?? "RASCUNHO",
      version: input.version ?? 1,
    },
  });

  await prisma.postMedia.create({
    data: {
      postId: post.id,
      position: 0,
      kind: "IMAGEM",
      storageKey: `teste/${post.id}/00.jpg`,
      mimeType: "image/jpeg",
      width: 1080,
      height: 1080,
      sizeBytes: 250_000,
    },
  });

  return post;
}

/** Pedido de aprovacao pendente, devolvendo o token do link. */
export async function criarPedidoPendente(input: { postId: string; postVersion?: number; expiraEmHoras?: number }) {
  const id = randomUUID();
  const token = tokenDoPedido(id);
  const pedido = await prisma.approvalRequest.create({
    data: {
      id,
      postId: input.postId,
      postVersion: input.postVersion ?? 1,
      tokenHash: hashToken(token),
      status: "PENDENTE",
      channel: "LOG",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + (input.expiraEmHoras ?? 24) * 3_600_000),
    },
  });
  return { pedido, token };
}

/** Marca o post como aprovado pelo cliente, como o fluxo real faria. */
export async function aprovarNoBanco(input: { postId: string; postVersion?: number; nome?: string }) {
  const { pedido } = await criarPedidoPendente({
    postId: input.postId,
    postVersion: input.postVersion ?? 1,
  });
  await prisma.approvalRequest.update({
    where: { id: pedido.id },
    data: { status: "DECIDIDO", decidedAt: new Date() },
  });
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: pedido.id,
      postId: input.postId,
      postVersion: input.postVersion ?? 1,
      decision: "APROVADO",
      approverName: input.nome ?? "Cliente Teste",
      ipAddress: "200.0.0.1",
      userAgent: "vitest",
    },
  });
  await prisma.post.update({
    where: { id: input.postId },
    data: { status: "APROVADO", approvedAt: new Date() },
  });
}

export const ATOR_EQUIPE = {
  tipo: "USUARIO" as const,
  nome: "Equipe Teste",
  ipAddress: "10.0.0.1",
  userAgent: "vitest",
};
