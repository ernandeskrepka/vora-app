import { chamarGraph } from "./graph.ts";
import type { ItemMidia, ResultadoPublicacao } from "./instagram.ts";

type ContextoPagina = { pageId: string; token: string };

/**
 * Publicacao em Pagina do Facebook.
 *
 * Decisao de projeto: NAO usamos `scheduled_publish_time`. O agendamento e
 * nosso (BullMQ) para que a trava de aprovacao valha ate o ultimo segundo e
 * a regra seja igual para Instagram e Facebook.
 */

export async function publicarFotoNaPagina(
  ctx: ContextoPagina,
  input: { imageUrl: string; caption: string },
): Promise<ResultadoPublicacao> {
  const r = await chamarGraph<{ id?: string; post_id?: string }>(`${ctx.pageId}/photos`, {
    token: ctx.token,
    metodo: "POST",
    params: { url: input.imageUrl, caption: input.caption, published: true },
    rotulo: "facebook.photos",
  });
  const id = r.post_id ?? r.id ?? "";
  return { externalId: id, permalink: id ? `https://www.facebook.com/${id}` : null };
}

export async function publicarVideoNaPagina(
  ctx: ContextoPagina,
  input: { videoUrl: string; caption: string },
): Promise<ResultadoPublicacao> {
  const r = await chamarGraph<{ id?: string; post_id?: string }>(`${ctx.pageId}/videos`, {
    token: ctx.token,
    metodo: "POST",
    params: { file_url: input.videoUrl, description: input.caption },
    rotulo: "facebook.videos",
  });
  const id = r.post_id ?? r.id ?? "";
  return { externalId: id, permalink: id ? `https://www.facebook.com/${id}` : null };
}

/**
 * Varias midias: sobe cada foto sem publicar (published=false) e depois
 * monta um post no feed com todas anexadas.
 */
export async function publicarMultiplasNaPagina(
  ctx: ContextoPagina,
  input: { itens: ItemMidia[]; caption: string },
): Promise<ResultadoPublicacao> {
  const anexos: Record<string, string> = {};

  for (const [i, item] of input.itens.entries()) {
    if (item.kind === "VIDEO") {
      // Feed do Facebook nao mistura video em post com varias fotos.
      continue;
    }
    const foto = await chamarGraph<{ id: string }>(`${ctx.pageId}/photos`, {
      token: ctx.token,
      metodo: "POST",
      params: { url: item.url, published: false },
      rotulo: "facebook.photos.unpublished",
    });
    anexos[`attached_media[${i}]`] = JSON.stringify({ media_fbid: foto.id });
  }

  const r = await chamarGraph<{ id: string }>(`${ctx.pageId}/feed`, {
    token: ctx.token,
    metodo: "POST",
    params: { message: input.caption, ...anexos },
    rotulo: "facebook.feed",
  });
  return { externalId: r.id, permalink: r.id ? `https://www.facebook.com/${r.id}` : null };
}
