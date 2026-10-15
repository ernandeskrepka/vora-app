import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { hashToken } from "@/lib/crypto.ts";
import { storage } from "@/lib/storage/index.ts";
import { agendarPublicacao, cancelarJobsDoPost } from "@/lib/queue/filas.ts";
import { aplicarTransicao } from "./transicoes.ts";
import { ErroDeRegra } from "./erros.ts";
import { notificarEquipe } from "./notificacoes.ts";
import { obterConfiguracoes } from "./configuracoes.ts";
import type { PostStatus } from "@/domain/post-status.ts";
import type { Network, PostFormat } from "@/lib/tipos.ts";
import { legendaVisivel } from "@/domain/legenda.ts";

const log = logger("aprovacao");

export type MidiaParaCliente = {
  id: string;
  kind: "IMAGEM" | "VIDEO";
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

export type ItemDoPerfil = {
  id: string;
  url: string;
  carrossel: boolean;
  video: boolean;
  quando: Date | null;
};

/** Dados para a previa de como o post fica na grade do perfil. */
export type PerfilDoCliente = {
  handle: string;
  nome: string;
  totalPublicados: number;
  publicados: ItemDoPerfil[];
};

export type VisaoAprovacao = {
  /** PENDENTE = da para decidir. Os outros estados sao somente leitura. */
  estado: "PENDENTE" | "JA_DECIDIDO" | "EXPIRADO" | "SUBSTITUIDO" | "ENCERRADO";
  postId: string;
  clienteNome: string;
  caption: string;
  formato: PostFormat;
  networks: Network[];
  scheduledAt: Date;
  timezone: string;
  statusDoPost: PostStatus;
  midias: MidiaParaCliente[];
  decisao: {
    tipo: "APROVADO" | "REPROVADO";
    nome: string;
    comentario: string | null;
    quando: Date;
  } | null;
  publicadoEm: Date | null;
  links: Array<{ network: Network; permalink: string | null }>;
  perfil: PerfilDoCliente;
};

/**
 * Carrega a pagina publica de aprovacao a partir do token do link.
 * Devolve null so quando o token nao existe (link errado ou apagado).
 */
export async function carregarPorToken(
  token: string,
): Promise<VisaoAprovacao | null> {
  const pedido = await prisma.approvalRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      decision: true,
      post: {
        include: {
          client: { include: { metaConnections: true } },
          media: { orderBy: { position: "asc" } },
          publications: true,
        },
      },
    },
  });

  if (!pedido) return null;
  const post = pedido.post;

  const midias: MidiaParaCliente[] = await Promise.all(
    post.media.map(async (m) => ({
      id: m.id,
      kind: m.kind,
      url: await storage.urlTemporaria(m.storageKey),
      mimeType: m.mimeType,
      width: m.width,
      height: m.height,
    })),
  );

  const perfil = await montarPerfil(
    post.clientId,
    post.client.name,
    post.client.metaConnections,
  );

  const expirado = pedido.expiresAt.getTime() < Date.now();
  const estado: VisaoAprovacao["estado"] = pedido.decision
    ? "JA_DECIDIDO"
    : pedido.status === "SUBSTITUIDO"
      ? "SUBSTITUIDO"
      : pedido.status === "EXPIRADO" ||
          expirado ||
          post.status !== "AGUARDANDO_APROVACAO"
        ? post.status === "POST_SEM_RESPOSTA" || post.status === "CANCELADO"
          ? "EXPIRADO"
          : "ENCERRADO"
        : "PENDENTE";

  return {
    estado,
    postId: post.id,
    clienteNome: post.client.name,
    caption: legendaVisivel(post.caption),
    formato: post.format,
    networks: post.networks,
    scheduledAt: post.scheduledAt,
    timezone: post.client.timezone,
    statusDoPost: post.status as PostStatus,
    midias,
    decisao: pedido.decision
      ? {
          tipo: pedido.decision.decision,
          nome: pedido.decision.approverName,
          comentario: pedido.decision.comment,
          quando: pedido.decision.decidedAt,
        }
      : null,
    publicadoEm: post.publishedAt,
    links: post.publications.map((p) => ({
      network: p.network,
      permalink: p.permalink,
    })),
    perfil,
  };
}

/**
 * Monta a previa do perfil: o @ do cliente e os posts que ja publicamos para
 * ele, para o cliente ver como o criativo novo fica na grade.
 *
 * Usa o que o proprio sistema publicou (nao lemos a grade real do Instagram:
 * isso exigiria outra permissao da Meta e nao muda a decisao do cliente).
 */
async function montarPerfil(
  clientId: string,
  nomeCliente: string,
  conexoes: Array<{ assetType: string; assetName: string | null }>,
): Promise<PerfilDoCliente> {
  const instagram = conexoes.find((c) => c.assetType === "INSTAGRAM");
  const handle = (instagram?.assetName ?? nomeCliente)
    .replace(/^@/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "");

  const [publicados, total] = await Promise.all([
    prisma.post.findMany({
      where: { clientId, status: "PUBLICADO" },
      include: { media: { orderBy: { position: "asc" } } },
      orderBy: { publishedAt: "desc" },
      take: 11,
    }),
    prisma.post.count({ where: { clientId, status: "PUBLICADO" } }),
  ]);

  const itens: ItemDoPerfil[] = await Promise.all(
    publicados
      .filter((p) => p.media.length > 0)
      .map(async (p) => ({
        id: p.id,
        url: await storage.urlTemporaria(p.media[0].storageKey),
        carrossel: p.media.length > 1,
        video: p.media[0].kind === "VIDEO",
        quando: p.publishedAt,
      })),
  );

  return {
    handle,
    nome: nomeCliente,
    totalPublicados: total,
    publicados: itens,
  };
}

