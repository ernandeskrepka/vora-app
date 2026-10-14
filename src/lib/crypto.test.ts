import { describe, expect, it } from "vitest";
import {
  cifrarSegredo,
  decifrarSegredo,
  gerarToken,
  hashSenha,
  hashToken,
  senhaConfere,
  tokenConfere,
} from "./crypto.ts";

describe("cifra de segredos", () => {
  it("vai e volta", () => {
    const token = "EAAG-token-de-sistema-da-meta";
    const cifrado = cifrarSegredo(token);
    expect(cifrado).not.toContain(token);
    expect(cifrado.startsWith("v1.")).toBe(true);
    expect(decifrarSegredo(cifrado)).toBe(token);
  });

  it("gera resultado diferente a cada chamada (IV aleatorio)", () => {
    expect(cifrarSegredo("abc")).not.toBe(cifrarSegredo("abc"));
  });

  it("recusa conteudo adulterado", () => {
    const cifrado = cifrarSegredo("segredo");
    const partes = cifrado.split(".");
    partes[3] = Buffer.from("outra coisa").toString("base64");
    expect(() => decifrarSegredo(partes.join("."))).toThrow();
  });

  it("recusa formato invalido", () => {
    expect(() => decifrarSegredo("qualquer-coisa")).toThrow();
  });
});

describe("token de aprovacao", () => {
  it("tem no minimo 32 bytes de entropia e e url-safe", () => {
    const t = gerarToken();
    expect(Buffer.from(t, "base64url").length).toBe(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("nao repete", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => gerarToken()));
    expect(tokens.size).toBe(500);
  });

  it("confere pelo hash e recusa token errado", () => {
    const t = gerarToken();
    const h = hashToken(t);
    expect(h).not.toBe(t);
    expect(tokenConfere(t, h)).toBe(true);
    expect(tokenConfere(gerarToken(), h)).toBe(false);
    expect(tokenConfere(t, "curto")).toBe(false);
  });
});

describe("senha da equipe", () => {
  it("confere a senha certa e recusa a errada", () => {
    const hash = hashSenha("senha-forte-123");
    expect(hash).not.toContain("senha-forte-123");
    expect(senhaConfere("senha-forte-123", hash)).toBe(true);
    expect(senhaConfere("senha-errada", hash)).toBe(false);
  });

  it("usa salt diferente por senha", () => {
    expect(hashSenha("igual")).not.toBe(hashSenha("igual"));
  });

  it("recusa hash em formato desconhecido", () => {
    expect(senhaConfere("x", "md5$abc")).toBe(false);
  });
});
