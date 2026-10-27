import { describe, expect, it } from "vitest";
import { assinarPerfil, assinaturaDoPerfilValida, linkDoPerfil } from "./perfil-link.ts";

describe("link do perfil para o cliente", () => {
  it("aceita a assinatura do proprio cliente e recusa a de outro", () => {
    const a = assinarPerfil("cliente-1");
    expect(assinaturaDoPerfilValida("cliente-1", a)).toBe(true);
    expect(assinaturaDoPerfilValida("cliente-2", a)).toBe(false);
    expect(assinaturaDoPerfilValida("cliente-1", "")).toBe(false);
  });

  it("monta o link com a assinatura", () => {
    expect(linkDoPerfil("cliente-1")).toMatch(/\/perfil\/cliente-1\?a=[A-Za-z0-9_-]+$/);
  });
});
