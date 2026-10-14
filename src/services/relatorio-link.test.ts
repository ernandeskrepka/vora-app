import { describe, expect, it } from "vitest";
import { assinarRelatorio, assinaturaDoRelatorioValida } from "./relatorio-link.ts";

describe("link do relatorio para o cliente", () => {
  it("aceita a assinatura do proprio par cliente/quinzena", () => {
    const a = assinarRelatorio("cliente-1", "2026-10-Q2");
    expect(assinaturaDoRelatorioValida("cliente-1", "2026-10-Q2", a)).toBe(true);
  });

  it("recusa trocar o cliente mantendo a assinatura", () => {
    const a = assinarRelatorio("cliente-1", "2026-10-Q2");
    expect(assinaturaDoRelatorioValida("cliente-2", "2026-10-Q2", a)).toBe(false);
  });

  it("recusa trocar a quinzena mantendo a assinatura", () => {
    const a = assinarRelatorio("cliente-1", "2026-10-Q2");
    expect(assinaturaDoRelatorioValida("cliente-1", "2026-11-Q1", a)).toBe(false);
    expect(assinaturaDoRelatorioValida("cliente-1", "2026-10-Q1", a)).toBe(false);
  });

  it("recusa assinatura vazia ou de outro tamanho", () => {
    expect(assinaturaDoRelatorioValida("cliente-1", "2026-10-Q2", "")).toBe(false);
    expect(assinaturaDoRelatorioValida("cliente-1", "2026-10-Q2", "abc")).toBe(false);
  });

  it("cada cliente tem assinatura diferente", () => {
    expect(assinarRelatorio("a", "2026-10-Q1")).not.toBe(assinarRelatorio("b", "2026-10-Q1"));
  });
});
