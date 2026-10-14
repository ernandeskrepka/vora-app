import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { hashToken, tokenDoPedido } from "@/lib/crypto.ts";
import { chaveDeMidia, storage } from "@/lib/storage/index.ts";
import { processarArquivo, type ArquivoRecebido } from "@/lib/media/processar.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import {
  agendarCorteSemResposta,
  agendarLembretes,
  agendarPublicacao,
  cancelarJobsDoPost,
} from "@/lib/queue/filas.ts";
import { validarMidiaDoPost, type Problema } from "@/domain/formatos.ts";
import { podeEditar, podeEnviarParaAprovacao, type PostStatus } from "@/domain/post-status.ts";
import { aplicarTransicao, type Ator } from "./transicoes.ts";
import { ErroDeRegra, NaoEncontradoError } from "./erros.ts";
import { enviarPedidoDeAprovacao, notificarEquipe } from "./notificacoes.ts";
import { obterConfiguracoes } from "./configuracoes.ts";
import type { Network, PostFormat } from "@/lib/tipos.ts";

const log = logger("posts");

export const INCLUDE_POST_COMPLETO = {
  client: { include: { contacts: true, metaConnections: true } },
  media: { orderBy: { position: "asc" } },
  approvalRequests: {
    orderBy: { createdAt: "desc" },
    include: { decision: true },
  },
  decisions: { orderBy: { decidedAt: "desc" } },
  publishAttempts: { orderBy: { startedAt: "desc" } },
  publications: true,
  createdBy: { select: { id: true, name: true } },
} as const;

export async function carregarPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: INCLUDE_POST_COMPLETO,
  });
  if (!post) throw new NaoEncontradoError("Post nao encontrado.");
  return post;
}

