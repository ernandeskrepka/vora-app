import { prisma } from "@/lib/db.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { idDaPagina, lerPagina, type LinhaDaPagina } from "@/lib/notion/client.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

export type ItemDoCalendario = {
  /** Dia previsto, ja resolvido para um ano. */
  data: Date;
  titulo: string;
  formato: string | null;
  notas: string;
};

const DIAS_DA_SEMANA =
  "segunda-feira|terca-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sabado|sábado|domingo|segunda|terca|terça|quarta|quinta|sexta";

/**
 * Linha de dia no planejamento da VORA, nos formatos que aparecem de verdade:
 *
 *   ## Sexta-feira — 09/10 | Um passeio pela loja
 *   Segunda-feira — 26/10 \| O cantinho do descanso
 *   09/10 - Tour pela loja
 *
 * O travessao pode ser "—" ou "-", a barra pode vir escapada, e o dia da
 * semana e opcional (as vezes a pessoa so escreve a data).
 */
const LINHA_DE_DIA = new RegExp(
  String.raw`^\s*(?:#+\s*)?(?:(?:${DIAS_DA_SEMANA})\s*[—–-]\s*)?` +
    String.raw`(\d{1,2})[/\.](\d{1,2})(?:[/\.](\d{2,4}))?\s*` +
    String.raw`(?:\\?\||[—–-])\s*(.+?)\s*$`,
  "i",
);

const LINHA_DE_FORMATO = /^\s*\**\s*formato\s*:?\**\s*:?\s*(.+?)\s*$/i;

/**
 * Resolve o ano de um dia/mes sem ano: usa o ano de referencia e, se a data
 * cair muito para tras, assume que o planejamento e do ano seguinte. Sem isso,
 * um cronograma de janeiro lido em dezembro entraria com 11 meses de atraso.
 */
function resolverData(dia: number, mes: number, ano: number | null, referencia: Date): Date | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  if (ano !== null) {
    const completo = ano < 100 ? 2000 + ano : ano;
    const d = new Date(completo, mes - 1, dia, 9, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let candidato = new Date(referencia.getFullYear(), mes - 1, dia, 9, 0, 0, 0);
  const seisMesesAtras = new Date(referencia);
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);
  if (candidato < seisMesesAtras) {
    candidato = new Date(referencia.getFullYear() + 1, mes - 1, dia, 9, 0, 0, 0);
  }
  return Number.isNaN(candidato.getTime()) ? null : candidato;
}

/**
 * Transforma as linhas da pagina do Notion na lista de itens de pauta.
 *
 * Funcao pura de proposito: da para testar o jeito que a equipe escreve sem
 * tocar na rede nem no banco.
 */
export function interpretarCalendario(
  linhas: LinhaDaPagina[],
  referencia: Date = new Date(),
): ItemDoCalendario[] {
  const itens: ItemDoCalendario[] = [];
  let atual: ItemDoCalendario | null = null;

  for (const linha of linhas) {
    const achado = linha.texto.match(LINHA_DE_DIA);
    if (achado) {
      const data = resolverData(
        Number(achado[1]),
        Number(achado[2]),
        achado[3] ? Number(achado[3]) : null,
        referencia,
      );
      const titulo = achado[4].replace(/\\\|/g, "|").trim();
      if (data && titulo) {
        atual = { data, titulo, formato: null, notas: "" };
        itens.push(atual);
        continue;
      }
    }

    if (!atual) continue;

    const formato = linha.texto.match(LINHA_DE_FORMATO);
    if (formato && !atual.formato) {
      atual.formato = formato[1].replace(/\*/g, "").trim();
      continue;
    }

    atual.notas = atual.notas ? `${atual.notas}\n${linha.texto}` : linha.texto;
  }

  // Corta o que nao tem conteudo nenhum: linha de data solta nao e pauta.
  return itens.map((i) => ({ ...i, notas: i.notas.slice(0, 1800) }));
}

export type ResultadoSincronizacao = {
  cliente: string;
  lidos: number;
  criados: number;
  atualizados: number;
  jaEramPost: number;
};

/**
 * Traz o calendario do cliente no Notion para o planejamento do sistema.
 *
 * Idempotente e conservador: casa pelo titulo dentro do mesmo cliente,
 * atualiza data/notas do que ainda e pauta e **nao mexe** no que ja virou post
 * - mudar a data de um post agendado tem que passar pelo reagendamento, que
 * invalida a aprovacao do cliente.
 */
export async function sincronizarCalendarioDoNotion(input: {
  clienteId: string;
  ator: Ator;
  referencia?: Date;
}): Promise<ResultadoSincronizacao> {
  const cliente = await prisma.client.findUniqueOrThrow({ where: { id: input.clienteId } });
  const pageId = cliente.notionPageId ? idDaPagina(cliente.notionPageId) : null;
  if (!pageId) {
    throw new ErroDeRegra(
      "Esse cliente nao tem pagina do Notion configurada. Cole o link do planejamento em Ajustes.",
    );
  }

  const linhas = await lerPagina(pageId);
  const itens = interpretarCalendario(linhas, input.referencia ?? new Date());

  const r: ResultadoSincronizacao = {
    cliente: cliente.name,
    lidos: itens.length,
    criados: 0,
    atualizados: 0,
    jaEramPost: 0,
  };

  for (const item of itens) {
    const existente = await prisma.planningItem.findFirst({
      where: { clientId: cliente.id, title: item.titulo },
    });

    const notas = [item.formato ? `Formato: ${item.formato}` : null, item.notas]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!existente) {
      await prisma.planningItem.create({
        data: {
          clientId: cliente.id,
          title: item.titulo,
          notes: notas || null,
          targetDate: item.data,
          status: "IDEIA",
        },
      });
      r.criados += 1;
      continue;
    }

    if (existente.postId) {
      r.jaEramPost += 1;
      continue;
    }

    const mudou =
      existente.notes !== (notas || null) ||
      existente.targetDate?.getTime() !== item.data.getTime();
    if (mudou) {
      await prisma.planningItem.update({
        where: { id: existente.id },
        data: { notes: notas || null, targetDate: item.data },
      });
      r.atualizados += 1;
    }
  }

  await prisma.client.update({
    where: { id: cliente.id },
    data: { notionSyncedAt: new Date() },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: cliente.id,
    action: "notion_sincronizado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { lidos: r.lidos, criados: r.criados, atualizados: r.atualizados },
  });

  return r;
}
