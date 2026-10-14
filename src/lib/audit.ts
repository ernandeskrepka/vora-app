import { prisma } from "@/lib/db.ts";
import type { Prisma } from "@/generated/prisma/client.ts";

export type ActorType = "USUARIO" | "CLIENTE" | "SISTEMA";

export type EntradaAuditoria = {
  entityType: "post" | "client" | "user" | "meta_connection" | "approval_request";
  entityId: string;
  action: string;
  actorType: ActorType;
  actorUserId?: string | null;
  actorName?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type ClientePrisma = Pick<typeof prisma, "auditLog">;

/**
 * Registro imutavel. Nenhum fluxo do sistema apaga nem edita auditoria:
 * e o que protege a agencia numa discussao sobre o que foi aprovado.
 */
export async function registrarAuditoria(
  entrada: EntradaAuditoria,
  tx: ClientePrisma = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      entityType: entrada.entityType,
      entityId: entrada.entityId,
      action: entrada.action,
      actorType: entrada.actorType,
      actorUserId: entrada.actorUserId ?? null,
      actorName: entrada.actorName ?? null,
      fromStatus: entrada.fromStatus ?? null,
      toStatus: entrada.toStatus ?? null,
      metadata: entrada.metadata,
      ipAddress: entrada.ipAddress ?? null,
      userAgent: entrada.userAgent ?? null,
    },
  });
}

/** Extrai IP e user agent de uma requisicao, para a trilha de auditoria. */
export function dadosDaRequisicao(headers: Headers) {
  const encaminhado = headers.get("x-forwarded-for");
  const ip = encaminhado?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;
  return { ipAddress: ip, userAgent: headers.get("user-agent") };
}
