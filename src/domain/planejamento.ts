/**
 * Pauta: a ideia antes de virar post.
 *
 * O fluxo e deliberadamente simples (a equipe e pequena): a pauta anda por
 * quatro colunas e, quando vira post, sai do quadro e passa a viver no fluxo
 * de aprovacao normal.
 */

export const STATUS_PAUTA = ["IDEIA", "EM_PRODUCAO", "PRONTO", "VIROU_POST", "ARQUIVADO"] as const;

export type StatusPauta = (typeof STATUS_PAUTA)[number];

export const ROTULO_PAUTA: Record<StatusPauta, string> = {
  IDEIA: "Ideia",
  EM_PRODUCAO: "Em producao",
  PRONTO: "Pronto para agendar",
  VIROU_POST: "Virou post",
  ARQUIVADO: "Arquivado",
};

/** Colunas do quadro, na ordem. VIROU_POST e ARQUIVADO ficam fora. */
export const COLUNAS: StatusPauta[] = ["IDEIA", "EM_PRODUCAO", "PRONTO"];

const PROXIMOS: Record<StatusPauta, StatusPauta[]> = {
  IDEIA: ["EM_PRODUCAO", "ARQUIVADO"],
  EM_PRODUCAO: ["IDEIA", "PRONTO", "ARQUIVADO"],
  PRONTO: ["EM_PRODUCAO", "VIROU_POST", "ARQUIVADO"],
  // Pauta que virou post so volta ao quadro se o post for cancelado.
  VIROU_POST: ["PRONTO"],
  ARQUIVADO: ["IDEIA"],
};

export function podeMover(de: StatusPauta, para: StatusPauta): boolean {
  return PROXIMOS[de].includes(para);
}

export function destinosPossiveis(de: StatusPauta): StatusPauta[] {
  return PROXIMOS[de];
}

/** So uma pauta pronta vira post: evita agendar ideia solta sem querer. */
export function podeVirarPost(status: StatusPauta): boolean {
  return status === "PRONTO" || status === "EM_PRODUCAO";
}
