import { afterEach, describe, expect, it, vi } from "vitest";
import {
  baixarDeLink,
  nomeDoContentDisposition,
  urlDeDownload,
} from "./importar-link.ts";
import { ErroDeRegra } from "./erros.ts";

describe("urlDeDownload", () => {
  it("converte o link de compartilhamento do Drive em download direto", () => {
    expect(urlDeDownload("https://drive.google.com/file/d/1AbC-_xyz/view?usp=sharing")).toBe(
      "https://drive.usercontent.google.com/download?id=1AbC-_xyz&export=download&confirm=t",
    );
  });

  it("aceita o formato open?id=", () => {
    expect(urlDeDownload("https://drive.google.com/open?id=1AbC")).toContain("id=1AbC");
  });

  it("link fora do Drive passa como esta", () => {
    expect(urlDeDownload("https://exemplo.com/a/foto.jpg")).toBe("https://exemplo.com/a/foto.jpg");
  });

  it("recusa pasta do Drive com mensagem clara", () => {
    expect(() => urlDeDownload("https://drive.google.com/drive/folders/1AbC")).toThrow(ErroDeRegra);
    expect(() => urlDeDownload("https://drive.google.com/drive/folders/1AbC")).toThrow(/PASTA/);
  });

  it("recusa documento Google (Docs, Planilha)", () => {
    expect(() => urlDeDownload("https://docs.google.com/document/d/1AbC/edit")).toThrow(
      /documento Google/,
    );
  });

  it("recusa link invalido", () => {
    expect(() => urlDeDownload("isso nao e link")).toThrow(/Link invalido/);
  });
});

describe("nomeDoContentDisposition", () => {
  it("prefere filename* em UTF-8", () => {
    expect(
      nomeDoContentDisposition("attachment; filename=\"fallback.jpg\"; filename*=UTF-8''arte%20final.jpg"),
    ).toBe("arte final.jpg");
  });

  it("le filename simples com e sem aspas", () => {
    expect(nomeDoContentDisposition('attachment; filename="foto.png"')).toBe("foto.png");
    expect(nomeDoContentDisposition("attachment; filename=video.mp4")).toBe("video.mp4");
  });

  it("sem cabecalho devolve nulo", () => {
    expect(nomeDoContentDisposition(null)).toBeNull();
  });
});

describe("baixarDeLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respostaFalsa(corpo: BufferSource | string, cabecalhos: Record<string, string>, status = 200) {
    return new Response(corpo, { status, headers: cabecalhos });
  }

  it("baixa um link direto e usa o nome do Content-Disposition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFalsa(Buffer.from([1, 2, 3]), {
          "content-type": "image/jpeg",
          "content-disposition": 'attachment; filename="sessao-01.jpg"',
        }),
      ),
    );
    const arquivo = await baixarDeLink("https://exemplo.com/download/123");
    expect(arquivo.nome).toBe("sessao-01.jpg");
    expect(arquivo.mimeType).toBe("image/jpeg");
    expect(arquivo.conteudo.byteLength).toBe(3);
  });

  it("sem Content-Disposition, o nome vem do caminho do link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaFalsa(Buffer.from([1]), { "content-type": "image/png" })),
    );
    const arquivo = await baixarDeLink("https://exemplo.com/artes/arte%20final.png?x=1");
    expect(arquivo.nome).toBe("arte final.png");
  });

  it("Drive devolvendo HTML = arquivo nao publico, com instrucao", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaFalsa("<html>login</html>", { "content-type": "text/html" })),
    );
    await expect(baixarDeLink("https://drive.google.com/file/d/1AbC/view")).rejects.toThrow(
      /nao esta publico/,
    );
  });

  it("erro HTTP vira mensagem de regra", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaFalsa("x", { "content-type": "text/plain" }, 404)),
    );
    await expect(baixarDeLink("https://exemplo.com/sumiu.jpg")).rejects.toThrow(/erro 404/);
  });

  it("arquivo vazio e recusado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaFalsa(Buffer.alloc(0), { "content-type": "image/jpeg" })),
    );
    await expect(baixarDeLink("https://exemplo.com/vazio.jpg")).rejects.toThrow(/vazio/);
  });
});
