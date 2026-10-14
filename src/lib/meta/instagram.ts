import { env } from "@/env";
import { logger } from "@/lib/logger.ts";
import { MetaApiError, chamarGraph, espera } from "./graph.ts";

const log = logger("meta.instagram");

export type ItemMidia = { url: string; kind: "IMAGEM" | "VIDEO" };

export type ResultadoPublicacao = {
  externalId: string;
  permalink: string | null;
};

/* ------------------------------------------------- limite de publicacao */

export type LimitePublicacao = {
  usado: number;
  total: number;
  restante: number;
  dentroDoLimite: boolean;
};

/**
 * Consulta o limite real da conta antes de publicar.
 *
 * A documentacao da Meta cita 100 posts/24 h em uma pagina e 50 na
 * referencia do endpoint. Por isso lemos `quota_total` da propria conta em
 * vez de fixar um numero; META_IG_DAILY_LIMIT e apenas o fallback.
 */
export async function consultarLimitePublicacao(input: {
  igUserId: string;
  token: string;
}): Promise<LimitePublicacao> {
  const resposta = await chamarGraph<{
    data?: Array<{ quota_usage?: number; config?: { quota_total?: number; quota_duration?: number } }>;
  }>(`${input.igUserId}/content_publishing_limit`, {
    token: input.token,
    params: { fields: "config,quota_usage" },
    rotulo: "instagram.content_publishing_limit",
  });

  const linha = resposta.data?.[0] ?? {};
  const usado = linha.quota_usage ?? 0;
  const total = linha.config?.quota_total ?? env.META_IG_DAILY_LIMIT;
  return { usado, total, restante: Math.max(0, total - usado), dentroDoLimite: usado < total };
}

/* --------------------------------------------------------- publicacao */

type ContextoIg = { igUserId: string; token: string };

async function criarContainer(
  ctx: ContextoIg,
  params: Record<string, string | number | boolean | undefined>,
  rotulo: string,
): Promise<string> {
  const r = await chamarGraph<{ id: string }>(`${ctx.igUserId}/media`, {
    token: ctx.token,
    metodo: "POST",
    params,
    rotulo,
  });
  if (!r?.id) throw new MetaApiError("A Meta nao devolveu o id do container.", 200, null, null, null, true, "temporaria");
  return r.id;
}

/**
 * Container de video fica "IN_PROGRESS" enquanto a Meta baixa e processa o
 * arquivo. Publicar antes do FINISHED da erro, por isso esperamos aqui.
 */
async function aguardarContainer(
  ctx: ContextoIg,
  containerId: string,
  tentativasMax = 30,
  intervaloMs = 5_000,
): Promise<void> {
  for (let i = 0; i < tentativasMax; i++) {
    const r = await chamarGraph<{ status_code?: string; status?: string }>(containerId, {
      token: ctx.token,
      params: { fields: "status_code,status" },
      rotulo: "instagram.container_status",
    });
    const status = r.status_code ?? "";
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new MetaApiError(
        `O Instagram recusou a midia (status ${status}): ${r.status ?? "sem detalhe"}`,
        200,
        null,
        null,
        null,
        false,
        "midia",
      );
    }
    await espera(intervaloMs);
  }
  throw new MetaApiError(
    "Tempo esgotado esperando o Instagram processar o video.",
    200,
    null,
    null,
    null,
    true,
    "temporaria",
  );
}

async function publicarContainer(ctx: ContextoIg, creationId: string): Promise<ResultadoPublicacao> {
  const r = await chamarGraph<{ id: string }>(`${ctx.igUserId}/media_publish`, {
    token: ctx.token,
    metodo: "POST",
    params: { creation_id: creationId },
    rotulo: "instagram.media_publish",
  });

  let permalink: string | null = null;
  try {
    const detalhe = await chamarGraph<{ permalink?: string }>(r.id, {
      token: ctx.token,
      params: { fields: "permalink" },
      rotulo: "instagram.permalink",
    });
    permalink = detalhe.permalink ?? null;
  } catch {
    // O post ja saiu; sem o link apenas registramos o id.
    log.warn("publicado, mas sem permalink", { mediaId: r.id });
  }

  return { externalId: r.id, permalink };
}

export async function publicarImagemUnica(
  ctx: ContextoIg,
  input: { imageUrl: string; caption: string },
): Promise<ResultadoPublicacao> {
  const container = await criarContainer(
    ctx,
    { image_url: input.imageUrl, caption: input.caption },
    "instagram.media.image",
  );
  return publicarContainer(ctx, container);
}

export async function publicarVideo(
  ctx: ContextoIg,
  input: { videoUrl: string; caption: string; reels: boolean },
): Promise<ResultadoPublicacao> {
  const container = await criarContainer(
    ctx,
    {
      video_url: input.videoUrl,
      caption: input.caption,
      media_type: input.reels ? "REELS" : "VIDEO",
    },
    input.reels ? "instagram.media.reels" : "instagram.media.video",
  );
  await aguardarContainer(ctx, container);
  return publicarContainer(ctx, container);
}

export async function publicarCarrossel(
  ctx: ContextoIg,
  input: { itens: ItemMidia[]; caption: string },
): Promise<ResultadoPublicacao> {
  const filhos: string[] = [];
  for (const item of input.itens) {
    const id = await criarContainer(
      ctx,
      item.kind === "IMAGEM"
        ? { image_url: item.url, is_carousel_item: true }
        : { video_url: item.url, media_type: "VIDEO", is_carousel_item: true },
      "instagram.media.carousel_item",
    );
    if (item.kind === "VIDEO") await aguardarContainer(ctx, id);
    filhos.push(id);
  }

  const container = await criarContainer(
    ctx,
    { media_type: "CAROUSEL", children: filhos.join(","), caption: input.caption },
    "instagram.media.carousel",
  );
  await aguardarContainer(ctx, container, 12, 3_000);
  return publicarContainer(ctx, container);
}
