import { prisma } from "@/lib/db.ts";
import { intervaloDoMes } from "@/lib/datetime.ts";
import { quinzenaAnterior, type Quinzena } from "@/domain/quinzena.ts";
import { resumoDaLegenda } from "@/domain/legenda.ts";

/**
 * Relatorio mensal por cliente (fase 2).
 *
 * Le tudo do banco: os resultados de anuncios vem da coleta diaria e os
 * posts vem do proprio fluxo de aprovacao, inclusive os que ficaram como
 * POST SEM RESPOSTA.
 */
export async function relatorioMensal(input: {
  clientId: string;
  ano: number;
  mes: number;
}) {
  const { inicio, fim } = intervaloDoMes(input.ano, input.mes);
  return relatorioDoPeriodo({ clientId: input.clientId, inicio, fim });
}

/**
 * Relatorio da quinzena, que e a janela que a VORA usa com o cliente, junto
 * com a variacao em relacao a quinzena anterior. Sem a comparacao, o numero
 * sozinho nao diz se melhorou ou piorou.
 */
export async function relatorioDaQuinzena(input: {
  clientId: string;
  quinzena: Quinzena;
}) {
  const atual = await relatorioDoPeriodo({
    clientId: input.clientId,
    inicio: input.quinzena.inicio,
    fim: input.quinzena.fim,
  });

  const anterior = quinzenaAnterior(input.quinzena);
  const passada = await relatorioDoPeriodo({
    clientId: input.clientId,
    inicio: anterior.inicio,
    fim: anterior.fim,
  });

  const variacao = (agora: number, antes: number): number | null =>
    antes > 0 ? ((agora - antes) / antes) * 100 : null;

  return {
    ...atual,
    quinzena: input.quinzena,
    comparativo: {
      temBase: passada.anuncios.temDados,
      rotuloAnterior: anterior.chave,
      investimento: variacao(
        atual.anuncios.totais.investimento,
        passada.anuncios.totais.investimento,
      ),
      resultados: variacao(
        atual.anuncios.totais.conversoes,
        passada.anuncios.totais.conversoes,
      ),
      custoPorResultado:
        atual.anuncios.totais.custoPorResultado !== null &&
        passada.anuncios.totais.custoPorResultado !== null
          ? variacao(
              atual.anuncios.totais.custoPorResultado,
              passada.anuncios.totais.custoPorResultado,
            )
          : null,
      publicados: passada.posts.publicados.length,
    },
  };
}

export async function relatorioDoPeriodo(input: {
  clientId: string;
  inicio: Date;
  fim: Date;
}) {
  const { inicio, fim } = input;

  const [cliente, insights, posts, criativos] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: input.clientId } }),
    prisma.adInsightDaily.findMany({
      where: { clientId: input.clientId, date: { gte: inicio, lt: fim } },
      orderBy: [{ date: "asc" }],
    }),
    prisma.post.findMany({
      where: {
        clientId: input.clientId,
        scheduledAt: { gte: inicio, lt: fim },
      },
      include: {
        publications: true,
        decisions: { orderBy: { decidedAt: "desc" }, take: 1 },
        media: { orderBy: { position: "asc" }, take: 1 },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.adCampaignCreative.findMany({ where: { clientId: input.clientId } }),
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

  const { storage: storageCriativos } = await import("@/lib/storage/index.ts");
  const criativosPorCampanha = new Map<
    string,
    Array<{ url: string; nome: string | null }>
  >();
  for (const c of criativos) {
    const lista = criativosPorCampanha.get(c.campaignId) ?? [];
    if (lista.length >= 3) continue;
    lista.push({
      url: await storageCriativos.urlTemporaria(c.storageKey),
      nome: c.adName,
    });
    criativosPorCampanha.set(c.campaignId, lista);
  }

  const campanhas = [...porCampanha.values()]
    .sort((a, b) => b.spend - a.spend)
    .map((c) => ({
      ...c,
      criativos: criativosPorCampanha.get(c.campaignId) ?? [],
    }));

  // Capa e primeira linha da legenda, prontas para a tela e para o PDF.
  const { storage } = await import("@/lib/storage/index.ts");
  const postsComCapa = await Promise.all(
    posts.map(async (p) => ({
      ...p,
      capa: p.media[0]
        ? await storage.urlTemporaria(p.media[0].storageKey)
        : null,
      resumo: resumoDaLegenda(p.caption),
    })),
  );

  // Serie diaria: um ponto por dia com dado, somando as campanhas do cliente.
  const porDia = new Map<
    string,
    { data: Date; investimento: number; resultados: number; cliques: number }
  >();
  for (const linha of insights) {
    const chave = linha.date.toISOString().slice(0, 10);
    const atual = porDia.get(chave) ?? {
      data: linha.date,
      investimento: 0,
      resultados: 0,
      cliques: 0,
    };
    atual.investimento += Number(linha.spend);
    atual.resultados += linha.conversions;
    atual.cliques += linha.clicks;
    porDia.set(chave, atual);
  }
  const serie = [...porDia.values()].sort(
    (a, b) => a.data.getTime() - b.data.getTime(),
  );

  const investimento = campanhas.reduce((t, c) => t + c.spend, 0);
  const impressoes = campanhas.reduce((t, c) => t + c.impressions, 0);
  const cliques = campanhas.reduce((t, c) => t + c.clicks, 0);
  const conversoes = campanhas.reduce((t, c) => t + c.conversions, 0);
  const alcance = campanhas.reduce((t, c) => Math.max(t, c.reach), 0);

  return {
    cliente,
    periodo: { inicio, fim },
    anuncios: {
      temDados: insights.length > 0,
      campanhas,
      serie,
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
      todos: postsComCapa,
      publicados: postsComCapa.filter((p) => p.status === "PUBLICADO"),
      reprovados: postsComCapa.filter((p) => p.status === "REPROVADO"),
      semResposta: postsComCapa.filter((p) => p.status === "POST_SEM_RESPOSTA"),
      aguardando: postsComCapa.filter(
        (p) => p.status === "AGUARDANDO_APROVACAO",
      ),
      falhas: postsComCapa.filter((p) => p.status === "FALHOU"),
    },
  };
}
