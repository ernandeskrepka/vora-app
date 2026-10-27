import { prisma } from "@/lib/db.ts";

export type AprovadoQueNaoSaiu = {
  id: string;
  cliente: string;
  fuso: string;
  scheduledAt: Date;
  motivo: string | null;
  quando: Date | null;
};

/**
 * Posts aprovados cujo horario ja passou e que continuam APROVADO: a
 * publicacao foi abortada na revalidacao (sem conexao com a Meta, criativo
 * fora da regra...) ou a agenda nao rodou. Aprovado que nao saiu nao pode
 * ficar invisivel - e o que o cliente vai cobrar.
 */
export async function aprovadosQueNaoSairam(agora = new Date()): Promise<AprovadoQueNaoSaiu[]> {
  const posts = await prisma.post.findMany({
    where: { status: { in: ["APROVADO", "PUBLICANDO"] }, scheduledAt: { lt: agora } },
    include: { client: { select: { name: true, timezone: true } } },
    orderBy: { scheduledAt: "desc" },
    take: 20,
  });
  if (posts.length === 0) return [];

  const abortos = await prisma.auditLog.findMany({
    where: { entityType: "post", entityId: { in: posts.map((p) => p.id) }, action: "publicacao_abortada" },
    orderBy: { createdAt: "desc" },
  });
  const ultimoAborto = new Map<string, (typeof abortos)[number]>();
  for (const a of abortos) if (!ultimoAborto.has(a.entityId)) ultimoAborto.set(a.entityId, a);

  return posts.map((p) => {
    const a = ultimoAborto.get(p.id);
    const meta = a?.metadata as { motivo?: string } | null | undefined;
    return {
      id: p.id,
      cliente: p.client.name,
      fuso: p.client.timezone,
      scheduledAt: p.scheduledAt,
      motivo: meta?.motivo ?? (p.status === "PUBLICANDO" ? "publicacao em andamento ha mais tempo que o normal" : null),
      quando: a?.createdAt ?? null,
    };
  });
}

/** Motivo do ultimo aborto de um post, para a pagina do post avisar. */
export async function motivoDoUltimoAborto(postId: string): Promise<{ motivo: string; quando: Date } | null> {
  const a = await prisma.auditLog.findFirst({
    where: { entityType: "post", entityId: postId, action: "publicacao_abortada" },
    orderBy: { createdAt: "desc" },
  });
  if (!a) return null;
  const meta = a.metadata as { motivo?: string } | null;
  return { motivo: meta?.motivo ?? "motivo nao registrado", quando: a.createdAt };
}
