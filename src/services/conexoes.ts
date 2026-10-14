import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { cifrarSegredo } from "@/lib/crypto.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { diagnosticarConexao } from "@/lib/meta/conexoes.ts";
import { notificarEquipe } from "./notificacoes.ts";
import type { Ator } from "./transicoes.ts";
import type { MetaAssetType, MetaAuthMode } from "@/lib/tipos.ts";

const log = logger("conexoes");

/**
 * Cadastra ou atualiza a conexao de um ativo da Meta para um cliente.
 *
 * Caminho preferido da agencia: System User do Business Manager com os
 * ativos do cliente atribuidos (token de longa duracao, sem login do
 * cliente). O caminho OAuth existe para clientes cujos ativos nao estao no
 * Business Manager da VORA.
 */
export async function salvarConexao(input: {
  clientId: string;
  assetType: MetaAssetType;
  assetId: string;
  assetName?: string | null;
  authMode: MetaAuthMode;
  /** Token em texto puro; e cifrado antes de ir para o banco. */
  token?: string | null;
  tokenExpiresAt?: Date | null;
  scopes?: string[];
  ator: Ator;
}) {
  const dados = {
    assetId: input.assetId.trim(),
    assetName: input.assetName ?? null,
    authMode: input.authMode,
    scopes: input.scopes ?? [],
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    ...(input.token ? { tokenCiphertext: cifrarSegredo(input.token) } : {}),
  };

  const conexao = await prisma.metaConnection.upsert({
    where: { clientId_assetType: { clientId: input.clientId, assetType: input.assetType } },
    create: { clientId: input.clientId, assetType: input.assetType, status: "NAO_CONFIGURADO", ...dados },
    update: dados,
  });

  await registrarAuditoria({
    entityType: "meta_connection",
    entityId: conexao.id,
    action: "conexao_salva",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: {
      clientId: input.clientId,
      assetType: input.assetType,
      assetId: dados.assetId,
      authMode: input.authMode,
      tokenInformado: Boolean(input.token),
    },
  });

  return verificarConexao(conexao.id);
}

/** Testa uma conexao e grava o resultado. */
export async function verificarConexao(conexaoId: string) {
  const conexao = await prisma.metaConnection.findUniqueOrThrow({ where: { id: conexaoId } });
  const diagnostico = await diagnosticarConexao(conexao);

  const atualizada = await prisma.metaConnection.update({
    where: { id: conexao.id },
    data: {
      status: diagnostico.status,
      assetName: diagnostico.assetName ?? conexao.assetName,
      lastCheckedAt: new Date(),
      lastError: diagnostico.mensagem,
    },
  });

  return atualizada;
}

/**
 * Job diario: verifica todas as conexoes e avisa a equipe sobre as que
 * cairam. Sem isso, a falha so apareceria na hora de publicar.
 */
export async function verificarTodasAsConexoes(): Promise<{
  verificadas: number;
  comProblema: number;
}> {
  const conexoes = await prisma.metaConnection.findMany({
    include: { client: { select: { name: true } } },
  });

  const problemas: string[] = [];

  for (const conexao of conexoes) {
    const antes = conexao.status;
    const depois = await verificarConexao(conexao.id);
    if (depois.status !== "CONECTADO") {
      problemas.push(
        `${conexao.client.name} - ${conexao.assetType}: ${depois.status}${
          depois.lastError ? ` (${depois.lastError})` : ""
        }`,
      );
    }
    if (antes !== depois.status) {
      log.info("status de conexao mudou", {
        conexaoId: conexao.id,
        de: antes,
        para: depois.status,
      });
    }
  }

  if (problemas.length > 0) {
    await notificarEquipe({
      tipo: "CONEXAO_META_COM_PROBLEMA",
      titulo: `Conexoes com a Meta precisando de atencao (${problemas.length})`,
      linhas: [...problemas, `Painel: ${env.APP_URL}/conexoes`],
    });
  }

  return { verificadas: conexoes.length, comProblema: problemas.length };
}
