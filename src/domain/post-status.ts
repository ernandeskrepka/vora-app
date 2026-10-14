/**
 * Maquina de estados do post.
 *
 * Toda mudanca de status passa por aqui. Nenhum outro modulo escreve
 * `status` direto: e essa tabela que garante a regra "nada e publicado sem
 * aprovacao" e que silencio nunca vira publicacao.
 */

export const POST_STATUSES = [
  "RASCUNHO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "PUBLICANDO",
  "PUBLICADO",
  "REPROVADO",
  "POST_SEM_RESPOSTA",
  "FALHOU",
  "CANCELADO",
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_EVENTOS = [
  "ENVIAR_PARA_APROVACAO",
  "CLIENTE_APROVOU",
  "CLIENTE_REPROVOU",
  "HORARIO_SEM_RESPOSTA",
  "AGENCIA_EDITOU",
  "INICIAR_PUBLICACAO",
  "PUBLICACAO_CONCLUIDA",
  "PUBLICACAO_FALHOU",
  "REAGENDAR_APOS_FALHA",
  "CANCELAR",
] as const;

export type PostEvento = (typeof POST_EVENTOS)[number];

/**
 * Transicoes validas. O que nao esta aqui e recusado.
 *
 * Leitura das regras principais:
 * - AGENCIA_EDITOU sempre volta para RASCUNHO: editar derruba a aprovacao.
 * - HORARIO_SEM_RESPOSTA so existe a partir de AGUARDANDO_APROVACAO.
 * - PUBLICANDO so pode ser alcancado a partir de APROVADO.
 * - PUBLICANDO nao aceita CANCELAR: a chamada para a Meta ja esta em curso.
 */
export const TRANSICOES: Readonly<Record<PostStatus, Partial<Record<PostEvento, PostStatus>>>> = {
  RASCUNHO: {
    ENVIAR_PARA_APROVACAO: "AGUARDANDO_APROVACAO",
    AGENCIA_EDITOU: "RASCUNHO",
    CANCELAR: "CANCELADO",
  },
  AGUARDANDO_APROVACAO: {
    CLIENTE_APROVOU: "APROVADO",
    CLIENTE_REPROVOU: "REPROVADO",
    HORARIO_SEM_RESPOSTA: "POST_SEM_RESPOSTA",
    AGENCIA_EDITOU: "RASCUNHO",
    CANCELAR: "CANCELADO",
  },
  APROVADO: {
    INICIAR_PUBLICACAO: "PUBLICANDO",
    AGENCIA_EDITOU: "RASCUNHO",
    CANCELAR: "CANCELADO",
  },
  PUBLICANDO: {
    PUBLICACAO_CONCLUIDA: "PUBLICADO",
    PUBLICACAO_FALHOU: "FALHOU",
  },
  PUBLICADO: {},
  REPROVADO: {
    AGENCIA_EDITOU: "RASCUNHO",
    CANCELAR: "CANCELADO",
  },
  POST_SEM_RESPOSTA: {
    AGENCIA_EDITOU: "RASCUNHO",
    CANCELAR: "CANCELADO",
  },
  FALHOU: {
    REAGENDAR_APOS_FALHA: "APROVADO",
    AGENCIA_EDITOU: "RASCUNHO",
    CANCELAR: "CANCELADO",
  },
  CANCELADO: {},
};

export const STATUS_FINAIS: readonly PostStatus[] = ["PUBLICADO", "CANCELADO"];

/** Status em que o post pode ser publicado pelo worker. */
export const STATUS_PUBLICAVEL: PostStatus = "APROVADO";

export type ResultadoTransicao =
  | { ok: true; de: PostStatus; para: PostStatus; evento: PostEvento }
  | { ok: false; de: PostStatus; evento: PostEvento; motivo: string };

export class TransicaoInvalidaError extends Error {
  constructor(
    readonly de: PostStatus,
    readonly evento: PostEvento,
  ) {
    super(`Transicao invalida: nao e possivel aplicar "${evento}" em um post "${de}".`);
    this.name = "TransicaoInvalidaError";
  }
}

/** Avalia um evento sem lancar erro. */
export function aplicarEvento(de: PostStatus, evento: PostEvento): ResultadoTransicao {
  const para = TRANSICOES[de]?.[evento];
  if (!para) {
    return {
      ok: false,
      de,
      evento,
      motivo: `Transicao invalida: "${evento}" nao e permitido em um post "${de}".`,
    };
  }
  return { ok: true, de, para, evento };
}

/** Mesma coisa, mas lanca erro. Use nos pontos de escrita. */
export function aplicarEventoOuFalhar(de: PostStatus, evento: PostEvento): PostStatus {
  const r = aplicarEvento(de, evento);
  if (!r.ok) throw new TransicaoInvalidaError(de, evento);
  return r.para;
}

export function eventoPermitido(de: PostStatus, evento: PostEvento): boolean {
  return aplicarEvento(de, evento).ok;
}

export function eventosDisponiveis(de: PostStatus): PostEvento[] {
  return POST_EVENTOS.filter((e) => eventoPermitido(de, e));
}

export function isStatusFinal(status: PostStatus): boolean {
  return STATUS_FINAIS.includes(status);
}

/** A agencia pode mexer no conteudo? Em PUBLICANDO ninguem mexe. */
export function podeEditar(status: PostStatus): boolean {
  return eventoPermitido(status, "AGENCIA_EDITOU");
}

export function podeEnviarParaAprovacao(status: PostStatus): boolean {
  return eventoPermitido(status, "ENVIAR_PARA_APROVACAO");
}

export function aguardandoCliente(status: PostStatus): boolean {
  return status === "AGUARDANDO_APROVACAO";
}

export const ROTULO_STATUS: Record<PostStatus, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_APROVACAO: "Aguardando aprovacao",
  APROVADO: "Aprovado",
  PUBLICANDO: "Publicando",
  PUBLICADO: "Publicado",
  REPROVADO: "Reprovado",
  POST_SEM_RESPOSTA: "POST SEM RESPOSTA",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
};
