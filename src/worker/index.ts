import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { env, reminderOffsetsHours } from "@/env";
import { logger } from "@/lib/logger.ts";
import { redis } from "@/lib/queue/conexao.ts";
import {
  FILA_MANUTENCAO,
  FILA_POSTS,
  JOB_CONEXOES,
  JOB_INSIGHTS,
  JOB_LEMBRETE,
  JOB_PUBLICAR,
  JOB_SEM_RESPOSTA,
  registrarJobsRepetidos,
  type DadosLembrete,
  type DadosPublicar,
  type DadosSemResposta,
} from "@/lib/queue/filas.ts";
import { publicarPost } from "@/services/publicacao.ts";
import { marcarPostSemResposta } from "@/services/posts.ts";
import { enviarLembrete } from "@/services/lembretes.ts";
import { verificarTodasAsConexoes } from "@/services/conexoes.ts";
import { coletarInsightsDeTodos } from "@/services/insights.ts";

const log = logger("worker");

async function processarPost(job: Job) {
  switch (job.name) {
    case JOB_PUBLICAR: {
      const dados = job.data as DadosPublicar;
      return publicarPost({ postId: dados.postId });
    }
    case JOB_SEM_RESPOSTA: {
      const dados = job.data as DadosSemResposta;
      return marcarPostSemResposta({ postId: dados.postId });
    }
    case JOB_LEMBRETE: {
      const dados = job.data as DadosLembrete;
      return enviarLembrete({ postId: dados.postId, horasAntes: dados.horasAntes });
    }
    default:
      log.warn("job desconhecido na fila de posts", { nome: job.name });
      return { ignorado: true };
  }
}

async function processarManutencao(job: Job) {
  switch (job.name) {
    case JOB_CONEXOES:
      return verificarTodasAsConexoes();
    case JOB_INSIGHTS:
      return coletarInsightsDeTodos();
    default:
      log.warn("job desconhecido na fila de manutencao", { nome: job.name });
      return { ignorado: true };
  }
}

const workerPosts = new Worker(FILA_POSTS, processarPost, {
  connection: redis,
  // Publicacao chama a Meta e espera processamento de video: pouca
  // concorrencia e suficiente e evita estourar limite de API.
  concurrency: 3,
});

const workerManutencao = new Worker(FILA_MANUTENCAO, processarManutencao, {
  connection: redis,
  concurrency: 1,
});

for (const [nome, worker] of [
  ["posts", workerPosts],
  ["manutencao", workerManutencao],
] as const) {
  worker.on("completed", (job, resultado) => {
    log.info("job concluido", { fila: nome, job: job.name, id: job.id, resultado });
  });
  worker.on("failed", (job, erro) => {
    log.error("job falhou", { fila: nome, job: job?.name, id: job?.id, erro: erro.message });
  });
}

await registrarJobsRepetidos();

log.info("worker no ar", {
  dryRunMeta: env.META_DRY_RUN,
  modoWhatsapp: env.WHATSAPP_MODE,
  lembretesHoras: reminderOffsetsHours,
  versaoGraph: env.META_GRAPH_VERSION,
});

async function desligar(sinal: string) {
  log.info("desligando worker", { sinal });
  await Promise.allSettled([workerPosts.close(), workerManutencao.close()]);
  await redis.quit().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void desligar("SIGTERM"));
process.on("SIGINT", () => void desligar("SIGINT"));
