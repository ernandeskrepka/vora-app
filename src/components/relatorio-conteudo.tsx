import { METRICAS, ORDEM_RELATORIO, tomDaVariacao } from "@/domain/metricas.ts";
import { nomeDaCampanhaParaCliente } from "@/domain/nome-campanha.ts";
import { rotuloCurto, type Quinzena } from "@/domain/quinzena.ts";
import { formatarData } from "@/lib/datetime.ts";
import { GraficoDia } from "@/components/grafico-dia.tsx";

export function moeda(valor: number, sigla = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: sigla }).format(valor);
}
export function numero(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(valor));
}

type Totais = {
  investimento: number;
  alcance: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  ctr: number;
  cpc: number;
  cpm: number;
  custoPorResultado: number | null;
  moeda: string;
};

type Campanha = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  currency: string;
  criativos: Array<{ url: string; nome: string | null }>;
};

type Comparativo = {
  temBase: boolean;
  investimento: number | null;
  resultados: number | null;
  custoPorResultado: number | null;
};

function valorDaMetrica(chave: string, t: Totais): string {
  switch (chave) {
    case "investimento":
      return moeda(t.investimento, t.moeda);
    case "resultados":
      return numero(t.conversoes);
    case "custoPorResultado":
      return t.custoPorResultado !== null ? moeda(t.custoPorResultado, t.moeda) : "-";
    case "alcance":
      return numero(t.alcance);
    case "impressoes":
      return numero(t.impressoes);
    case "cliques":
      return numero(t.cliques);
    case "ctr":
      return `${t.ctr.toFixed(2).replace(".", ",")}%`;
    case "cpc":
      return moeda(t.cpc, t.moeda);
    case "cpm":
      return moeda(t.cpm, t.moeda);
    default:
      return "-";
  }
}

function Variacao({ chave, valor }: { chave: string; valor: number | null }) {
  if (valor === null || !Number.isFinite(valor)) return null;
  const tom = tomDaVariacao(chave, valor);
  const cor =
    tom === "bom" ? "text-emerald-700" : tom === "ruim" ? "text-rose-700" : "text-tinta-3";
  const seta = valor > 0 ? "▲" : valor < 0 ? "▼" : "•";
  return (
    <span className={`text-xs font-medium ${cor}`}>
      {seta} {Math.abs(valor).toFixed(0)}% vs quinzena anterior
    </span>
  );
}

/**
 * O miolo do relatorio, compartilhado por tres lugares: o painel da equipe, a
 * pagina que o cliente abre pelo link e o PDF (que e a impressao dessa mesma
 * pagina). Um layout so evita o classico "no PDF esta diferente do site".
 */
