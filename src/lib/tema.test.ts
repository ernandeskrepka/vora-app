import { describe, expect, it } from "vitest";
import { ROTULO_TEMA, TEMAS, normalizarTema } from "./tema.ts";

describe("tema do painel", () => {
  it("sem cookie, ou com valor estranho, cai no padrao", () => {
    expect(normalizarTema(undefined)).toBe("padrao");
    expect(normalizarTema(null)).toBe("padrao");
    expect(normalizarTema("")).toBe("padrao");
    expect(normalizarTema("neon")).toBe("padrao");
  });

  it("aceita o tema VORA, ignorando caixa e espacos", () => {
    expect(normalizarTema("vora")).toBe("vora");
    expect(normalizarTema(" VORA ")).toBe("vora");
    expect(normalizarTema("padrao")).toBe("padrao");
  });

  it("todo tema tem rotulo para o seletor", () => {
    for (const t of TEMAS) expect(ROTULO_TEMA[t]).toBeTruthy();
  });
});
