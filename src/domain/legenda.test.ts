import { describe, expect, it } from "vitest";
import { legendaVisivel, resumoDaLegenda } from "./legenda.ts";

describe("legenda que o cliente le", () => {
  it("tira a marca de demonstracao do fim do texto", () => {
    expect(
      legendaVisivel("O exame certo muda o desfecho.\n\n[demo:lb-reels]"),
    ).toBe("O exame certo muda o desfecho.");
  });

  it("nao mexe em legenda normal", () => {
    const texto = "Outubro Rosa chegou!\nAgende seu check-up.";
    expect(legendaVisivel(texto)).toBe(texto);
  });

  it("nao tira colchete que faz parte do texto", () => {
    const texto = "Promocao [so ate sexta]";
    expect(legendaVisivel(texto)).toBe(texto);
  });

  it("so tira a marca quando ela esta no fim, nao no meio da frase", () => {
    const texto = "Antes [demo:x] depois";
    expect(legendaVisivel(texto)).toBe(texto);
  });

  it("o resumo e a primeira linha, ja sem a marca", () => {
    expect(resumoDaLegenda("Primeira linha\nSegunda linha\n\n[demo:abc]")).toBe(
      "Primeira linha",
    );
  });

  it("legenda vazia continua vazia", () => {
    expect(legendaVisivel("")).toBe("");
    expect(resumoDaLegenda("[demo:so-a-marca]")).toBe("");
  });
});
