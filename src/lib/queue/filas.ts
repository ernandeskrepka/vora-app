import { Queue } from "bullmq";
import { redis } from "./conexao.ts";
import { logger } from "@/lib/logger.ts";
import {
  JOB_CONEXOES,
  JOB_INSIGHTS,
  JOB_LEMBRETE,
  JOB_PUBLICAR,
  JOB_SEM_RESPOSTA,
  idLembrete,
  idPublicar,
  idSemResposta,
} from "./ids.ts";

const log = logger("filas");

export const FILA_POSTS = "vora-posts";
export const FILA_MANUTENCAO = "vora-manutencao";

export {
  JOB_CONEXOES,
  JOB_INSIGHTS,
  JOB_LEMBRETE,
  JOB_PUBLICAR,
  JOB_SEM_RESPOSTA,
  idLembrete,
  idPublicar,
  idSemResposta,
} from "./ids.ts";

export type DadosPublicar = { postId: string; postVersion: number };
export type DadosLembrete = { postId: string; postVersion: number; horasAntes: number };
export type DadosSemResposta = { postId: string; postVersion: number };

export const filaPosts = new Queue(FILA_POSTS, { connection: redis });
export const filaManutencao = new Queue(FILA_MANUTENCAO, { connection: redis });

/* --------------------------------------------------------------- helpers */

async function remover(jobId: string) {
  const job = await filaPosts.getJob(jobId);
  if (job) {
    await job.remove().catch((erro: unknown) => {
      // Job em execucao nao pode ser removido; o processador revalida tudo
      // no banco antes de agir, entao isso e seguro.
      log.warn("nao foi possivel remover job", { jobId, erro: String(erro) });
    });
  }
}

/**
 * Agenda (ou reagenda) a publicacao. Chamado quando o cliente aprova.
 * Se o horario ja passou, o job entra para rodar imediatamente.
 */
export async function agendarPublicacao(input: {
  postId: string;
  postVersion: number;
  quando: Date;
}) {
  const jobId = idPublicar(input.postId);
  await remover(jobId);
  const delay = Math.max(0, input.quando.getTime() - Date.now());
  await filaPosts.add(
    JOB_PUBLICAR,
    { postId: input.postId, postVersion: input.postVersion } satisfies DadosPublicar,
    {
      jobId,
      delay,
      attempts: 1, // O retry com backoff e controlado dentro do job, por rede.
      removeOnComplete: { age: 60 * 60 * 24 * 30 },
      removeOnFail: false,
    },
  );
  log.info("publicacao agendada", { postId: input.postId, quando: input.quando.toISOString() });
}

/**
 * Agenda o corte: no horario do post, se ninguem respondeu, vira
 * POST SEM RESPOSTA. Nunca publica.
 */
export async function agendarCorteSemResposta(input: {
  postId: string;
  postVersion: number;
  quando: Date;
}) {
  const jobId = idSemResposta(input.postId);
  await remover(jobId);
  await filaPosts.add(
    JOB_SEM_RESPOSTA,
    { postId: input.postId, postVersion: input.postVersion } satisfies DadosSemResposta,
    {
      jobId,
      delay: Math.max(0, input.quando.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 60 * 60 * 24 * 30 },
      removeOnFail: false,
    },
  );
}

/** Lembretes pelo WhatsApp antes do horario (ex.: 24 h e 2 h antes). */
export async function agendarLembretes(input: {
  postId: string;
  postVersion: number;
  horarioDoPost: Date;
  offsetsHoras: number[];
}) {
  for (const horas of input.offsetsHoras) {
    const jobId = idLembrete(input.postId, horas);
    await remover(jobId);
    const quando = new Date(input.horarioDoPost.getTime() - horas * 3_600_000);
    // Lembrete cujo horario ja passou nao faz sentido.
    if (quando.getTime() <= Date.now()) continue;
    await filaPosts.add(
      JOB_LEMBRETE,
      { postId: input.postId, postVersion: input.postVersion, horasAntes: horas } satisfies DadosLembrete,
      {
        jobId,
        delay: quando.getTime() - Date.now(),
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: { age: 60 * 60 * 24 * 7 },
        removeOnFail: false,
      },
    );
  }
}

/**
 * Remove tudo que estava agendado para o post. Chamado em toda edicao,
 * reagendamento, cancelamento e decisao do cliente.
 */
export async function cancelarJobsDoPost(postId: string, offsetsHoras: number[] = []) {
  await remover(idPublicar(postId));
  await remover(idSemResposta(postId));
  for (const horas of offsetsHoras) await remover(idLembrete(postId, horas));

  // Varredura de seguranca: pega lembretes de offsets antigos.
  const pendentes = await filaPosts.getJobs(["delayed", "waiting", "wait"]);
  await Promise.all(
    pendentes
      .filter((j) => (j.data as { postId?: string })?.postId === postId)
      .map((j) => j.remove().catch(() => undefined)),
  );
}

/** Jobs diarios de manutencao (idempotente: pode rodar a cada boot). */
export async function registrarJobsRepetidos() {
  // BullMQ 6: jobs repetidos sao "job schedulers" (upsert e idempotente).
  await filaManutencao.upsertJobScheduler(
    JOB_CONEXOES,
    { pattern: "0 7 * * *", tz: "America/Sao_Paulo" },
    { name: JOB_CONEXOES, opts: { removeOnComplete: { count: 30 } } },
  );
  await filaManutencao.upsertJobScheduler(
    JOB_INSIGHTS,
    { pattern: "30 6 * * *", tz: "America/Sao_Paulo" },
    { name: JOB_INSIGHTS, opts: { removeOnComplete: { count: 30 } } },
  );
  log.info("jobs de manutencao registrados");
}
