import { prisma } from "@/lib/db.ts";
import {
  ACOES_SILENCIOSAS,
  detalheDoEvento,
  nomeDeQuemFez,
  rotuloDaAcao,
} from "@/domain/historico.ts";

export type EventoDoHistorico = {
  id: string;
  quando: Date;
  quem: string;
  tipoDeQuem: "USUARIO" | "CLIENTE" | "SISTEMA";
  acao: string;
  rotulo: string;
  detalhe: string | null;
  /** Cliente a que o evento se refere, quando da para saber. */
  cliente: { id: string; nome: string } | null;
  /** Post a que o evento se refere, quando houver. */
  postId: string | null;
};

/**
 * Atividade recente da equipe, lida do audit_log (que ninguem apaga).
 *
 * Sem cliente: feed geral do dashboard. Com cliente: tudo que aconteceu com
 * ele e com os posts dele. Login fica de fora do feed geral.
 */
export async function atividadeRecente(input: {
  limite?: number;
  clienteId?: string;
  /** Inclui login e outras acoes de rotina. */
  tudo?: boolean;
} = {}): Promise<EventoDoHistorico[]> {
  const limite = Math.min(input.limite ?? 20, 200);

  let filtro: Record<string, unknown> = {};
  if (input.clienteId) {
    const posts = await prisma.post.findMany({
      where: { clientId: input.clienteId },
      select: { id: true },
    });
    filtro = {
      OR: [
        { entityType: "client", entityId: input.clienteId },
        { entityType: "post", entityId: { in: posts.map((p) => p.id) } },
      ],
    };
  }
  if (!input.tudo) {
    filtro = { ...filtro, action: { notIn: [...ACOES_SILENCIOSAS] } };
  }

  const linhas = await prisma.auditLog.findMany({
    where: filtro,
    orderBy: { createdAt: "desc" },
    take: limite,
  });

  // Nome do cliente: pelo post ou direto, numa consulta so de cada.
  const postIds = [...new Set(linhas.filter((l) => l.entityType === "post").map((l) => l.entityId))];
  const clientIds = new Set(linhas.filter((l) => l.entityType === "client").map((l) => l.entityId));
  const posts = postIds.length
    ? await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, clientId: true, client: { select: { name: true } } },
      })
    : [];
  for (const p of posts) clientIds.add(p.clientId);
  const clientes = clientIds.size
    ? await prisma.client.findMany({
        where: { id: { in: [...clientIds] } },
        select: { id: true, name: true },
      })
    : [];
  const nomeDoCliente = new Map(clientes.map((c) => [c.id, c.name]));
  const clienteDoPost = new Map(posts.map((p) => [p.id, p.clientId]));

  return linhas.map((l) => {
    const clienteId =
      l.entityType === "client" ? l.entityId : l.entityType === "post" ? clienteDoPost.get(l.entityId) : undefined;
    const nome = clienteId ? nomeDoCliente.get(clienteId) : undefined;
    return {
      id: l.id,
      quando: l.createdAt,
      quem: nomeDeQuemFez({ actorType: l.actorType, actorName: l.actorName }),
      tipoDeQuem: l.actorType,
      acao: l.action,
      rotulo: rotuloDaAcao(l.action),
      detalhe: detalheDoEvento(l.action, l.metadata),
      cliente: clienteId && nome ? { id: clienteId, nome } : null,
      postId: l.entityType === "post" ? l.entityId : null,
    };
  });
}
