import { prisma } from "@/lib/db.ts";
import { registrarAuditoria, type ActorType } from "@/lib/audit.ts";
import { ConflitoDeEstadoError } from "./erros.ts";
import { aplicarEventoOuFalhar, type PostEvento, type PostStatus } from "@/domain/post-status.ts";
import type { Prisma } from "@/generated/prisma/client.ts";

export type Ator = {
  tipo: ActorType;
  usuarioId?: string | null;
  nome?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type ClientePrisma = Prisma.TransactionClient | typeof prisma;

/**
 * Unico caminho para mudar o status de um post.
 *
 * - valida a transicao na maquina de estados;
 * - escreve condicionando ao status lido (se outro processo mudou o post no
 *   meio, a escrita nao acontece e levantamos ConflitoDeEstadoError);
 * - registra auditoria.
 */
export async function aplicarTransicao(
  tx: ClientePrisma,
  input: {
    post: { id: string; status: PostStatus; version: number };
    evento: PostEvento;
    ator: Ator;
    acao?: string;
    metadata?: Prisma.InputJsonValue;
    dadosExtra?: Prisma.PostUpdateInput;
  },
): Promise<PostStatus> {
  const novoStatus = aplicarEventoOuFalhar(input.post.status, input.evento);

  const r = await tx.post.updateMany({
    where: { id: input.post.id, status: input.post.status, version: input.post.version },
    data: { status: novoStatus, ...(input.dadosExtra ?? {}) },
  });

  if (r.count === 0) throw new ConflitoDeEstadoError();

  await registrarAuditoria(
    {
      entityType: "post",
      entityId: input.post.id,
      action: input.acao ?? input.evento,
      actorType: input.ator.tipo,
      actorUserId: input.ator.usuarioId ?? null,
      actorName: input.ator.nome ?? null,
      fromStatus: input.post.status,
      toStatus: novoStatus,
      metadata: input.metadata,
      ipAddress: input.ator.ipAddress ?? null,
      userAgent: input.ator.userAgent ?? null,
    },
    tx,
  );

  return novoStatus;
}
