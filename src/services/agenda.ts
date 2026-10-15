import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { publicarPost } from "./publicacao.ts";
import { marcarPostSemResposta } from "./posts.ts";
import { enviarLembrete } from "./lembretes.ts";
import { obterConfiguracoes } from "./configuracoes.ts";
import { sincronizarTodosOsCalendarios } from "./notion-planejamento.ts";
import { NotionNaoConfigurado } from "@/lib/notion/client.ts";

const log = logger("agenda");

export type ResultadoAgenda = {
  publicados: number;
  falhas: number;
  semResposta: number;
  lembretes: number;
  /** Clientes cujo cronograma do Notion foi relido nesta rodada. */
  notion: number;
};

/** De quanto em quanto tempo o cronograma de cada cliente e relido. */
export const NOTION_RELEITURA_HORAS = 6;
/** Quantos clientes por rodada: a funcao agendada tem poucos segundos. */
export const NOTION_POR_RODADA = 3;

/**
 * Varre o que venceu e age.
 *
 * Com worker e Redis isso e so uma rede de seguranca (o BullMQ ja dispara no
 * horario). Em hospedagem sem processo continuo, com QUEUE_DRIVER=none, e o
 * unico motor: um cron chama /api/agenda de minuto em minuto.
 *
 * Tudo que ela chama ja e idempotente: publicar confere PostPublication,
 * marcar sem resposta so age em AGUARDANDO_APROVACAO, e o lembrete olha se
 * ja foi enviado naquele intervalo.
 */
export async function processarPendencias(
  agora = new Date(),
): Promise<ResultadoAgenda> {
  const resultado: ResultadoAgenda = {
    publicados: 0,
    falhas: 0,
    semResposta: 0,
    lembretes: 0,
    notion: 0,
  };

  // 1. Posts aprovados cujo horario chegou.
  const aPublicar = await prisma.post.findMany({
    where: {
      status: { in: ["APROVADO", "PUBLICANDO"] },
      scheduledAt: { lte: agora },
    },
    select: { id: true },
    take: 20,
  });
  for (const post of aPublicar) {
    try {
      const r = await publicarPost({ postId: post.id });
      if (r.resultado === "publicado") resultado.publicados++;
      else if (r.resultado === "falhou") resultado.falhas++;
    } catch (erro) {
      resultado.falhas++;
      log.error("falha ao publicar pela agenda", {
        postId: post.id,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  // 2. Horario venceu sem resposta do cliente.
  const vencidos = await prisma.post.findMany({
    where: { status: "AGUARDANDO_APROVACAO", scheduledAt: { lte: agora } },
    select: { id: true },
    take: 50,
  });
  for (const post of vencidos) {
    const r = await marcarPostSemResposta({ postId: post.id });
    if (r === "marcado") resultado.semResposta++;
  }

  // 3. Lembretes: um por post e por intervalo configurado.
  const { lembretesHoras } = await obterConfiguracoes();
  for (const horas of lembretesHoras) {
    const limite = new Date(agora.getTime() + horas * 3_600_000);
    const candidatos = await prisma.post.findMany({
      where: {
        status: "AGUARDANDO_APROVACAO",
        scheduledAt: { gt: agora, lte: limite },
      },
      select: { id: true },
      take: 50,
    });

    for (const post of candidatos) {
      const jaEnviado = await prisma.notification.count({
        where: {
          postId: post.id,
          type: "LEMBRETE",
          payload: { path: ["horasAntes"], equals: horas },
        },
      });
      if (jaEnviado > 0) continue;

      const r = await enviarLembrete({ postId: post.id, horasAntes: horas });
      if (r === "enviado") resultado.lembretes++;
    }
  }

  // 4. Calendario geral: rele o cronograma do Notion de quem nao e lido ha
  //    algumas horas, poucos clientes por vez. So cria pauta - rascunho no
  //    calendario e decisao da equipe, pelo botao da tela.
  resultado.notion = await relerNotion(agora);

  if (
    resultado.publicados ||
    resultado.falhas ||
    resultado.semResposta ||
    resultado.lembretes ||
    resultado.notion
  ) {
    log.info("agenda processou pendencias", resultado);
  }
  return resultado;
}

async function relerNotion(agora: Date): Promise<number> {
  try {
    const r = await sincronizarTodosOsCalendarios({
      ator: { tipo: "SISTEMA", nome: "agenda" },
      referencia: agora,
      lidoHaMenosDeHoras: NOTION_RELEITURA_HORAS,
      maximo: NOTION_POR_RODADA,
    });
    for (const falha of r.falhas) {
      log.warn("notion: cronograma de um cliente nao pode ser lido", {
        cliente: falha.cliente,
        erro: falha.erro,
      });
    }
    return r.lidos.length;
  } catch (erro) {
    // Sem token nao e erro da agenda: e o Notion que ainda nao foi ligado.
    if (erro instanceof NotionNaoConfigurado) return 0;
    log.error("falha ao reler o Notion pela agenda", {
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return 0;
  }
}
