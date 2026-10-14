import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { logger } from "@/lib/logger.ts";
import { decifrarSegredo } from "@/lib/crypto.ts";
import { MetaApiError } from "./graph.ts";
import {
  consultarLimitePublicacao,
  publicarCarrossel,
  publicarImagemUnica,
  publicarVideo,
  type ItemMidia,
  type ResultadoPublicacao,
} from "./instagram.ts";
import {
  publicarFotoNaPagina,
  publicarMultiplasNaPagina,
  publicarVideoNaPagina,
} from "./facebook.ts";
import type { MetaConnection } from "@/lib/tipos.ts";

const log = logger("meta");

export { MetaApiError } from "./graph.ts";
export type { ItemMidia, ResultadoPublicacao } from "./instagram.ts";
export { consultarLimitePublicacao } from "./instagram.ts";

export type PostFormat = "IMAGEM_UNICA" | "CARROSSEL" | "VIDEO" | "REELS";

export type PedidoDePublicacao = {
  network: "INSTAGRAM" | "FACEBOOK";
  formato: PostFormat;
  caption: string;
  itens: ItemMidia[];
  conexao: MetaConnection;
};

export function modoDryRun(): boolean {
  return env.META_DRY_RUN;
}

/**
 * Token de acesso da conexao. Preferimos o token da propria conexao
 * (OAuth do cliente); se nao houver, usamos o System User da agencia.
 */
export function tokenDaConexao(conexao: MetaConnection): string {
  if (conexao.tokenCiphertext) return decifrarSegredo(conexao.tokenCiphertext);
  if (env.META_SYSTEM_USER_TOKEN) return env.META_SYSTEM_USER_TOKEN;
  throw new MetaApiError(
    "Conexao sem token: conecte a conta do cliente ou configure META_SYSTEM_USER_TOKEN.",
    0,
    null,
    null,
    null,
    false,
    "token",
  );
}

/**
 * Ponto unico de publicacao. Com META_DRY_RUN=true nada sai: devolvemos um
 * resultado simulado e o worker grava a tentativa como se fosse real. E
 * assim que o piloto roda antes da aprovacao do app pela Meta.
 */
export async function publicar(pedido: PedidoDePublicacao): Promise<ResultadoPublicacao & { dryRun: boolean }> {
  if (modoDryRun()) {
    const falso = `dryrun_${pedido.network.toLowerCase()}_${randomUUID().slice(0, 8)}`;
    log.warn("DRY-RUN: publicacao simulada, nada foi enviado para a Meta", {
      network: pedido.network,
      formato: pedido.formato,
      itens: pedido.itens.length,
      assetId: pedido.conexao.assetId,
    });
    return {
      externalId: falso,
      permalink: `https://exemplo.local/dry-run/${falso}`,
      dryRun: true,
    };
  }

  const token = tokenDaConexao(pedido.conexao);

  if (pedido.network === "INSTAGRAM") {
    const ctx = { igUserId: pedido.conexao.assetId, token };

    const limite = await consultarLimitePublicacao(ctx);
    if (!limite.dentroDoLimite) {
      throw new MetaApiError(
        `Conta do Instagram no limite de publicacoes da API (${limite.usado}/${limite.total} em 24 h).`,
        429,
        4,
        null,
        null,
        true,
        "limite",
      );
    }

    const resultado = await publicarNoInstagram(ctx, pedido);
    return { ...resultado, dryRun: false };
  }

  const ctx = { pageId: pedido.conexao.assetId, token };
  const resultado = await publicarNoFacebook(ctx, pedido);
  return { ...resultado, dryRun: false };
}

async function publicarNoInstagram(
  ctx: { igUserId: string; token: string },
  pedido: PedidoDePublicacao,
): Promise<ResultadoPublicacao> {
  switch (pedido.formato) {
    case "IMAGEM_UNICA":
      return publicarImagemUnica(ctx, { imageUrl: pedido.itens[0].url, caption: pedido.caption });
    case "CARROSSEL":
      return publicarCarrossel(ctx, { itens: pedido.itens, caption: pedido.caption });
    case "VIDEO":
      return publicarVideo(ctx, { videoUrl: pedido.itens[0].url, caption: pedido.caption, reels: false });
    case "REELS":
      return publicarVideo(ctx, { videoUrl: pedido.itens[0].url, caption: pedido.caption, reels: true });
  }
}

async function publicarNoFacebook(
  ctx: { pageId: string; token: string },
  pedido: PedidoDePublicacao,
): Promise<ResultadoPublicacao> {
  switch (pedido.formato) {
    case "IMAGEM_UNICA":
      return publicarFotoNaPagina(ctx, { imageUrl: pedido.itens[0].url, caption: pedido.caption });
    case "CARROSSEL":
      return publicarMultiplasNaPagina(ctx, { itens: pedido.itens, caption: pedido.caption });
    case "VIDEO":
    case "REELS":
      return publicarVideoNaPagina(ctx, { videoUrl: pedido.itens[0].url, caption: pedido.caption });
  }
}
