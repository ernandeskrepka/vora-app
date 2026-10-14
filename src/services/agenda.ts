import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { publicarPost } from "./publicacao.ts";
import { marcarPostSemResposta } from "./posts.ts";
import { enviarLembrete } from "./lembretes.ts";
import { obterConfiguracoes } from "./configuracoes.ts";

const log = logger("agenda");

export type ResultadoAgenda = {
  publicados: number;
  falhas: number;
  semResposta: number;
  lembretes: number;
};

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
export async function processarPendencias(agora = new Date()): Promise<ResultadoAgenda> {
  const resultado: ResultadoAgenda = { publicados: 0, falhas: 0, semResposta: 0, lembretes: 0 };

  // 1. Posts aprovados cujo horario chegou.
  const aPublicar = await prisma.post.findMany({
    where: { status: { in: ["APROVADO", "PUBLICANDO"] }, scheduledAt: { lte: agora } },
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

  if (resultado.publicados || resultado.falhas || resultado.semResposta || resultado.lembretes) {
    log.info("agenda processou pendencias", resultado);
  }
  return resultado;
}
