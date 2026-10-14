import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { storage } from "@/lib/storage/index.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { cancelarJobsDoPost } from "@/lib/queue/filas.ts";
import { MetaApiError, modoDryRun, publicar, type ItemMidia } from "@/lib/meta/index.ts";
import { aplicarTransicao } from "./transicoes.ts";
import { avisarClientePostPublicado, notificarEquipe } from "./notificacoes.ts";
import { carregarPost } from "./posts.ts";
import { obterConfiguracoes } from "./configuracoes.ts";
import type { PostStatus } from "@/domain/post-status.ts";
import type { Network } from "@/lib/tipos.ts";

const log = logger("publicacao");

/** Meia hora de validade na URL assinada: a Meta baixa a midia nesse prazo. */
const TTL_URL_MIDIA_SEGUNDOS = 7_200;

export type ResultadoPublicacaoPost =
  | { resultado: "publicado"; redes: Network[] }
  | { resultado: "falhou"; motivo: string }
  | { resultado: "abortado"; motivo: string }
  | { resultado: "ignorado"; motivo: string };

type PostCompleto = Awaited<ReturnType<typeof carregarPost>>;

/**
 * Revalidacao no disparo.
 *
 * E aqui que a trava de aprovacao vale de verdade: mesmo com um job antigo
 * na fila, nada e publicado se o post nao estiver aprovado na versao atual
 * e com a conexao da Meta valida.
 */
function revalidar(post: PostCompleto): { ok: true } | { ok: false; motivo: string } {
  if (post.status !== "APROVADO" && post.status !== "PUBLICANDO") {
    return { ok: false, motivo: `o post esta em "${post.status}", e nao aprovado` };
  }

  const decisao = post.decisions.find(
    (d) => d.postVersion === post.version && d.decision === "APROVADO",
  );
  if (!decisao) {
    return {
      ok: false,
      motivo: `nao existe aprovacao do cliente para a versao ${post.version} do post`,
    };
  }

  if (post.media.length === 0) return { ok: false, motivo: "o post nao tem criativo" };
  if (post.networks.length === 0) return { ok: false, motivo: "o post nao tem rede de destino" };

  for (const network of post.networks) {
    const tipo = network === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK_PAGE";
    const conexao = post.client.metaConnections.find((c) => c.assetType === tipo);
    if (!conexao) {
      return { ok: false, motivo: `o cliente nao tem conexao ${network} cadastrada` };
    }
    if (conexao.status !== "CONECTADO") {
      if (modoDryRun()) {
        log.warn("dry-run: seguindo com conexao fora de CONECTADO", {
          postId: post.id,
          network,
          status: conexao.status,
        });
      } else {
        return { ok: false, motivo: `a conexao ${network} do cliente esta "${conexao.status}"` };
      }
    }
  }

  return { ok: true };
}

async function itensDeMidia(post: PostCompleto): Promise<ItemMidia[]> {
  return Promise.all(
    post.media.map(async (m) => ({
      url: await storage.urlTemporaria(m.storageKey, TTL_URL_MIDIA_SEGUNDOS),
      kind: m.kind as "IMAGEM" | "VIDEO",
    })),
  );
}

