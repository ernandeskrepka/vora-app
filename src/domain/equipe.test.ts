import { describe, expect, it } from "vitest";
import {
  EQUIPE_VORA,
  normalizarFuncao,
  papelDaFuncao,
  primeiroNome,
  senhaForte,
  senhaInicial,
} from "./equipe.ts";

describe("funcoes da equipe", () => {
  it("gestao e coordenacao administram; o resto edita", () => {
    expect(papelDaFuncao("GESTAO")).toBe("ADMIN");
    expect(papelDaFuncao("COORDENACAO")).toBe("ADMIN");
    expect(papelDaFuncao("PLANEJAMENTO")).toBe("EDITOR");
    expect(papelDaFuncao("EDICAO_DESIGN")).toBe("EDITOR");
    expect(papelDaFuncao("DESIGN")).toBe("EDITOR");
  });

  it("valor estranho vira OUTRA", () => {
    expect(normalizarFuncao("design")).toBe("DESIGN");
    expect(normalizarFuncao(" gestao ")).toBe("GESTAO");
    expect(normalizarFuncao("chefe")).toBe("OUTRA");
    expect(normalizarFuncao(null)).toBe("OUTRA");
  });

  it("a equipe tem as cinco pessoas, sem e-mail repetido", () => {
    expect(EQUIPE_VORA).toHaveLength(5);
    expect(new Set(EQUIPE_VORA.map((p) => p.email)).size).toBe(5);
    expect(EQUIPE_VORA.map((p) => p.funcao)).toEqual([
      "GESTAO",
      "PLANEJAMENTO",
      "EDICAO_DESIGN",
      "DESIGN",
      "COORDENACAO",
    ]);
  });

  it("senha inicial usa o primeiro nome sem acento e passa na regra", () => {
    const s = senhaInicial("Pâmela Skrepka", "2026");
    expect(s).toBe("vora-pamela-2026");
    expect(senhaForte(s)).toBeNull();
    expect(primeiroNome("Guilherme Henrik")).toBe("Guilherme");
  });

  it("senha fraca e recusada", () => {
    expect(senhaForte("curta1")).toMatch(/10 caracteres/);
    expect(senhaForte("somenteletras")).toMatch(/letras e numeros/);
    expect(senhaForte("letras12345")).toBeNull();
  });
});