export function RelatorioConteudo({
  quinzena,
  totais,
  temDados,
  campanhas,
  serie,
  comparativo,
  publicados,
  semResposta,
  paraCliente = false,
}: {
  quinzena: Quinzena;
  totais: Totais;
  temDados: boolean;
  campanhas: Campanha[];
  serie: Array<{ data: Date; investimento: number; resultados: number }>;
  comparativo?: Comparativo;
  publicados: Array<{ id: string; capa: string | null; resumo: string; scheduledAt: Date; format: string }>;
  semResposta: number;
  paraCliente?: boolean;
}) {
  const variacoes: Record<string, number | null> = {
    investimento: comparativo?.investimento ?? null,
    resultados: comparativo?.resultados ?? null,
    custoPorResultado: comparativo?.custoPorResultado ?? null,
  };

  return (
    <div className="space-y-6">
      {!temDados ? (
        <p className="rounded-xl border border-linha bg-superficie p-4 text-sm text-tinta-2">
          Nenhum anuncio rodou entre {rotuloCurto(quinzena)}. Os posts publicados no periodo estao
          listados abaixo.
        </p>
      ) : (
        <>
          <section>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ORDEM_RELATORIO.map((chave) => {
                const m = METRICAS[chave];
                const destaque = chave === "investimento" || chave === "resultados" || chave === "custoPorResultado";
                return (
                  <div
                    key={chave}
                    className={`rounded-xl border p-4 ${destaque ? "border-linha-forte bg-superficie" : "border-linha bg-superficie/60"}`}
                  >
                    <p className="text-xs text-tinta-3">
                      {m.rotulo}
                      {m.sigla ? ` (${m.sigla})` : ""}
                    </p>
                    <p
                      className={`mt-0.5 font-semibold text-tinta ${destaque ? "text-2xl" : "text-lg"}`}
                    >
                      {valorDaMetrica(chave, totais)}
                    </p>
                    {comparativo?.temBase && variacoes[chave] !== undefined && (
                      <Variacao chave={chave} valor={variacoes[chave]} />
                    )}
                    <p className="mt-1.5 text-xs leading-relaxed text-tinta-3">{m.explicacao}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {serie.length > 0 && (
            <section className="grid gap-6 lg:grid-cols-2">
              <GraficoDia
                titulo="Investimento por dia"
                pontos={serie.map((d) => ({ data: d.data, valor: d.investimento }))}
                formatar={(v) => moeda(v, totais.moeda)}
              />
              <GraficoDia
                titulo="Resultados por dia"
                pontos={serie.map((d) => ({ data: d.data, valor: d.resultados }))}
                formatar={(v) => numero(v)}
              />
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-tinta">
              Campanhas e os criativos que rodaram
            </h2>
            <p className="mt-0.5 text-xs text-tinta-3">
              A arte ao lado de cada campanha e o que foi ao ar. E assim que da para ver qual
              criativo trouxe resultado mais barato.
            </p>

            <ul className="mt-3 space-y-3">
              {campanhas.map((c) => (
                <li
                  key={c.campaignId}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-linha bg-superficie p-3"
                >
                  <div className="flex gap-1.5">
                    {c.criativos.length === 0 ? (
                      <div className="grid h-20 w-16 place-items-center rounded-md bg-superficie-3 text-[10px] text-tinta-4">
                        sem arte
                      </div>
                    ) : (
                      c.criativos.map((arte) => (
                        <img
                          key={arte.url}
                          src={arte.url}
                          alt=""
                          className="h-20 w-16 rounded-md object-cover"
                        />
                      ))
                    )}
                  </div>

                  <div className="min-w-[180px] flex-1">
                    {/*
                      O cliente le o nome por extenso; a equipe precisa do nome
                      cru para achar a campanha no Gerenciador.
                    */}
                    <p className="text-sm font-medium text-tinta">
                      {paraCliente ? nomeDaCampanhaParaCliente(c.campaignName) : c.campaignName}
                    </p>
                    {!paraCliente && (
                      <p className="text-[11px] text-tinta-4">
                        o cliente le: {nomeDaCampanhaParaCliente(c.campaignName)}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-tinta-3">
                      {moeda(c.spend, c.currency)} investidos · {numero(c.impressions)} aparicoes ·{" "}
                      {numero(c.clicks)} cliques
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-semibold text-tinta">{numero(c.conversions)}</p>
                    <p className="text-xs text-tinta-3">resultados</p>
                    {c.conversions > 0 && (
                      <p className="text-xs text-tinta-3">
                        {moeda(c.spend / c.conversions, c.currency)} cada
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section>
        <h2 className="text-sm font-semibold text-tinta">
          Publicados no periodo ({publicados.length})
        </h2>
        {publicados.length === 0 ? (
          <p className="mt-2 text-sm text-tinta-3">Nenhum post publicado nessa quinzena.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {publicados.map((p) => (
              <li
                key={p.id}
                className="flex gap-3 rounded-xl border border-linha bg-superficie p-3"
              >
                {p.capa && (
                  <img src={p.capa} alt="" className="h-20 w-16 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-tinta-3">
                    {formatarData(p.scheduledAt)} · {p.format.replace("_", " ").toLowerCase()}
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-sm text-tinta-2">{p.resumo}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {semResposta > 0 && !paraCliente && (
          <p className="mt-3 text-xs text-amber-800">
            {semResposta} post(s) ficaram sem resposta do cliente nessa quinzena e nao foram
            publicados.
          </p>
        )}
      </section>
    </div>
  );
}
