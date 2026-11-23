import type { ArquivoRecebido } from "@/lib/media/processar.ts";
import { ErroDeRegra } from "./erros.ts";

/**
 * Importacao de arquivo por link: a equipe cola o link do Google Drive (ou
 * qualquer link direto) e o servidor baixa o arquivo para a biblioteca do
 * cliente, sem passar pelo computador de quem esta operando.
 */

const TAMANHO_MAXIMO = 200 * 1024 * 1024;
const TEMPO_LIMITE_MS = 120_000;

/**
 * Converte um link de compartilhamento do Google Drive na URL de download
 * direto. Link que nao e do Drive volta como esta.
 */
export function urlDeDownload(link: string): string {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    throw new ErroDeRegra(`Link invalido: "${link}". Cole o link completo, com https://.`);
  }

  const host = u.hostname.toLowerCase();

  if (host === "docs.google.com") {
    if (/^\/(document|spreadsheets|presentation)\//.test(u.pathname)) {
      throw new ErroDeRegra(
        "Esse link e de um documento Google (Docs/Planilha/Apresentacao), nao de um arquivo. " +
          "Exporte para PDF ou imagem e suba o arquivo exportado.",
      );
    }
  }

  if (host === "drive.google.com" || host === "docs.google.com") {
    if (u.pathname.includes("/folders/")) {
      throw new ErroDeRegra(
        "Esse link e de uma PASTA do Drive. Abra a pasta e copie o link de cada arquivo.",
      );
    }
    const porCaminho = u.pathname.match(/\/file\/d\/([\w-]+)/) ?? u.pathname.match(/\/d\/([\w-]+)/);
    const id = porCaminho?.[1] ?? u.searchParams.get("id");
    if (!id) {
      throw new ErroDeRegra(
        "Nao reconheci esse link do Drive. Use o botao Compartilhar > Copiar link do arquivo.",
      );
    }
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  }

  return link;
}

/** Extrai o nome do arquivo do cabecalho Content-Disposition, se houver. */
export function nomeDoContentDisposition(valor: string | null): string | null {
  if (!valor) return null;
  const utf8 = valor.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      // Cabecalho mal formado: tenta o filename simples abaixo.
    }
  }
  const simples = valor.match(/filename="?([^";]+)"?/i);
  return simples ? simples[1].trim() : null;
}

function nomePelaUrl(url: string): string {
  try {
    const u = new URL(url);
    const ultimo = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return ultimo || "arquivo";
  } catch {
    return "arquivo";
  }
}

/** Baixa um link (Drive ou direto) e devolve no formato do upload manual. */
export async function baixarDeLink(link: string): Promise<ArquivoRecebido> {
  const url = urlDeDownload(link.trim());
  const ehDrive = url.startsWith("https://drive.usercontent.google.com/");

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch {
    throw new ErroDeRegra(`Nao consegui baixar "${link}": o endereco nao respondeu.`);
  }

  if (!resposta.ok) {
    throw new ErroDeRegra(
      `O link respondeu com erro ${resposta.status}. Confira se o arquivo esta publico.`,
    );
  }

  const declarado = Number(resposta.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAXIMO) {
    throw new ErroDeRegra("O arquivo do link passa de 200 MB.");
  }

  const mimeType = (resposta.headers.get("content-type") ?? "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (mimeType === "text/html") {
    throw new ErroDeRegra(
      ehDrive
        ? "O arquivo do Drive nao esta publico. No Drive: Compartilhar > Acesso geral > " +
          '"Qualquer pessoa com o link", e tente de novo.'
        : "O link devolveu uma pagina da web, nao um arquivo. Use um link direto para o arquivo.",
    );
  }

  const conteudo = Buffer.from(await resposta.arrayBuffer());
  if (conteudo.byteLength > TAMANHO_MAXIMO) {
    throw new ErroDeRegra("O arquivo do link passa de 200 MB.");
  }
  if (conteudo.byteLength === 0) {
    throw new ErroDeRegra(`O link "${link}" devolveu um arquivo vazio.`);
  }

  const nome =
    nomeDoContentDisposition(resposta.headers.get("content-disposition")) ?? nomePelaUrl(link);

  return { nome, mimeType, conteudo };
}
