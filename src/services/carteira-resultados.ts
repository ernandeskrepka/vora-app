import { prisma } from "@/lib/db.ts";
import { quinzenaAnterior, type Quinzena } from "@/domain/quinzena.ts";
import { nomeDaCampanhaParaCliente } from "@/domain/nome-campanha.ts";
import { saldoDoCliente, type SaldoDoCliente } from "./saldo.ts";

/**
 * Resultados da carteira inteira numa quinzena.
 *
 * O relatorio por cliente responde "como foi o mes da Danieli". Esta tela
 * responde a pergunta que a VORA faz antes dessa: "em quem eu preciso mexer
 * hoje". Por isso ela nao e uma lista de clientes - e uma lista ordenada por
 * atencao, com o motivo escrito do lado.
 *
 * Tudo sai de `AdInsightDaily`, que e a mesma coleta do relatorio: nenhum
 * numero aqui e calculado de um jeito diferente do que o cliente ve.
 */

export type TomDoAlerta = "grave" | "atencao" | "info";

export type Alerta = {
  chave: string;
  texto: string;
  tom: TomDoAlerta;
  /** Quanto esse alerta puxa o cliente para o topo da lista. */
  peso: number;
};

export type Variacao = {
  investimento: number | null;
  resultados: number | null;
  custoPorResultado: number | null;
};

export type LinhaDaCarteira = {
  clienteId: string;
  cliente: string;
  /** Tem conta de anuncios ligada nas Conexoes. */
  temConta: boolean;
  /** Tem dado coletado nesta quinzena. */
  temDados: boolean;
  investimento: number;
  resultados: number;
  custoPorResultado: number | null;
  cliques: number;
  impressoes: number;
  alcance: number;
  ctr: number;
  moeda: string;
  variacao: Variacao;
  posts: {
    publicados: number;
    aguardando: number;
    semResposta: number;
    reprovados: number;
    falhas: number;
  };
  saldo: SaldoDoCliente;
  alertas: Alerta[];
  /** Soma dos pesos dos alertas: e por aqui que a lista e ordenada. */
  atencao: number;
};

export type CampanhaDaCarteira = {
  clienteId: string;
  cliente: string;
  campaignId: string;
  /** Nome como a equipe escreveu na Meta. */
  nomeOriginal: string;
  /** Mesmo nome, legivel. */
  nome: string;
  investimento: number;
  resultados: number;
  custoPorResultado: number;
  criativo: string | null;
};

export type ResultadosDaCarteira = {
  quinzena: Quinzena;
  anterior: Quinzena;
  linhas: LinhaDaCarteira[];
  totais: {
    clientes: number;
    comDados: number;
    investimento: number;
    resultados: number;
    custoPorResultado: number | null;
    cliques: number;
    impressoes: number;
    ctr: number;
    moeda: string;
    /** Variacao da carteira contra a quinzena anterior. */
    variacao: Variacao;
  };
  serie: Array<{ data: Date; investimento: number; resultados: number }>;
  destaques: { melhores: CampanhaDaCarteira[]; piores: CampanhaDaCarteira[] };
};

/** Quanto o custo por resultado pode subir antes de virar alerta. */
const PIORA_ACEITAVEL = 20;
/** Quanto os resultados podem cair antes de virar alerta. */
const QUEDA_ACEITAVEL = 20;
/** Resultados minimos para uma campanha entrar nos destaques. */
const RESULTADOS_PARA_DESTAQUE = 3;

type Agregado = {
  investimento: number;
  impressoes: number;
  cliques: number;
  resultados: number;
  alcance: number;
};

const VAZIO: Agregado = {
  investimento: 0,
  impressoes: 0,
  cliques: 0,
  resultados: 0,
  alcance: 0,
};

/** Soma por cliente num intervalo, direto no banco. */
async function agregarPorCliente(
  inicio: Date,
  fim: Date,
): Promise<Map<string, Agregado>> {
  const linhas = await prisma.adInsightDaily.groupBy({
    by: ["clientId"],
    where: { date: { gte: inicio, lt: fim } },
    _sum: { spend: true, impressions: true, clicks: true, conversions: true },
    // Alcance nao e somavel entre dias: o maior dia e a referencia honesta.
    _max: { reach: true },
  });

  return new Map(
    linhas.map((l) => [
      l.clientId,
      {
        investimento: Number(l._sum.spend ?? 0),
        impressoes: l._sum.impressions ?? 0,
        cliques: l._sum.clicks ?? 0,
        resultados: l._sum.conversions ?? 0,
        alcance: l._max.reach ?? 0,
      },
    ]),
  );
}