export function linkDeAprovacao(token: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/aprovar/${token}`;
}

/* ------------------------------------------------------------- midia */

type MidiaPreparada = Awaited<ReturnType<typeof processarArquivo>>;

/**
 * Converte itens da biblioteca do cliente em midia de post. O arquivo ja foi
 * processado quando entrou na biblioteca, entao aqui so lemos os bytes.
 */
async function midiasDeMateriais(assetIds: string[]): Promise<MidiaPreparada[]> {
  if (assetIds.length === 0) return [];

  const itens = await prisma.clientAsset.findMany({ where: { id: { in: assetIds } } });
  const porId = new Map(itens.map((i) => [i.id, i]));

  const midias: MidiaPreparada[] = [];
  for (const id of assetIds) {
    const item = porId.get(id);
    if (!item) throw new ErroDeRegra("Material nao encontrado na biblioteca do cliente.");
    if (item.kind === "DOCUMENTO") {
      throw new ErroDeRegra(
        `"${item.originalFilename ?? "arquivo"}" e um documento e nao pode virar criativo.`,
      );
    }
    midias.push({
      kind: item.kind as "IMAGEM" | "VIDEO",
      mimeType: item.mimeType,
      conteudo: await storage.ler(item.storageKey),
      extensao: item.storageKey.split(".").pop() ?? "jpg",
      sizeBytes: item.sizeBytes,
      width: item.width,
      height: item.height,
      durationSeconds: item.durationSeconds,
      originalFilename: item.originalFilename ?? "material",
      convertido: false,
    });
  }
  return midias;
}

/**
 * Processa (converte imagens para JPEG, mede video) e valida antes de
 * gravar qualquer coisa: post invalido nao chega ao banco.
 */
async function prepararMidia(input: {
  arquivos: ArquivoRecebido[];
  formato: PostFormat;
  networks: Network[];
  /** Midia que ja veio pronta (biblioteca do cliente), na frente da fila. */
  jaPreparadas?: MidiaPreparada[];
}): Promise<{ midias: MidiaPreparada[]; avisos: Problema[] }> {
  const midias: MidiaPreparada[] = [...(input.jaPreparadas ?? [])];
  for (const arquivo of input.arquivos) {
    midias.push(await processarArquivo(arquivo));
  }

  const validacao = validarMidiaDoPost({
    formato: input.formato,
    networks: input.networks,
    arquivos: midias.map((m) => ({
      kind: m.kind,
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      width: m.width,
      height: m.height,
      durationSeconds: m.durationSeconds,
      originalFilename: m.originalFilename,
    })),
  });

  if (!validacao.ok) {
    throw new ErroDeRegra(
      "O criativo nao passou na validacao de formato.",
      validacao.erros,
    );
  }

  return { midias, avisos: validacao.avisos };
}

async function gravarMidia(input: {
  postId: string;
  clientSlug: string;
  midias: MidiaPreparada[];
}) {
  const linhas = [];
  for (const [i, m] of input.midias.entries()) {
    const key = chaveDeMidia({
      clientSlug: input.clientSlug,
      postId: input.postId,
      posicao: i,
      extensao: m.extensao,
    });
    await storage.salvar(key, m.conteudo, m.mimeType);
    linhas.push({
      postId: input.postId,
      position: i,
      kind: m.kind,
      storageKey: key,
      mimeType: m.mimeType,
      width: m.width,
      height: m.height,
      sizeBytes: m.sizeBytes,
      durationSeconds: m.durationSeconds,
      originalFilename: m.originalFilename,
    });
  }
  await prisma.postMedia.createMany({ data: linhas });
  return linhas;
}

/* ------------------------------------------------------------ criacao */

export type DadosDoPost = {
  clientId: string;
  caption: string;
  formato: PostFormat;
  networks: Network[];
  scheduledAt: Date;
};

export async function criarPost(input: {
  dados: DadosDoPost;
  arquivos: ArquivoRecebido[];
  /** Itens da biblioteca do cliente usados como criativo. */
  materiaisIds?: string[];
  ator: Ator;
}): Promise<{ postId: string; avisos: Problema[] }> {
  const cliente = await prisma.client.findUnique({ where: { id: input.dados.clientId } });
  if (!cliente) throw new ErroDeRegra("Cliente nao encontrado.");
  if (input.dados.scheduledAt.getTime() < Date.now()) {
    throw new ErroDeRegra("A data e hora de publicacao precisa estar no futuro.");
  }

  const daBiblioteca = await midiasDeMateriais(input.materiaisIds ?? []);
  const { midias, avisos } = await prepararMidia({
    arquivos: input.arquivos,
    formato: input.dados.formato,
    networks: input.dados.networks,
    jaPreparadas: daBiblioteca,
  });

  const post = await prisma.post.create({
    data: {
      clientId: input.dados.clientId,
      caption: input.dados.caption,
      format: input.dados.formato,
      networks: input.dados.networks,
      scheduledAt: input.dados.scheduledAt,
      status: "RASCUNHO",
      createdById: input.ator.usuarioId ?? null,
    },
  });

  await gravarMidia({ postId: post.id, clientSlug: cliente.slug, midias });

  await registrarAuditoria({
    entityType: "post",
    entityId: post.id,
    action: "post_criado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    toStatus: "RASCUNHO",
    metadata: {
      formato: input.dados.formato,
      networks: input.dados.networks,
      arquivos: midias.length,
      convertidosParaJpeg: midias.filter((m) => m.convertido).length,
    },
    ipAddress: input.ator.ipAddress ?? null,
    userAgent: input.ator.userAgent ?? null,
  });

  log.info("post criado", { postId: post.id, clienteId: cliente.id });
  return { postId: post.id, avisos };
}

/* ------------------------------------------------------------- edicao */

/**
 * Edicao da agencia. Sempre derruba a aprovacao: o post volta para
 * RASCUNHO, a versao sobe, os links antigos param de valer e os jobs
 * agendados sao cancelados.
 *
 * Se o post ja estava com o cliente (ou aprovado), um novo pedido de
 * aprovacao e enviado automaticamente para a nova versao.
 */
export async function atualizarPost(input: {
  postId: string;
  dados: Partial<Omit<DadosDoPost, "clientId">>;
  arquivos?: ArquivoRecebido[];
  ator: Ator;
}): Promise<{ avisos: Problema[]; novoPedidoEnviado: boolean }> {
  const post = await carregarPost(input.postId);

  if (!podeEditar(post.status as PostStatus)) {
    throw new ErroDeRegra(
      `Nao e possivel editar um post com status "${post.status}".`,
    );
  }

  const caption = input.dados.caption ?? post.caption;
  const formato = input.dados.formato ?? post.format;
  const networks = input.dados.networks ?? post.networks;
  const scheduledAt = input.dados.scheduledAt ?? post.scheduledAt;
  const trocaMidia = (input.arquivos?.length ?? 0) > 0;

  const mudou =
    trocaMidia ||
    caption !== post.caption ||
    formato !== post.format ||
    scheduledAt.getTime() !== post.scheduledAt.getTime() ||
    networks.join(",") !== post.networks.join(",");

  if (!mudou) return { avisos: [], novoPedidoEnviado: false };

  if (scheduledAt.getTime() < Date.now()) {
    throw new ErroDeRegra("A data e hora de publicacao precisa estar no futuro.");
  }

  // Valida o conjunto final (midia nova ou a que ja estava no post).
  let midias: MidiaPreparada[] | null = null;
  let avisos: Problema[] = [];

  if (trocaMidia) {
    const r = await prepararMidia({ arquivos: input.arquivos!, formato, networks });
    midias = r.midias;
    avisos = r.avisos;
  } else {
    const validacao = validarMidiaDoPost({
      formato,
      networks,
      arquivos: post.media.map((m) => ({
        kind: m.kind,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        width: m.width,
        height: m.height,
        durationSeconds: m.durationSeconds,
        originalFilename: m.originalFilename,
      })),
    });
    if (!validacao.ok) {
      throw new ErroDeRegra("A alteracao deixa o criativo fora das regras de formato.", validacao.erros);
    }
    avisos = validacao.avisos;
  }

  const estavaComCliente = post.status === "AGUARDANDO_APROVACAO" || post.status === "APROVADO";
  const chavesAntigas = post.media.map((m) => m.storageKey);

  await prisma.$transaction(async (tx) => {
    await aplicarTransicao(tx, {
      post: { id: post.id, status: post.status as PostStatus, version: post.version },
      evento: "AGENCIA_EDITOU",
      ator: input.ator,
      acao: "post_editado",
      metadata: {
        alterou: {
          legenda: caption !== post.caption,
          formato: formato !== post.format,
          redes: networks.join(",") !== post.networks.join(","),
          horario: scheduledAt.getTime() !== post.scheduledAt.getTime(),
          midia: trocaMidia,
        },
        versaoAnterior: post.version,
      },
      dadosExtra: {
        caption,
        format: formato,
        networks,
        scheduledAt,
        version: { increment: 1 },
        approvedAt: null,
        lastError: null,
      },
    });

    // Links da versao anterior deixam de valer.
    await tx.approvalRequest.updateMany({
      where: { postId: post.id, status: "PENDENTE" },
      data: { status: "SUBSTITUIDO" },
    });

    if (midias) {
      await tx.postMedia.deleteMany({ where: { postId: post.id } });
    }
  });

  if (midias) {
    await gravarMidia({ postId: post.id, clientSlug: post.client.slug, midias });
    // Arquivos antigos: remocao e melhor esforco, nao bloqueia a edicao.
    for (const key of chavesAntigas) {
      await storage.remover(key).catch(() => undefined);
    }
  }

  await cancelarJobsDoPost(post.id, (await obterConfiguracoes()).lembretesHoras);

  let novoPedidoEnviado = false;
  if (estavaComCliente) {
    await enviarParaAprovacao({ postId: post.id, ator: input.ator, motivo: "nova_versao" });
    novoPedidoEnviado = true;
  }

  log.info("post editado", { postId: post.id, novaVersao: post.version + 1, novoPedidoEnviado });
  return { avisos, novoPedidoEnviado };
}

/* -------------------------------------------------- pedido de aprovacao */

/**
 * Gera o link e manda para o cliente pelo WhatsApp.
 * Agenda os lembretes e o corte de POST SEM RESPOSTA no horario do post.
 */
export async function enviarParaAprovacao(input: {
  postId: string;
  ator: Ator;
  motivo?: "primeiro_envio" | "nova_versao";
}): Promise<{ link: string; contatos: number }> {
  const post = await carregarPost(input.postId);

  if (!podeEnviarParaAprovacao(post.status as PostStatus)) {
    throw new ErroDeRegra(
      `Um post com status "${post.status}" nao pode ser enviado para aprovacao.`,
    );
  }
  if (post.media.length === 0) {
    throw new ErroDeRegra("O post nao tem criativo. Suba o arquivo antes de pedir aprovacao.");
  }

  const aprovadores = post.client.contacts.filter((c) => c.isApprover && c.active);
  if (aprovadores.length === 0) {
    throw new ErroDeRegra(
      `O cliente ${post.client.name} nao tem contato aprovador cadastrado. Cadastre um WhatsApp em Clientes.`,
    );
  }

  const validacao = validarMidiaDoPost({
    formato: post.format,
    networks: post.networks,
    arquivos: post.media.map((m) => ({
      kind: m.kind,
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      width: m.width,
      height: m.height,
      durationSeconds: m.durationSeconds,
      originalFilename: m.originalFilename,
    })),
  });
  if (!validacao.ok) {
    throw new ErroDeRegra("O criativo nao passou na validacao de formato.", validacao.erros);
  }

  // O link morre no horario do post; se o post esta muito longe, limita no TTL.
  const tetoTtl = new Date(Date.now() + env.APPROVAL_TOKEN_TTL_HOURS * 3_600_000);
  const expiresAt = post.scheduledAt < tetoTtl ? post.scheduledAt : tetoTtl;

  // O id e gerado aqui para podermos derivar o token antes de gravar.
  const pedidoId = randomUUID();
  const token = tokenDoPedido(pedidoId);

  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.updateMany({
      where: { postId: post.id, status: "PENDENTE" },
      data: { status: "SUBSTITUIDO" },
    });

    await tx.approvalRequest.create({
      data: {
        id: pedidoId,
        postId: post.id,
        postVersion: post.version,
        tokenHash: hashToken(token),
        status: "PENDENTE",
        channel: env.WHATSAPP_MODE === "log" ? "LOG" : "WHATSAPP",
        sentAt: new Date(),
        expiresAt,
      },
    });

    await aplicarTransicao(tx, {
      post: { id: post.id, status: post.status as PostStatus, version: post.version },
      evento: "ENVIAR_PARA_APROVACAO",
      ator: input.ator,
      acao: "pedido_de_aprovacao_enviado",
      metadata: {
        motivo: input.motivo ?? "primeiro_envio",
        contatos: aprovadores.map((c) => c.phoneE164),
        expiraEm: expiresAt.toISOString(),
        versao: post.version,
      },
    });
  });

  const link = linkDeAprovacao(token);

  await enviarPedidoDeAprovacao({
    post,
    cliente: post.client,
    contatos: aprovadores,
    link,
  });

  const config = await obterConfiguracoes();
  await cancelarJobsDoPost(post.id, config.lembretesHoras);
  await agendarCorteSemResposta({
    postId: post.id,
    postVersion: post.version,
    quando: post.scheduledAt,
  });
  await agendarLembretes({
    postId: post.id,
    postVersion: post.version,
    horarioDoPost: post.scheduledAt,
    offsetsHoras: config.lembretesHoras,
  });

  return { link, contatos: aprovadores.length };
}

/**
 * Reenvia pelo WhatsApp o MESMO link que ja esta valendo. Nao troca o
 * token: a mensagem antiga do cliente continua funcionando.
 */
export async function reenviarLinkDeAprovacao(input: { postId: string; ator: Ator }) {
  const post = await carregarPost(input.postId);
  if (post.status !== "AGUARDANDO_APROVACAO") {
    throw new ErroDeRegra("So e possivel reenviar o link de um post aguardando aprovacao.");
  }

  const pendente = post.approvalRequests.find((r) => r.status === "PENDENTE");
  if (!pendente) {
    throw new ErroDeRegra("Nao ha pedido de aprovacao ativo. Envie um novo pedido.");
  }

  const aprovadores = post.client.contacts.filter((c) => c.isApprover && c.active);
  if (aprovadores.length === 0) throw new ErroDeRegra("Cliente sem contato aprovador cadastrado.");

  const link = linkDeAprovacao(tokenDoPedido(pendente.id));

  await prisma.approvalRequest.update({
    where: { id: pendente.id },
    data: { sentAt: new Date() },
  });
  await registrarAuditoria({
    entityType: "post",
    entityId: post.id,
    action: "link_reenviado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    fromStatus: post.status,
    toStatus: post.status,
    metadata: { contatos: aprovadores.map((c) => c.phoneE164), pedidoId: pendente.id },
    ipAddress: input.ator.ipAddress ?? null,
    userAgent: input.ator.userAgent ?? null,
  });

  await enviarPedidoDeAprovacao({ post, cliente: post.client, contatos: aprovadores, link });
  return { link, contatos: aprovadores.length };
}

/* --------------------------------------------------- reagendar/cancelar */

export async function reagendarPost(input: { postId: string; novaData: Date; ator: Ator }) {
  const post = await carregarPost(input.postId);

  if (input.novaData.getTime() < Date.now()) {
    throw new ErroDeRegra("A nova data precisa estar no futuro.");
  }

  // Falha de publicacao: o criativo nao mudou, a aprovacao continua valendo.
  if (post.status === "FALHOU") {
    await prisma.$transaction(async (tx) => {
      await aplicarTransicao(tx, {
        post: { id: post.id, status: post.status as PostStatus, version: post.version },
        evento: "REAGENDAR_APOS_FALHA",
        ator: input.ator,
        acao: "reagendado_apos_falha",
        metadata: { de: post.scheduledAt.toISOString(), para: input.novaData.toISOString() },
        dadosExtra: { scheduledAt: input.novaData, lastError: null },
      });
    });
    await cancelarJobsDoPost(post.id, (await obterConfiguracoes()).lembretesHoras);
    await agendarPublicacao({
      postId: post.id,
      postVersion: post.version,
      quando: input.novaData,
    });
    return { exigiuNovaAprovacao: false };
  }

  // Nos outros casos, mudar o horario e uma edicao: derruba a aprovacao.
  const r = await atualizarPost({
    postId: input.postId,
    dados: { scheduledAt: input.novaData },
    ator: input.ator,
  });
  return { exigiuNovaAprovacao: r.novoPedidoEnviado };
}

export async function cancelarPost(input: { postId: string; ator: Ator; motivo?: string }) {
  const post = await carregarPost(input.postId);

  await prisma.$transaction(async (tx) => {
    await aplicarTransicao(tx, {
      post: { id: post.id, status: post.status as PostStatus, version: post.version },
      evento: "CANCELAR",
      ator: input.ator,
      acao: "post_cancelado",
      metadata: { motivo: input.motivo ?? null },
      dadosExtra: { canceledAt: new Date() },
    });
    await tx.approvalRequest.updateMany({
      where: { postId: post.id, status: "PENDENTE" },
      data: { status: "EXPIRADO" },
    });
  });

  await cancelarJobsDoPost(post.id, (await obterConfiguracoes()).lembretesHoras);
}

/* ----------------------------------------------- corte: sem resposta */

/**
 * Chamado pelo worker no horario do post. Se ninguem respondeu, o post
 * NAO e publicado: vira POST SEM RESPOSTA e a equipe e avisada.
 */
export async function marcarPostSemResposta(input: { postId: string }): Promise<"marcado" | "ignorado"> {
  const post = await carregarPost(input.postId);

  if (post.status !== "AGUARDANDO_APROVACAO") {
    log.info("corte ignorado: post nao esta mais aguardando aprovacao", {
      postId: post.id,
      status: post.status,
    });
    return "ignorado";
  }

  await prisma.$transaction(async (tx) => {
    await aplicarTransicao(tx, {
      post: { id: post.id, status: post.status as PostStatus, version: post.version },
      evento: "HORARIO_SEM_RESPOSTA",
      ator: { tipo: "SISTEMA", nome: "worker" },
      acao: "marcado_sem_resposta",
      metadata: { horarioPrevisto: post.scheduledAt.toISOString() },
    });
    await tx.approvalRequest.updateMany({
      where: { postId: post.id, status: "PENDENTE" },
      data: { status: "EXPIRADO" },
    });
  });

  await cancelarJobsDoPost(post.id, (await obterConfiguracoes()).lembretesHoras);

  await notificarEquipe({
    tipo: "POST_SEM_RESPOSTA",
    titulo: "POST SEM RESPOSTA",
    linhas: [
      `Cliente: ${post.client.name}`,
      `Horario previsto: ${post.scheduledAt.toISOString()}`,
      "O cliente nao respondeu ate o horario. O post NAO foi publicado.",
      `Painel: ${env.APP_URL}/posts/${post.id}`,
    ],
    postId: post.id,
    clientId: post.clientId,
  });

  return "marcado";
}
