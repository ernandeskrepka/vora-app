import { describe, expect, it } from "vitest";
import * as dt from "./datetime.ts";

describe("fuso America/Sao_Paulo", () => {
  it("converte horario local para UTC (UTC-3)", () => {
    const utc = dt.doFusoParaUtc("2026-10-15T14:30");
    expect(utc.toISOString()).toBe("2026-10-15T17:30:00.000Z");
  });

  it("volta de UTC para o input local sem perder o horario", () => {
    const utc = dt.doFusoParaUtc("2026-12-31T23:59");
    expect(dt.paraInputLocal(utc)).toBe("2026-12-31T23:59");
  });

  it("formata data e hora no padrao brasileiro", () => {
    const utc = new Date("2026-10-15T17:30:00.000Z");
    expect(dt.formatarDataHora(utc)).toBe("15/10/2026 as 14:30");
    expect(dt.formatarData(utc)).toBe("15/10/2026");
    expect(dt.formatarHora(utc)).toBe("14:30");
    expect(dt.formatarDiaExtenso(utc)).toBe("quinta, 15/10/2026");
  });

  it("monta o intervalo de um mes no fuso local", () => {
    const { inicio, fim } = dt.intervaloDoMes(2026, 10);
    expect(inicio.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("vira o ano no intervalo de dezembro", () => {
    const { fim } = dt.intervaloDoMes(2026, 12);
    expect(fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("soma e subtrai horas", () => {
    const base = new Date("2026-10-15T12:00:00.000Z");
    expect(dt.somarHoras(base, 2).toISOString()).toBe("2026-10-15T14:00:00.000Z");
    expect(dt.subtrairHoras(base, 24).toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });

  it("chave de dia local respeita a virada no fuso", () => {
    // 02:00 UTC do dia 16 ainda e dia 15 em Sao Paulo.
    expect(dt.chaveDiaLocal(new Date("2026-10-16T02:00:00.000Z"))).toBe("2026-10-15");
  });
});