/** Variacao percentual. Nulo quando nao ha base de comparacao. */
export function variacaoPercentual(
  agora: number,
  antes: number,
): number | null {
  if (antes <= 0) return null;
  return ((agora - antes) / antes) * 100;
}

function custoPorResultado(a: Agregado): number | null {
  return a.resultados > 0 ? a.investimento / a.resultados : null;
}

/**
 * Por que esse cliente precisa de atencao agora.
 *
 * A ordem dos pesos e a ordem em que a equipe deveria mexer: dinheiro parado
 * ou saldo no fim primeiro, piora de resultado depois, pendencia de aprovacao
 * por ultimo - essa ultima depende do cliente responder, nao da equipe.
 */
function montarAlertas(input: {
  temConta: boolean;
  atual: Agregado;
  passado: Agregado;
  variacao: Variacao;
  saldo: SaldoDoCliente;
  posts: LinhaDaCarteira["posts"];
}): Alerta[] {
  const alertas: Alerta[] = [];
  const { atual, passado, variacao, saldo, posts } = input;

  if (!input.temConta) {
    alertas.push({
      chave: "sem_conta",
      texto: "Sem conta de anuncios conectada",
      tom: "info",
      peso: 10,
    });
  } else if (atual.investimento <= 0 && passado.investimento > 0) {
    alertas.push({
      chave: "parou_de_gastar",
      texto:
        "Gastou na quinzena passada e nada nesta - campanha pausada ou coleta parada",
      tom: "atencao",
      peso: 60,
    });
  } else if (atual.investimento <= 0) {
    // Nunca teve gasto coletado: na pratica e cliente so de conteudo, ou
    // conta ligada e campanha ainda nao criada. Nao e problema para resolver
    // hoje, entao fica como informacao e nao disputa o topo da lista.
    alertas.push({
      chave: "sem_dados",
      texto: "Sem anuncio rodando nesta quinzena",
      tom: "info",
      peso: 5,
    });
  }

  if (saldo.acompanhando && saldo.abaixoDoLimite) {
    alertas.push({
      chave: "saldo_baixo",
      texto:
        saldo.diasRestantes !== null
          ? `Saldo no limite: da para ${saldo.diasRestantes} dia(s) no ritmo atual`
          : "Saldo no limite",
      tom: "grave",
      peso: 100,
    });
  }

  if (
    variacao.custoPorResultado !== null &&
    variacao.custoPorResultado > PIORA_ACEITAVEL
  ) {
    alertas.push({
      chave: "custo_subiu",
      texto: `Custo por resultado subiu ${Math.round(variacao.custoPorResultado)}%`,
      tom: "grave",
      peso: 80,
    });
  }

  if (variacao.resultados !== null && variacao.resultados < -QUEDA_ACEITAVEL) {
    alertas.push({
      chave: "resultados_cairam",
      texto: `Resultados cairam ${Math.abs(Math.round(variacao.resultados))}%`,
      tom: "grave",
      peso: 70,
    });
  }

  if (posts.falhas > 0) {
    alertas.push({
      chave: "falhou",
      texto: `${posts.falhas} post(s) falharam ao publicar`,
      tom: "grave",
      peso: 90,
    });
  }

  if (posts.semResposta > 0) {
    alertas.push({
      chave: "sem_resposta",
      texto: `${posts.semResposta} post(s) perderam o horario sem resposta do cliente`,
      tom: "atencao",
      peso: 40,
    });
  }

  if (posts.aguardando > 0) {
    alertas.push({
      chave: "aguardando",
      texto: `${posts.aguardando} post(s) esperando aprovacao`,
      tom: "info",
      peso: 20,
    });
  }

  return alertas.sort((a, b) => b.peso - a.peso);
}

