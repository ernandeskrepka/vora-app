import { prisma } from "@/lib/db.ts";
import { intervaloDoMes } from "@/lib/datetime.ts";

/**
 * Relatorio mensal por cliente (fase 2).
 *
 * Le tudo do banco: os resultados de anuncios vem da coleta diaria e os
 * posts vem do proprio fluxo de aprovacao, inclusive os que ficaram como
 * POST SEM RESPOSTA.
 */
export async function relatorioMensal(input: { clientId: string; ano: number; mes: number }) {
  const { inicio, fim } = intervaloDoMes(input.ano, input.mes);

  const [cliente, insights, posts] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: input.clientId } }),
    prisma.adInsightDaily.findMany({
      where: { clientId: input.clientId, date: { gte: inicio, lt: fim } },
      orderBy: [{ date: "asc" }],
    }),
    prisma.post.findMany({
      where: { clientId: input.clientId, scheduledAt: { gte: inicio, lt: fim } },
      include: { publications: true, decisions: { orderBy: { decidedAt: "desc" }, take: 1 } },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  const porCampanha = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      spend: number;
      reach: number;
      impressions: number;
      clicks: number;
      conversions: number;
      currency: string;
    }
  >();

  for (const linha of insights) {
    const atual = porCampanha.get(linha.campaignId) ?? {
      campaignId: linha.campaignId,
      campaignName: linha.campaignName ?? linha.campaignId,
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      currency: linha.currency,
    };
    atual.spend += Number(linha.spend);
    // Alcance nao e somavel entre dias; usamos o maior dia como referencia.
    atual.reach = Math.max(atual.reach, linha.reach);
    atual.impressions += linha.impressions;
    atual.clicks += linha.clicks;
    atual.conversions += linha.conversions;
    porCampanha.set(linha.campaignId, atual);
  }

  const campanhas = [...porCampanha.values()].sort((a, b) => b.spend - a.spend);

  const investimento = campanhas.reduce((t, c) => t + c.spend, 0);
  const impressoes = campanhas.reduce((t, c) => t + c.impressions, 0);
  const cliques = campanhas.reduce((t, c) => t + c.clicks, 0);
  const conversoes = campanhas.reduce((t, c) => t + c.conversions, 0);
  const alcance = campanhas.reduce((t, c) => Math.max(t, c.reach), 0);

  return {
    cliente,
    periodo: { inicio, fim, ano: input.ano, mes: input.mes },
    anuncios: {
      temDados: insights.length > 0,
      campanhas,
      totais: {
        investimento,
        alcance,
        impressoes,
        cliques,
        conversoes,
        ctr: impressoes > 0 ? (cliques / impressoes) * 100 : 0,
        cpc: cliques > 0 ? investimento / cliques : 0,
        cpm: impressoes > 0 ? (investimento / impressoes) * 1000 : 0,
        custoPorResultado: conversoes > 0 ? investimento / conversoes : null,
        moeda: campanhas[0]?.currency ?? "BRL",
      },
    },
    posts: {
      todos: posts,
      publicados: posts.filter((p) => p.status === "PUBLICADO"),
      reprovados: posts.filter((p) => p.status === "REPROVADO"),
      semResposta: posts.filter((p) => p.status === "POST_SEM_RESPOSTA"),
      aguardando: posts.filter((p) => p.status === "AGUARDANDO_APROVACAO"),
      falhas: posts.filter((p) => p.status === "FALHOU"),
    },
  };
}
