/**
 * Ids dos jobs agendados.
 *
 * O id e fixo por post (sem a versao) de proposito: reagendar e remover e
 * recriar o mesmo id, e o processador revalida tudo no banco antes de agir.
 *
 * Atencao: o BullMQ nao aceita ":" em id de job, por isso o separador e "--".
 */
export const JOB_PUBLICAR = "publish-post";
export const JOB_LEMBRETE = "approval-reminder";
export const JOB_SEM_RESPOSTA = "mark-no-response";
export const JOB_CONEXOES = "check-meta-connections";
export const JOB_INSIGHTS = "collect-ad-insights";

const SEP = "--";

export const idPublicar = (postId: string) => `${JOB_PUBLICAR}${SEP}${postId}`;
export const idSemResposta = (postId: string) => `${JOB_SEM_RESPOSTA}${SEP}${postId}`;
export const idLembrete = (postId: string, horasAntes: number) =>
  `${JOB_LEMBRETE}${SEP}${postId}${SEP}${horasAntes}`;

/** O BullMQ recusa id com ":". Guardamos essa regra num lugar so. */
export function idDeJobValido(id: string): boolean {
  return id.length > 0 && !id.includes(":");
}
