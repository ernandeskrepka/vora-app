import { describe, expect, it } from "vitest";
import {
  COLUNAS,
  STATUS_PAUTA,
  destinosPossiveis,
  podeMover,
  podeVirarPost,
  type StatusPauta,
} from "./planejamento.ts";

describe("quadro de pautas", () => {
  it("as colunas visiveis sao as tres do fluxo de producao", () => {
    expect(COLUNAS).toEqual(["IDEIA", "EM_PRODUCAO", "PRONTO"]);
  });

  it("anda para frente e para tras na producao", () => {
    expect(podeMover("IDEIA", "EM_PRODUCAO")).toBe(true);
    expect(podeMover("EM_PRODUCAO", "PRONTO")).toBe(true);
    expect(podeMover("PRONTO", "EM_PRODUCAO")).toBe(true);
    expect(podeMover("EM_PRODUCAO", "IDEIA")).toBe(true);
  });

  it("nao pula da ideia direto para pronto", () => {
    expect(podeMover("IDEIA", "PRONTO")).toBe(false);
  });

  it("nao transforma ideia solta em post", () => {
    expect(podeVirarPost("IDEIA")).toBe(false);
    expect(podeVirarPost("ARQUIVADO")).toBe(false);
    expect(podeVirarPost("PRONTO")).toBe(true);
    expect(podeVirarPost("EM_PRODUCAO")).toBe(true);
  });

  it("pauta que virou post so volta para o quadro por PRONTO", () => {
    expect(destinosPossiveis("VIROU_POST")).toEqual(["PRONTO"]);
  });

  it("arquivar esta disponivel em todas as colunas de producao", () => {
    for (const coluna of COLUNAS) {
      expect(podeMover(coluna, "ARQUIVADO")).toBe(true);
    }
  });

  it("desarquivar devolve para ideia", () => {
    expect(destinosPossiveis("ARQUIVADO")).toEqual(["IDEIA"]);
  });

  it("todo status tem ao menos uma saida", () => {
    for (const s of STATUS_PAUTA) {
      expect(destinosPossiveis(s as StatusPauta).length).toBeGreaterThan(0);
    }
  });
});
