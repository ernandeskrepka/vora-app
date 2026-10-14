import { describe, expect, it } from "vitest";
import { validarMidiaDoPost, type ArquivoParaValidar } from "./formatos.ts";

const imagemOk: ArquivoParaValidar = {
  kind: "IMAGEM",
  mimeType: "image/jpeg",
  sizeBytes: 500_000,
  width: 1080,
  height: 1080,
  originalFilename: "post.jpg",
};

const videoOk: ArquivoParaValidar = {
  kind: "VIDEO",
  mimeType: "video/mp4",
  sizeBytes: 5_000_000,
  width: 1080,
  height: 1920,
  durationSeconds: 25,
  originalFilename: "reel.mp4",
};

describe("validacao de midia", () => {
  it("aceita uma imagem quadrada para Instagram e Facebook", () => {
    const r = validarMidiaDoPost({
      formato: "IMAGEM_UNICA",
      networks: ["INSTAGRAM", "FACEBOOK"],
      arquivos: [imagemOk],
    });
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
  });

  it("recusa post sem rede escolhida", () => {
    const r = validarMidiaDoPost({ formato: "IMAGEM_UNICA", networks: [], arquivos: [imagemOk] });
    expect(r.ok).toBe(false);
    expect(r.erros.some((e) => e.campo === "networks")).toBe(true);
  });

  it("recusa post sem arquivo", () => {
    const r = validarMidiaDoPost({ formato: "IMAGEM_UNICA", networks: ["INSTAGRAM"], arquivos: [] });
    expect(r.ok).toBe(false);
  });

  it("recusa proporcao fora da faixa do Instagram", () => {
    const r = validarMidiaDoPost({
      formato: "IMAGEM_UNICA",
      networks: ["INSTAGRAM"],
      arquivos: [{ ...imagemOk, width: 1080, height: 1920 }],
    });
    expect(r.ok).toBe(false);
    expect(r.erros[0].mensagem).toContain("proporcao");
  });

  it("aceita a mesma imagem vertical se o destino for so Facebook", () => {
    const r = validarMidiaDoPost({
      formato: "IMAGEM_UNICA",
      networks: ["FACEBOOK"],
      arquivos: [{ ...imagemOk, width: 1080, height: 1920 }],
    });
    expect(r.ok).toBe(true);
  });

  it("recusa imagem acima de 8 MB no Instagram", () => {
    const r = validarMidiaDoPost({
      formato: "IMAGEM_UNICA",
      networks: ["INSTAGRAM"],
      arquivos: [{ ...imagemOk, sizeBytes: 9 * 1024 * 1024 }],
    });
    expect(r.ok).toBe(false);
  });

  it("avisa que PNG sera convertido para JPEG", () => {
    const r = validarMidiaDoPost({
      formato: "IMAGEM_UNICA",
      networks: ["INSTAGRAM"],
      arquivos: [{ ...imagemOk, mimeType: "image/png" }],
    });
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.mensagem.includes("JPEG"))).toBe(true);
  });

  it("recusa carrossel com um item so e aceita com dois", () => {
    const um = validarMidiaDoPost({ formato: "CARROSSEL", networks: ["INSTAGRAM"], arquivos: [imagemOk] });
    expect(um.ok).toBe(false);
    const dois = validarMidiaDoPost({
      formato: "CARROSSEL",
      networks: ["INSTAGRAM"],
      arquivos: [imagemOk, imagemOk],
    });
    expect(dois.ok).toBe(true);
  });

  it("recusa carrossel com mais de 10 itens", () => {
    const r = validarMidiaDoPost({
      formato: "CARROSSEL",
      networks: ["INSTAGRAM"],
      arquivos: Array.from({ length: 11 }, () => imagemOk),
    });
    expect(r.ok).toBe(false);
  });

  it("recusa mais de um arquivo em formato de imagem unica", () => {
    const r = validarMidiaDoPost({
      formato: "IMAGEM_UNICA",
      networks: ["INSTAGRAM"],
      arquivos: [imagemOk, imagemOk],
    });
    expect(r.ok).toBe(false);
  });

  it("recusa video no lugar de imagem", () => {
    const r = validarMidiaDoPost({ formato: "IMAGEM_UNICA", networks: ["INSTAGRAM"], arquivos: [videoOk] });
    expect(r.ok).toBe(false);
  });

  it("aceita Reels vertical de 25 segundos", () => {
    const r = validarMidiaDoPost({ formato: "REELS", networks: ["INSTAGRAM"], arquivos: [videoOk] });
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([]);
  });

  it("recusa video curto demais e longo demais", () => {
    const curto = validarMidiaDoPost({
      formato: "REELS",
      networks: ["INSTAGRAM"],
      arquivos: [{ ...videoOk, durationSeconds: 1 }],
    });
    expect(curto.ok).toBe(false);
    const longo = validarMidiaDoPost({
      formato: "REELS",
      networks: ["INSTAGRAM"],
      arquivos: [{ ...videoOk, durationSeconds: 16 * 60 }],
    });
    expect(longo.ok).toBe(false);
  });

  it("avisa quando nao consegue medir a duracao do video", () => {
    const r = validarMidiaDoPost({
      formato: "VIDEO",
      networks: ["INSTAGRAM"],
      arquivos: [{ ...videoOk, durationSeconds: null }],
    });
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.mensagem.includes("duracao"))).toBe(true);
  });

  it("avisa sobre Reels fora de 9:16", () => {
    const r = validarMidiaDoPost({
      formato: "REELS",
      networks: ["INSTAGRAM"],
      arquivos: [{ ...videoOk, width: 1080, height: 1080 }],
    });
    expect(r.avisos.some((a) => a.mensagem.includes("9:16"))).toBe(true);
  });

  it("avisa quando o carrossel mistura proporcoes", () => {
    const r = validarMidiaDoPost({
      formato: "CARROSSEL",
      networks: ["INSTAGRAM"],
      arquivos: [imagemOk, { ...imagemOk, width: 1080, height: 1350 }],
    });
    expect(r.avisos.some((a) => a.mensagem.includes("recorta"))).toBe(true);
  });
});