function espera(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Publica um post aprovado. Chamado pelo worker no horario marcado.
 *
 * Idempotente por post e rede: uma rede que ja tem registro em
 * PostPublication nunca e publicada de novo.
 */
export async function publicarPost(input: {
  postId: string;
  baseBackoffMs?: number;
}): Promise<ResultadoPublicacaoPost> {
  const baseBackoff = input.baseBackoffMs ?? 30_000;
  const post = await carregarPost(input.postId);

  // Reentrega de job depois de um sucesso: nada a fazer (idempotencia).
  // Essa checagem vem antes da revalidacao de proposito: um post ja
  // publicado nao esta mais "aprovado", e isso nao e um erro.
  const jaPublicadasAgora = new Set(post.publications.map((p) => p.network));
  if (post.networks.every((n) => jaPublicadasAgora.has(n))) {
    log.info("todas as redes ja publicadas; nada a fazer", { postId: post.id });
    return { resultado: "ignorado", motivo: "post ja publicado em todas as redes" };
  }

  const checagem = revalidar(post);
  if (!checagem.ok) {
    log.warn("publicacao abortada na revalidacao", { postId: post.id, motivo: checagem.motivo });

    await registrarAuditoria({
      entityType: "post",
      entityId: post.id,
      action: "publicacao_abortada",
      actorType: "SISTEMA",
      actorName: "worker",
      fromStatus: post.status,
      toStatus: post.status,
      metadata: { motivo: checagem.motivo, versao: post.version },
    });

    await notificarEquipe({
      tipo: "FALHA_DE_PUBLICACAO",
      titulo: "Publicacao nao realizada",
      linhas: [
        `Cliente: ${post.client.name}`,
        `Motivo: ${checagem.motivo}`,
        `Painel: ${env.APP_URL}/posts/${post.id}`,
      ],
      postId: post.id,
      clientId: post.clientId,
    });

    return { resultado: "abortado", motivo: checagem.motivo };
  }

  // Redes que ainda faltam (retomada segura apos falha parcial).
  const pendentes = post.networks.filter((n) => !jaPublicadasAgora.has(n));

  if (post.status === "APROVADO") {
    await prisma.$transaction(async (tx) => {
      await aplicarTransicao(tx, {
        post: { id: post.id, status: post.status as PostStatus, version: post.version },
        evento: "INICIAR_PUBLICACAO",
        ator: { tipo: "SISTEMA", nome: "worker" },
        acao: "publicacao_iniciada",
        metadata: { redes: pendentes, dryRun: modoDryRun() },
      });
    });
  }

  const itens = await itensDeMidia(post);
  const erros: string[] = [];
  const publicadas: Network[] = [];

  for (const network of pendentes) {
    const tipo = network === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK_PAGE";
    const conexao = post.client.metaConnections.find((c) => c.assetType === tipo)!;

    let ultimoErro: unknown = null;
    // As tentativas sao numeradas de forma continua por post e rede, para a
    // trilha mostrar o historico inteiro (inclusive de rodadas anteriores).
    const tentativasAnteriores = await prisma.publishAttempt.count({
      where: { postId: post.id, network },
    });

    for (let rodada = 1; rodada <= env.PUBLISH_MAX_ATTEMPTS; rodada++) {
      const tentativa = tentativasAnteriores + rodada;
      const inicio = new Date();
      try {
        const r = await publicar({
          network,
          formato: post.format,
          caption: post.caption,
          itens,
          conexao,
        });

        await prisma.$transaction(async (tx) => {
          await tx.publishAttempt.create({
            data: {
              postId: post.id,
              network,
              attempt: tentativa,
              status: "SUCESSO",
              dryRun: r.dryRun,
              externalId: r.externalId,
              permalink: r.permalink,
              requestSummary: `${network} ${post.format} (${itens.length} arquivo(s))`,
              startedAt: inicio,
              finishedAt: new Date(),
            },
          });
          await tx.postPublication.create({
            data: {
              postId: post.id,
              network,
              externalId: r.externalId,
              permalink: r.permalink,
              dryRun: r.dryRun,
            },
          });
        });

        publicadas.push(network);
        log.info("publicado", { postId: post.id, network, externalId: r.externalId, dryRun: r.dryRun });
        ultimoErro = null;
        break;
      } catch (erro) {
        ultimoErro = erro;
        const metaErro = erro instanceof MetaApiError ? erro : null;

        await prisma.publishAttempt.create({
          data: {
            postId: post.id,
            network,
            attempt: tentativa,
            status: "ERRO",
            dryRun: modoDryRun(),
            errorCode: metaErro ? String(metaErro.codigo ?? metaErro.httpStatus) : null,
            errorMessage: erro instanceof Error ? erro.message : String(erro),
            requestSummary: `${network} ${post.format} (${itens.length} arquivo(s))`,
            responseBody: metaErro
              ? {
                  tipoFalha: metaErro.tipoFalha,
                  retentavel: metaErro.retentavel,
                  fbtraceId: metaErro.fbtraceId,
                  httpStatus: metaErro.httpStatus,
                }
              : undefined,
            startedAt: inicio,
            finishedAt: new Date(),
          },
        });

        const vaiTentarDeNovo =
          rodada < env.PUBLISH_MAX_ATTEMPTS && (metaErro ? metaErro.retentavel : true);

        log.error("falha ao publicar", {
          postId: post.id,
          network,
          tentativa,
          rodada,
          vaiTentarDeNovo,
          erro: erro instanceof Error ? erro.message : String(erro),
        });

        if (!vaiTentarDeNovo) break;
        // Backoff exponencial: 30 s, 60 s, 120 s...
        await espera(baseBackoff * 2 ** (rodada - 1));
      }
    }

    if (ultimoErro) {
      erros.push(
        `${network}: ${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`,
      );
    }
  }

  const postAtual = await prisma.post.findUniqueOrThrow({
    where: { id: post.id },
    include: { publications: true },
  });
  const faltando = post.networks.filter(
    (n) => !postAtual.publications.some((p) => p.network === n),
  );

  if (faltando.length === 0) {
    await prisma.$transaction(async (tx) => {
      await aplicarTransicao(tx, {
        post: { id: post.id, status: "PUBLICANDO", version: post.version },
        evento: "PUBLICACAO_CONCLUIDA",
        ator: { tipo: "SISTEMA", nome: "worker" },
        acao: "post_publicado",
        metadata: {
          redes: postAtual.publications.map((p) => p.network),
          dryRun: postAtual.publications.some((p) => p.dryRun),
        },
        dadosExtra: { publishedAt: new Date(), lastError: null },
      });
    });

    await cancelarJobsDoPost(post.id, (await obterConfiguracoes()).lembretesHoras);

    const aprovadores = post.client.contacts.filter((c) => c.isApprover && c.active);
    const primeiroLink =
      postAtual.publications.find((p) => p.permalink)?.permalink ?? `${env.APP_URL}/posts/${post.id}`;
    if (aprovadores.length > 0) {
      await avisarClientePostPublicado({
        post,
        cliente: post.client,
        contatos: aprovadores,
        redes: postAtual.publications.map((p) => (p.network === "INSTAGRAM" ? "Instagram" : "Facebook")).join(" e "),
        link: primeiroLink,
      });
    }

    return { resultado: "publicado", redes: postAtual.publications.map((p) => p.network) };
  }

  const motivo = erros.join(" | ") || `nao foi possivel publicar em ${faltando.join(", ")}`;

  await prisma.$transaction(async (tx) => {
    await aplicarTransicao(tx, {
      post: { id: post.id, status: "PUBLICANDO", version: post.version },
      evento: "PUBLICACAO_FALHOU",
      ator: { tipo: "SISTEMA", nome: "worker" },
      acao: "publicacao_falhou",
      metadata: { faltando, erros },
      dadosExtra: { lastError: motivo.slice(0, 1000) },
    });
  });

  await notificarEquipe({
    tipo: "FALHA_DE_PUBLICACAO",
    titulo: "Falha ao publicar",
    linhas: [
      `Cliente: ${post.client.name}`,
      `Redes com falha: ${faltando.join(", ")}`,
      `Erro: ${motivo}`,
      publicadas.length > 0 ? `Publicado com sucesso em: ${publicadas.join(", ")}` : "",
      `Painel: ${env.APP_URL}/posts/${post.id}`,
    ].filter(Boolean),
    postId: post.id,
    clientId: post.clientId,
  });

  return { resultado: "falhou", motivo };
}
