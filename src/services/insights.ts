import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { chamarGraph } from "@/lib/meta/graph.ts";
import { modoDryRun, tokenDaConexao } from "@/lib/meta/index.ts";
import { chaveDiaLocal } from "@/lib/datetime.ts";

const log = logger("insights");

/**
 * Fase 2: coleta diaria de resultados de anuncios pela Marketing API.
 *
 * O relatorio le do banco, nunca da Meta: pagina de relatorio abre rapido e
 * nao gasta cota da API.
 */

type LinhaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  account_currency?: string;
};

const TIPOS_DE_CONVERSAO = [
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

function somarConversoes(linha: LinhaInsight): number {
  if (!linha.actions) return 0;
  return linha.actions
    .filter((a) => TIPOS_DE_CONVERSAO.includes(a.action_type))
    .reduce((total, a) => total + Number(a.value || 0), 0);
}

function custoPorResultado(linha: LinhaInsight): number | null {
  const item = linha.cost_per_action_type?.find((a) => TIPOS_DE_CONVERSAO.includes(a.action_type));
  return item ? Number(item.value) : null;
}

/**
 * Coleta os insights de um cliente num intervalo de dias e grava no banco.
 * Em dry-run nao chama a Meta: so registra no log (os dados de exemplo para
 * desenvolvimento vem do seed).
 */
export async function coletarInsightsDoCliente(input: {
  clientId: string;
  desde: Date;
  ate: Date;
}): Promise<{ linhas: number; ignorado?: string }> {
  const conexao = await prisma.metaConnection.findUnique({
    where: { clientId_assetType: { clientId: input.clientId, assetType: "AD_ACCOUNT" } },
  });

  if (!conexao || !conexao.assetId) {
    return { linhas: 0, ignorado: "cliente sem conta de anuncios conectada" };
  }
  if (modoDryRun()) {
    log.warn("dry-run: insights nao coletados", { clientId: input.clientId });
    return { linhas: 0, ignorado: "dry-run" };
  }

  const actId = conexao.assetId.startsWith("act_") ? conexao.assetId : `act_${conexao.assetId}`;

  const resposta = await chamarGraph<{ data?: LinhaInsight[] }>(`${actId}/insights`, {
    token: tokenDaConexao(conexao),
    params: {
      level: "campaign",
      time_increment: 1,
      time_range: JSON.stringify({
        since: chaveDiaLocal(input.desde),
        until: chaveDiaLocal(input.ate),
      }),
      fields: [
        "campaign_id",
        "campaign_name",
        "spend",
        "reach",
        "impressions",
        "clicks",
        "ctr",
        "cpc",
        "cpm",
        "actions",
        "cost_per_action_type",
        "account_currency",
      ].join(","),
      limit: 500,
    },
    rotulo: "marketing.insights",
  });

  const linhas = resposta.data ?? [];

  for (const linha of linhas) {
    if (!linha.campaign_id || !linha.date_start) continue;
    const data = new Date(`${linha.date_start}T00:00:00.000Z`);
    const dados = {
      campaignName: linha.campaign_name ?? null,
      spend: linha.spend ?? "0",
      reach: Number(linha.reach ?? 0),
      impressions: Number(linha.impressions ?? 0),
      clicks: Number(linha.clicks ?? 0),
      ctr: Number(linha.ctr ?? 0),
      cpc: linha.cpc ?? "0",
      cpm: linha.cpm ?? "0",
      conversions: somarConversoes(linha),
      costPerResult: custoPorResultado(linha)?.toString() ?? null,
      currency: linha.account_currency ?? "BRL",
      raw: linha as unknown as object,
      collectedAt: new Date(),
    };

    await prisma.adInsightDaily.upsert({
      where: {
        clientId_campaignId_date: {
          clientId: input.clientId,
          campaignId: linha.campaign_id,
          date: data,
        },
      },
      create: {
        clientId: input.clientId,
        adAccountId: actId,
        campaignId: linha.campaign_id,
        date: data,
        ...dados,
      },
      update: dados,
    });
  }

  log.info("insights coletados", { clientId: input.clientId, linhas: linhas.length });
  return { linhas: linhas.length };
}

/** Job diario: ultimos 7 dias de todos os clientes com conta conectada. */
export async function coletarInsightsDeTodos(): Promise<{ clientes: number; linhas: number }> {
  const clientes = await prisma.client.findMany({
    where: { active: true, metaConnections: { some: { assetType: "AD_ACCOUNT" } } },
    select: { id: true, name: true },
  });

  const ate = new Date();
  const desde = new Date(ate.getTime() - 7 * 86_400_000);
  let linhas = 0;

  for (const cliente of clientes) {
    try {
      const r = await coletarInsightsDoCliente({ clientId: cliente.id, desde, ate });
      linhas += r.linhas;
    } catch (erro) {
      log.error("falha ao coletar insights", {
        cliente: cliente.name,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return { clientes: clientes.length, linhas };
}
