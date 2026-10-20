import { describe, expect, it } from "vitest";
import { normalizarTema, temaUsaFontesDoGoogle } from "./tema.ts";

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

  it("so o tema VORA precisa das fontes do Google", () => {
    expect(temaUsaFontesDoGoogle("vora")).toBe(true);
    expect(temaUsaFontesDoGoogle("padrao")).toBe(false);
  });
});
