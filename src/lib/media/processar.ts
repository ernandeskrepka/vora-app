import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { logger } from "@/lib/logger.ts";
import { MIME_IMAGEM_ACEITOS, MIME_VIDEO_ACEITOS, type MediaKind } from "@/domain/formatos.ts";

const log = logger("media");

export type ArquivoRecebido = {
  nome: string;
  mimeType: string;
  conteudo: Buffer;
};

export type MidiaProcessada = {
  kind: MediaKind;
  mimeType: string;
  conteudo: Buffer;
  extensao: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  originalFilename: string;
  convertido: boolean;
};

export class MidiaNaoSuportadaError extends Error {}

/**
 * Normaliza o arquivo que a agencia subiu:
 * - imagem -> JPEG (exigencia do Instagram), com as dimensoes lidas;
 * - video  -> mantido, com duracao e dimensoes lidas pelo ffprobe.
 */
export async function processarArquivo(arquivo: ArquivoRecebido): Promise<MidiaProcessada> {
  const mime = arquivo.mimeType.toLowerCase();

  if (MIME_IMAGEM_ACEITOS.includes(mime)) {
    return processarImagem(arquivo);
  }
  if (MIME_VIDEO_ACEITOS.includes(mime)) {
    return processarVideo(arquivo);
  }
  throw new MidiaNaoSuportadaError(
    `Tipo de arquivo nao suportado: ${arquivo.mimeType}. Aceitos: JPEG, PNG, WEBP, BMP, MP4 e MOV.`,
  );
}

async function processarImagem(arquivo: ArquivoRecebido): Promise<MidiaProcessada> {
  const precisaConverter = arquivo.mimeType.toLowerCase() !== "image/jpeg";
  const pipeline = sharp(arquivo.conteudo, { failOn: "error" }).rotate();

  // qualidade 90 e mozjpeg: arquivo menor sem perda visivel.
  const conteudo = precisaConverter
    ? await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    : arquivo.conteudo;

  const meta = await sharp(conteudo).metadata();

  return {
    kind: "IMAGEM",
    mimeType: "image/jpeg",
    conteudo,
    extensao: "jpg",
    sizeBytes: conteudo.byteLength,
    width: meta.width ?? null,
    height: meta.height ?? null,
    durationSeconds: null,
    originalFilename: arquivo.nome,
    convertido: precisaConverter,
  };
}

async function processarVideo(arquivo: ArquivoRecebido): Promise<MidiaProcessada> {
  const extensao = arquivo.mimeType.toLowerCase() === "video/quicktime" ? "mov" : "mp4";
  const sonda = await sondarVideo(arquivo.conteudo, extensao);

  return {
    kind: "VIDEO",
    mimeType: arquivo.mimeType.toLowerCase(),
    conteudo: arquivo.conteudo,
    extensao,
    sizeBytes: arquivo.conteudo.byteLength,
    width: sonda.width,
    height: sonda.height,
    durationSeconds: sonda.duration,
    originalFilename: arquivo.nome,
    convertido: false,
  };
}

type SondaVideo = { width: number | null; height: number | null; duration: number | null };

/**
 * Le dimensoes e duracao com ffprobe. Se o ffprobe nao estiver instalado,
 * devolve nulos: a validacao de formato trata isso como aviso, nao erro.
 */
export async function sondarVideo(conteudo: Buffer, extensao: string): Promise<SondaVideo> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "vora-video-"));
    const arquivo = path.join(dir, `entrada.${extensao}`);
    await writeFile(arquivo, conteudo);

    const saida = await executar("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-show_entries",
      "stream=width,height,codec_type",
      "-of",
      "json",
      arquivo,
    ]);

    const json = JSON.parse(saida) as {
      format?: { duration?: string };
      streams?: Array<{ width?: number; height?: number; codec_type?: string }>;
    };
    const video = json.streams?.find((s) => s.codec_type === "video") ?? json.streams?.[0];
    const duration = json.format?.duration ? Number(json.format.duration) : null;

    return {
      width: video?.width ?? null,
      height: video?.height ?? null,
      duration: Number.isFinite(duration) ? duration : null,
    };
  } catch (erro) {
    log.warn("ffprobe indisponivel ou falhou; seguindo sem metadados do video", {
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return { width: null, height: null, duration: null };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

function executar(comando: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(comando, args);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${comando} saiu com codigo ${code}: ${err}`)),
    );
  });
}