export async function resultadosDaCarteira(input: {
  quinzena: Quinzena;
}): Promise<ResultadosDaCarteira> {
  const { quinzena } = input;
  const anterior = quinzenaAnterior(quinzena);

  const [clientes, atualPorCliente, passadoPorCliente, postsPorStatus, dias] =
    await Promise.all([
      prisma.client.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          metaConnections: {
            where: { assetType: "AD_ACCOUNT" },
            select: { id: true },
          },
        },
      }),
      agregarPorCliente(quinzena.inicio, quinzena.fim),
      agregarPorCliente(anterior.inicio, anterior.fim),
      prisma.post.groupBy({
        by: ["clientId", "status"],
        where: { scheduledAt: { gte: quinzena.inicio, lt: quinzena.fim } },
        _count: { _all: true },
      }),
      prisma.adInsightDaily.groupBy({
        by: ["date"],
        where: { date: { gte: quinzena.inicio, lt: quinzena.fim } },
        _sum: { spend: true, conversions: true },
        orderBy: { date: "asc" },
      }),
    ]);

  const contagem = new Map<string, number>();
  for (const p of postsPorStatus) {
    contagem.set(`${p.clientId}:${p.status}`, p._count._all);
  }
  const conta = (clienteId: string, status: string) =>
    contagem.get(`${clienteId}:${status}`) ?? 0;

  const saldos = await Promise.all(clientes.map((c) => saldoDoCliente(c.id)));

  const linhas: LinhaDaCarteira[] = clientes.map((c, i) => {
    const atual = atualPorCliente.get(c.id) ?? VAZIO;
    const passado = passadoPorCliente.get(c.id) ?? VAZIO;
    const cprAtual = custoPorResultado(atual);
    const cprPassado = custoPorResultado(passado);

    const variacao: Variacao = {
      investimento: variacaoPercentual(
        atual.investimento,
        passado.investimento,
      ),
      resultados: variacaoPercentual(atual.resultados, passado.resultados),
      custoPorResultado:
        cprAtual !== null && cprPassado !== null
          ? variacaoPercentual(cprAtual, cprPassado)
          : null,
    };

    const posts = {
      publicados: conta(c.id, "PUBLICADO"),
      aguardando: conta(c.id, "AGUARDANDO_APROVACAO"),
      semResposta: conta(c.id, "POST_SEM_RESPOSTA"),
      reprovados: conta(c.id, "REPROVADO"),
      falhas: conta(c.id, "FALHOU"),
    };

    const alertas = montarAlertas({
      temConta: c.metaConnections.length > 0,
      atual,
      passado,
      variacao,
      saldo: saldos[i],
      posts,
    });

    return {
      clienteId: c.id,
      cliente: c.name,
      temConta: c.metaConnections.length > 0,
      temDados: atual.investimento > 0 || atual.impressoes > 0,
      investimento: atual.investimento,
      resultados: atual.resultados,
      custoPorResultado: cprAtual,
      cliques: atual.cliques,
      impressoes: atual.impressoes,
      alcance: atual.alcance,
      ctr: atual.impressoes > 0 ? (atual.cliques / atual.impressoes) * 100 : 0,
      moeda: "BRL",
      variacao,
      posts,
      saldo: saldos[i],
      alertas,
      atencao: alertas.reduce((t, a) => t + a.peso, 0),
    };
  });

  // Quem precisa de atencao primeiro; empate desempata por quem gasta mais,
  // porque e onde o erro custa mais caro.
  linhas.sort(
    (a, b) => b.atencao - a.atencao || b.investimento - a.investimento,
  );

  const investimento = linhas.reduce((t, l) => t + l.investimento, 0);
  const resultados = linhas.reduce((t, l) => t + l.resultados, 0);
  const cliques = linhas.reduce((t, l) => t + l.cliques, 0);
  const impressoes = linhas.reduce((t, l) => t + l.impressoes, 0);

  const investimentoPassado = [...passadoPorCliente.values()].reduce(
    (t, a) => t + a.investimento,
    0,
  );
  const resultadosPassados = [...passadoPorCliente.values()].reduce(
    (t, a) => t + a.resultados,
    0,
  );
  const cprCarteira = resultados > 0 ? investimento / resultados : null;
  const cprCarteiraPassado =
    resultadosPassados > 0 ? investimentoPassado / resultadosPassados : null;

  return {
    quinzena,
    anterior,
    linhas,
    totais: {
      clientes: linhas.length,
      comDados: linhas.filter((l) => l.temDados).length,
      investimento,
      resultados,
      custoPorResultado: cprCarteira,
      cliques,
      impressoes,
      ctr: impressoes > 0 ? (cliques / impressoes) * 100 : 0,
      moeda: "BRL",
      variacao: {
        investimento: variacaoPercentual(investimento, investimentoPassado),
        resultados: variacaoPercentual(resultados, resultadosPassados),
        custoPorResultado:
          cprCarteira !== null && cprCarteiraPassado !== null
            ? variacaoPercentual(cprCarteira, cprCarteiraPassado)
            : null,
      },
    },
    serie: dias.map((d) => ({
      data: d.date,
      investimento: Number(d._sum.spend ?? 0),
      resultados: d._sum.conversions ?? 0,
    })),
    destaques: await destaquesDaQuinzena(
      quinzena,
      new Map(clientes.map((c) => [c.id, c.name])),
    ),
  };
}

