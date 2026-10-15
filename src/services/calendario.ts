import { prisma } from "@/lib/db.ts";
import type { PostStatus } from "@/domain/post-status.ts";
import type { StatusPauta } from "@/domain/planejamento.ts";
import { resumoDaLegenda } from "@/domain/legenda.ts";

/**
 * O calendario geral da agencia: todos os clientes numa grade so.
 *
 * Mostra duas coisas, com cara diferente:
 *
 * - **post**: ja existe no fluxo de aprovacao, tem status e horario. E o
 *   que vai (ou foi) para o ar.
 * - **pauta com data**: ainda e planejamento - veio do cronograma do Notion
 *   ou foi escrita a mao no quadro, e ainda nao tem criativo nem aprovacao.
 *
 * Sem a pauta na grade, o calendario so mostraria o que ja virou post, e a
 * maior parte do cronograma do Notion entra como pauta. A equipe veria um
 * mes vazio que na verdade esta planejado.
 */

export type PostNoCalendario = {
  tipo: "post";
  id: string;
  clienteId: string;
  cliente: string;
  fuso: string;
  quando: Date;
  status: PostStatus;
  resumo: string;
};

export type PautaNoCalendario = {
  tipo: "pauta";
  id: string;
  clienteId: string;
  cliente: string;
  fuso: string;
  quando: Date;
  status: StatusPauta;
  titulo: string;
  /** Veio da sincronizacao com o Notion. */
  doNotion: boolean;
};

export type ItemDoCalendarioGeral = PostNoCalendario | PautaNoCalendario;

export async function carregarCalendario(input: {
  inicio: Date;
  fim: Date;
  clienteId?: string;
}): Promise<{
  posts: PostNoCalendario[];
  pautas: PautaNoCalendario[];
  /** Posts e pautas juntos, em ordem de data. */
  itens: ItemDoCalendarioGeral[];
}> {
  const porCliente = input.clienteId ? { clientId: input.clienteId } : {};

  const [posts, pautas] = await Promise.all([
    prisma.post.findMany({
      where: {
        scheduledAt: { gte: input.inicio, lt: input.fim },
        ...porCliente,
      },
      include: { client: { select: { id: true, name: true, timezone: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.planningItem.findMany({
      where: {
        targetDate: { gte: input.inicio, lt: input.fim },
        // Pauta que virou post ja aparece como post; arquivada saiu do plano.
        status: { in: ["IDEIA", "EM_PRODUCAO", "PRONTO"] },
        ...porCliente,
      },
      include: { client: { select: { id: true, name: true, timezone: true } } },
      orderBy: { targetDate: "asc" },
    }),
  ]);

  const postsNoCalendario: PostNoCalendario[] = posts.map((p) => ({
    tipo: "post",
    id: p.id,
    clienteId: p.client.id,
    cliente: p.client.name,
    fuso: p.client.timezone,
    quando: p.scheduledAt,
    status: p.status as PostStatus,
    resumo: resumoDaLegenda(p.caption),
  }));

  const pautasNoCalendario: PautaNoCalendario[] = pautas.map((p) => ({
    tipo: "pauta",
    id: p.id,
    clienteId: p.client.id,
    cliente: p.client.name,
    fuso: p.client.timezone,
    // O filtro garante a data; o "!" so conta isso ao TypeScript.
    quando: p.targetDate!,
    status: p.status as StatusPauta,
    titulo: p.title,
    doNotion: p.source === "notion",
  }));

  const itens: ItemDoCalendarioGeral[] = [
    ...postsNoCalendario,
    ...pautasNoCalendario,
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime());

  return { posts: postsNoCalendario, pautas: pautasNoCalendario, itens };
}

/** Quando cada cliente foi lido do Notion pela ultima vez - para a tela dizer. */
export async function situacaoDoNotion(): Promise<{
  comPagina: number;
  semPagina: number;
  maisAntiga: Date | null;
  maisRecente: Date | null;
  nuncaLidos: number;
}> {
  const clientes = await prisma.client.findMany({
    where: { active: true },
    select: { notionPageId: true, notionSyncedAt: true },
  });

  const comPagina = clientes.filter((c) => c.notionPageId);
  const datas = comPagina
    .map((c) => c.notionSyncedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    comPagina: comPagina.length,
    semPagina: clientes.length - comPagina.length,
    maisAntiga: datas[0] ?? null,
    maisRecente: datas[datas.length - 1] ?? null,
    nuncaLidos: comPagina.length - datas.length,
  };
}
