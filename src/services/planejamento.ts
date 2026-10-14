import { prisma } from "@/lib/db.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { podeMover, podeVirarPost, type StatusPauta } from "@/domain/planejamento.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

/** Quadro do cliente: pautas em producao, mais o que ja virou post. */
export async function carregarQuadro(clientId: string) {
  const [pautas, arquivadas] = await Promise.all([
    prisma.planningItem.findMany({
      where: { clientId, status: { notIn: ["ARQUIVADO"] } },
      include: { post: { select: { id: true, status: true, scheduledAt: true } } },
      orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.planningItem.count({ where: { clientId, status: "ARQUIVADO" } }),
  ]);
  return { pautas, arquivadas };
}

export async function criarPauta(input: {
  clientId: string;
  titulo: string;
  notas?: string | null;
  data?: Date | null;
  ator: Ator;
}) {
  const titulo = input.titulo.trim();
  if (titulo.length < 3) throw new ErroDeRegra("Escreva um titulo para a pauta.");

  const pauta = await prisma.planningItem.create({
    data: {
      clientId: input.clientId,
      title: titulo,
      notes: input.notas?.trim() || null,
      targetDate: input.data ?? null,
      createdById: input.ator.usuarioId ?? null,
    },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: input.clientId,
    action: "pauta_criada",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { pautaId: pauta.id, titulo },
  });

  return pauta;
}

export async function moverPauta(input: { pautaId: string; para: StatusPauta; ator: Ator }) {
  const pauta = await prisma.planningItem.findUniqueOrThrow({ where: { id: input.pautaId } });

  if (!podeMover(pauta.status as StatusPauta, input.para)) {
    throw new ErroDeRegra(`Nao da para mover de "${pauta.status}" para "${input.para}".`);
  }

  const atualizada = await prisma.planningItem.update({
    where: { id: pauta.id },
    data: { status: input.para },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: pauta.clientId,
    action: "pauta_movida",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    fromStatus: pauta.status,
    toStatus: input.para,
    metadata: { pautaId: pauta.id, titulo: pauta.title },
  });

  return atualizada;
}

export async function atualizarPauta(input: {
  pautaId: string;
  titulo?: string;
  notas?: string | null;
  data?: Date | null;
  ator: Ator;
}) {
  return prisma.planningItem.update({
    where: { id: input.pautaId },
    data: {
      ...(input.titulo ? { title: input.titulo.trim() } : {}),
      ...(input.notas !== undefined ? { notes: input.notas?.trim() || null } : {}),
      ...(input.data !== undefined ? { targetDate: input.data } : {}),
    },
  });
}

export async function removerPauta(input: { pautaId: string; ator: Ator }) {
  const pauta = await prisma.planningItem.delete({ where: { id: input.pautaId } });
  await registrarAuditoria({
    entityType: "client",
    entityId: pauta.clientId,
    action: "pauta_removida",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { titulo: pauta.title },
  });
}

/** Liga a pauta ao post criado a partir dela. */
export async function marcarPautaComoPost(input: { pautaId: string; postId: string; ator: Ator }) {
  const pauta = await prisma.planningItem.findUniqueOrThrow({ where: { id: input.pautaId } });
  if (!podeVirarPost(pauta.status as StatusPauta)) {
    throw new ErroDeRegra("So uma pauta em producao ou pronta vira post.");
  }

  await prisma.planningItem.update({
    where: { id: pauta.id },
    data: { status: "VIROU_POST", postId: input.postId },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: pauta.clientId,
    action: "pauta_virou_post",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    fromStatus: pauta.status,
    toStatus: "VIROU_POST",
    metadata: { pautaId: pauta.id, postId: input.postId },
  });
}