/**
 * As campanhas mais baratas e as mais caras da carteira na quinzena, com o
 * criativo do lado.
 *
 * Campanha com pouquissimo resultado fica fora: com dois resultados, o custo
 * por resultado e sorte, nao aprendizado.
 */
async function destaquesDaQuinzena(
  quinzena: Quinzena,
  nomes: Map<string, string>,
): Promise<{ melhores: CampanhaDaCarteira[]; piores: CampanhaDaCarteira[] }> {
  const porCampanha = await prisma.adInsightDaily.groupBy({
    by: ["clientId", "campaignId"],
    where: { date: { gte: quinzena.inicio, lt: quinzena.fim } },
    _sum: { spend: true, conversions: true },
  });

  const elegiveis = porCampanha
    .map((c) => ({
      clienteId: c.clientId,
      campaignId: c.campaignId,
      investimento: Number(c._sum.spend ?? 0),
      resultados: c._sum.conversions ?? 0,
    }))
    .filter(
      (c) => c.resultados >= RESULTADOS_PARA_DESTAQUE && c.investimento > 0,
    )
    .map((c) => ({ ...c, custoPorResultado: c.investimento / c.resultados }))
    .sort((a, b) => a.custoPorResultado - b.custoPorResultado);

  if (elegiveis.length === 0) return { melhores: [], piores: [] };

  const escolhidas = [...elegiveis.slice(0, 3), ...elegiveis.slice(-3)];
  const ids = [...new Set(escolhidas.map((c) => c.campaignId))];

  const [rotulos, criativos] = await Promise.all([
    prisma.adInsightDaily.findMany({
      where: { campaignId: { in: ids } },
      select: { campaignId: true, campaignName: true },
      distinct: ["campaignId"],
      orderBy: { date: "desc" },
    }),
    prisma.adCampaignCreative.findMany({ where: { campaignId: { in: ids } } }),
  ]);

  const nomeDaCampanha = new Map(
    rotulos.map((r) => [r.campaignId, r.campaignName]),
  );
  const criativoDaCampanha = new Map<string, string>();
  const { storage } = await import("@/lib/storage/index.ts");
  for (const c of criativos) {
    if (criativoDaCampanha.has(c.campaignId)) continue;
    criativoDaCampanha.set(
      c.campaignId,
      await storage.urlTemporaria(c.storageKey),
    );
  }

  const montar = async (
    c: (typeof elegiveis)[number],
  ): Promise<CampanhaDaCarteira> => {
    const original = nomeDaCampanha.get(c.campaignId) ?? c.campaignId;
    return {
      clienteId: c.clienteId,
      cliente: nomes.get(c.clienteId) ?? "-",
      campaignId: c.campaignId,
      nomeOriginal: original,
      nome: nomeDaCampanhaParaCliente(original),
      investimento: c.investimento,
      resultados: c.resultados,
      custoPorResultado: c.custoPorResultado,
      criativo: criativoDaCampanha.get(c.campaignId) ?? null,
    };
  };

  const melhores = await Promise.all(elegiveis.slice(0, 3).map(montar));
  // Com poucas campanhas, "pior" e "melhor" seriam a mesma: so mostra o outro
  // lado quando ha campanha suficiente para a comparacao significar algo.
  const piores =
    elegiveis.length >= 4
      ? await Promise.all([...elegiveis].reverse().slice(0, 3).map(montar))
      : [];

  return { melhores, piores };
}
