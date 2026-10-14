import { describe, expect, it } from "vitest";
import {
  montarQuinzena,
  quinzenaAnterior,
  quinzenaDe,
  quinzenaPorChave,
  quinzenaSeguinte,
  rotuloDaQuinzena,
} from "./quinzena.ts";

describe("quinzena", () => {
  it("primeira quinzena vai do dia 1 ao 15", () => {
    const q = montarQuinzena(2026, 10, 1);
    expect(q.chave).toBe("2026-10-Q1");
    expect(q.dias).toBe(15);
    expect(rotuloDaQuinzena(q)).toBe("1 a 15 de outubro de 2026");
  });

  it("segunda quinzena acompanha o tamanho do mes", () => {
    expect(montarQuinzena(2026, 10, 2).dias).toBe(16); // outubro tem 31
    expect(montarQuinzena(2026, 11, 2).dias).toBe(15); // novembro tem 30
    expect(montarQuinzena(2026, 2, 2).dias).toBe(13); // fevereiro comum
    expect(montarQuinzena(2028, 2, 2).dias).toBe(14); // fevereiro bissexto
  });

  it("descobre a quinzena de uma data", () => {
    expect(quinzenaDe(new Date("2026-10-15T12:00:00-03:00")).chave).toBe("2026-10-Q1");
    expect(quinzenaDe(new Date("2026-10-16T00:30:00-03:00")).chave).toBe("2026-10-Q2");
  });

  it("usa o fuso do cliente na virada do mes", () => {
    // 31/10 as 22h em Sao Paulo ja e 01/11 em UTC: o relatorio tem de seguir
    // o dia do cliente, nao o do servidor.
    expect(quinzenaDe(new Date("2026-11-01T01:00:00Z")).chave).toBe("2026-10-Q2");
  });

  it("anda para tras e para frente, virando o ano", () => {
    expect(quinzenaAnterior(montarQuinzena(2026, 10, 2)).chave).toBe("2026-10-Q1");
    expect(quinzenaAnterior(montarQuinzena(2026, 1, 1)).chave).toBe("2025-12-Q2");
    expect(quinzenaSeguinte(montarQuinzena(2026, 12, 2)).chave).toBe("2027-01-Q1");
  });

  it("le e recusa chaves", () => {
    expect(quinzenaPorChave("2026-10-Q2")?.metade).toBe(2);
    expect(quinzenaPorChave("2026-13-Q1")).toBeNull();
    expect(quinzenaPorChave("2026-10")).toBeNull();
    expect(quinzenaPorChave("qualquer coisa")).toBeNull();
  });

  it("o fim de uma quinzena e o inicio da seguinte, sem buraco nem sobreposicao", () => {
    const q1 = montarQuinzena(2026, 10, 1);
    const q2 = quinzenaSeguinte(q1);
    expect(q1.fim.getTime()).toBe(q2.inicio.getTime());
  });
});
