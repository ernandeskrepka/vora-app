import { describe, expect, it } from "vitest";
import {
  POST_EVENTOS,
  POST_STATUSES,
  TRANSICOES,
  TransicaoInvalidaError,
  aplicarEvento,
  aplicarEventoOuFalhar,
  eventosDisponiveis,
  isStatusFinal,
  podeEditar,
  type PostEvento,
  type PostStatus,
} from "./post-status.ts";

/** Lista explicita das transicoes que o sistema deve aceitar. */
const VALIDAS: Array<[PostStatus, PostEvento, PostStatus]> = [
  ["RASCUNHO", "ENVIAR_PARA_APROVACAO", "AGUARDANDO_APROVACAO"],
  ["RASCUNHO", "AGENCIA_EDITOU", "RASCUNHO"],
  ["RASCUNHO", "CANCELAR", "CANCELADO"],
  ["AGUARDANDO_APROVACAO", "CLIENTE_APROVOU", "APROVADO"],
  ["AGUARDANDO_APROVACAO", "CLIENTE_REPROVOU", "REPROVADO"],
  ["AGUARDANDO_APROVACAO", "HORARIO_SEM_RESPOSTA", "POST_SEM_RESPOSTA"],
  ["AGUARDANDO_APROVACAO", "AGENCIA_EDITOU", "RASCUNHO"],
  ["AGUARDANDO_APROVACAO", "CANCELAR", "CANCELADO"],
  ["APROVADO", "INICIAR_PUBLICACAO", "PUBLICANDO"],
  ["APROVADO", "AGENCIA_EDITOU", "RASCUNHO"],
  ["APROVADO", "CANCELAR", "CANCELADO"],
  ["PUBLICANDO", "PUBLICACAO_CONCLUIDA", "PUBLICADO"],
  ["PUBLICANDO", "PUBLICACAO_FALHOU", "FALHOU"],
  ["REPROVADO", "AGENCIA_EDITOU", "RASCUNHO"],
  ["REPROVADO", "CANCELAR", "CANCELADO"],
  ["POST_SEM_RESPOSTA", "AGENCIA_EDITOU", "RASCUNHO"],
  ["POST_SEM_RESPOSTA", "CANCELAR", "CANCELADO"],
  ["FALHOU", "REAGENDAR_APOS_FALHA", "APROVADO"],
  ["FALHOU", "AGENCIA_EDITOU", "RASCUNHO"],
  ["FALHOU", "CANCELAR", "CANCELADO"],
];

describe("maquina de estados do post", () => {
  it.each(VALIDAS)("%s + %s -> %s", (de, evento, esperado) => {
    const r = aplicarEvento(de, evento);
    expect(r.ok).toBe(true);
    expect(r.ok && r.para).toBe(esperado);
    expect(aplicarEventoOuFalhar(de, evento)).toBe(esperado);
  });

  it("a tabela de transicoes tem exatamente as transicoes esperadas", () => {
    const naTabela = POST_STATUSES.flatMap((de) =>
      Object.entries(TRANSICOES[de]).map(([evento, para]) => `${de}+${evento}=${para}`),
    ).sort();
    const naLista = VALIDAS.map(([de, evento, para]) => `${de}+${evento}=${para}`).sort();
    expect(naTabela).toEqual(naLista);
  });

  it("recusa todas as combinacoes que nao estao na tabela", () => {
    const permitidas = new Set(VALIDAS.map(([de, evento]) => `${de}+${evento}`));
    for (const de of POST_STATUSES) {
      for (const evento of POST_EVENTOS) {
        if (permitidas.has(`${de}+${evento}`)) continue;
        const r = aplicarEvento(de, evento);
        expect(r.ok, `${de}+${evento} deveria ser invalido`).toBe(false);
        expect(() => aplicarEventoOuFalhar(de, evento)).toThrow(TransicaoInvalidaError);
      }
    }
  });
});

describe("regras de seguranca do fluxo", () => {
  it("PUBLICANDO so pode ser alcancado a partir de APROVADO", () => {
    const origens = POST_STATUSES.filter((de) => TRANSICOES[de].INICIAR_PUBLICACAO === "PUBLICANDO");
    expect(origens).toEqual(["APROVADO"]);
  });

  it("nenhum caminho leva de AGUARDANDO_APROVACAO direto para PUBLICANDO ou PUBLICADO", () => {
    const destinos = Object.values(TRANSICOES.AGUARDANDO_APROVACAO);
    expect(destinos).not.toContain("PUBLICANDO");
    expect(destinos).not.toContain("PUBLICADO");
  });

  it("silencio leva a POST_SEM_RESPOSTA, nunca a publicacao", () => {
    const r = aplicarEvento("AGUARDANDO_APROVACAO", "HORARIO_SEM_RESPOSTA");
    expect(r.ok && r.para).toBe("POST_SEM_RESPOSTA");
    // E nao existe caminho de POST_SEM_RESPOSTA para publicacao sem passar por aprovacao.
    expect(Object.values(TRANSICOES.POST_SEM_RESPOSTA)).toEqual(["RASCUNHO", "CANCELADO"]);
  });

  it("edicao da agencia sempre derruba a aprovacao", () => {
    for (const de of POST_STATUSES) {
      const destino = TRANSICOES[de].AGENCIA_EDITOU;
      if (destino) expect(destino).toBe("RASCUNHO");
    }
    expect(podeEditar("PUBLICANDO")).toBe(false);
    expect(podeEditar("PUBLICADO")).toBe(false);
    expect(podeEditar("CANCELADO")).toBe(false);
    expect(podeEditar("APROVADO")).toBe(true);
  });

  it("um post em PUBLICANDO nao pode ser cancelado", () => {
    expect(aplicarEvento("PUBLICANDO", "CANCELAR").ok).toBe(false);
  });

  it("status finais nao aceitam nenhum evento", () => {
    for (const status of POST_STATUSES) {
      if (!isStatusFinal(status)) continue;
      expect(eventosDisponiveis(status)).toEqual([]);
    }
  });

  it("todo status nao final tem pelo menos uma saida", () => {
    for (const status of POST_STATUSES) {
      if (isStatusFinal(status)) continue;
      expect(eventosDisponiveis(status).length).toBeGreaterThan(0);
    }
  });
});