export type EntradaDecisao = {
  token: string;
  nome: string;
  decisao: "APROVADO" | "REPROVADO";
  comentario?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Registra a decisao do cliente. E o unico ponto do sistema que leva um
 * post para APROVADO, e portanto o unico caminho para a fila de publicacao.
 */
export async function registrarDecisao(entrada: EntradaDecisao): Promise<{
  decisao: "APROVADO" | "REPROVADO";
  postId: string;
}> {
  const nome = entrada.nome.trim();
  const comentario = entrada.comentario?.trim() || null;

  if (nome.length < 2)
    throw new ErroDeRegra("Digite seu nome para registrar quem aprovou.");
  if (nome.length > 120) throw new ErroDeRegra("Nome muito longo.");
  if (entrada.decisao === "REPROVADO" && !comentario) {
    throw new ErroDeRegra("Para reprovar, escreva o que precisa ser ajustado.");
  }
  if (comentario && comentario.length > 2000)
    throw new ErroDeRegra("Comentario muito longo.");

  const pedido = await prisma.approvalRequest.findUnique({
    where: { tokenHash: hashToken(entrada.token) },
    include: {
      decision: true,
      post: { include: { client: { include: { contacts: true } } } },
    },
  });

  if (!pedido) throw new ErroDeRegra("Link invalido.");
  if (pedido.decision || pedido.status === "DECIDIDO") {
    throw new ErroDeRegra("Esse post ja foi respondido.");
  }
  if (pedido.status === "SUBSTITUIDO") {
    throw new ErroDeRegra(
      "Esse link foi substituido por uma versao mais nova do post.",
    );
  }
  if (pedido.status === "EXPIRADO" || pedido.expiresAt.getTime() < Date.now()) {
    throw new ErroDeRegra(
      "O prazo desse post terminou. Fale com a equipe da VORA.",
    );
  }

  const post = pedido.post;
  if (post.status !== "AGUARDANDO_APROVACAO") {
    throw new ErroDeRegra("Esse post nao esta mais aguardando aprovacao.");
  }
  if (pedido.postVersion !== post.version) {
    throw new ErroDeRegra("Esse link e de uma versao anterior do post.");
  }

  const evento =
    entrada.decisao === "APROVADO" ? "CLIENTE_APROVOU" : "CLIENTE_REPROVOU";

  await prisma.$transaction(async (tx) => {
    await tx.approvalDecision.create({
      data: {
        approvalRequestId: pedido.id,
        postId: post.id,
        postVersion: post.version,
        decision: entrada.decisao,
        approverName: nome,
        comment: comentario,
        ipAddress: entrada.ipAddress ?? null,
        userAgent: entrada.userAgent ?? null,
      },
    });

    await tx.approvalRequest.update({
      where: { id: pedido.id },
      data: { status: "DECIDIDO", decidedAt: new Date() },
    });

    await aplicarTransicao(tx, {
      post: {
        id: post.id,
        status: post.status as PostStatus,
        version: post.version,
      },
      evento,
      ator: {
        tipo: "CLIENTE",
        nome,
        ipAddress: entrada.ipAddress,
        userAgent: entrada.userAgent,
      },
      acao:
        entrada.decisao === "APROVADO" ? "cliente_aprovou" : "cliente_reprovou",
      metadata: {
        versao: post.version,
        comentario,
        pedidoId: pedido.id,
      },
      dadosExtra:
        entrada.decisao === "APROVADO"
          ? { approvedAt: new Date() }
          : { approvedAt: null },
    });
  });

  await cancelarJobsDoPost(
    post.id,
    (await obterConfiguracoes()).lembretesHoras,
  );

  if (entrada.decisao === "APROVADO") {
    await agendarPublicacao({
      postId: post.id,
      postVersion: post.version,
      quando: post.scheduledAt,
    });
    log.info("post aprovado pelo cliente e agendado", {
      postId: post.id,
      quando: post.scheduledAt.toISOString(),
    });
  } else {
    await notificarEquipe({
      tipo: "POST_REPROVADO",
      titulo: "Post reprovado pelo cliente",
      linhas: [
        `Cliente: ${post.client.name}`,
        `Quem reprovou: ${nome}`,
        `Comentario: ${comentario ?? "(sem comentario)"}`,
        `Horario previsto: ${post.scheduledAt.toISOString()}`,
        `Painel: ${env.APP_URL}/posts/${post.id}`,
      ],
      postId: post.id,
      clientId: post.clientId,
    });
    log.info("post reprovado pelo cliente", { postId: post.id });
  }

  return { decisao: entrada.decisao, postId: post.id };
}
