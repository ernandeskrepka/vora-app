import Link from "next/link";
import { exigirUsuario } from "@/lib/auth.ts";
import {
  resultadosDaCarteira,
  type LinhaDaCarteira,
} from "@/services/carteira-resultados.ts";
import {
  quinzenaDe,
  quinzenaAnterior,
  quinzenaPorChave,
  quinzenaSeguinte,
  rotuloDaQuinzena,
  rotuloCurto,
} from "@/domain/quinzena.ts";
import { METRICAS, tomDaVariacao } from "@/domain/metricas.ts";
import { moeda, numero } from "@/components/relatorio-conteudo.tsx";
import { GraficoDia } from "@/components/grafico-dia.tsx";
import { Cartao, Vazio } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

/** Variacao compacta, para caber na celula da tabela. */
function Delta({ chave, valor }: { chave: string; valor: number | null }) {
  if (valor === null || !Number.isFinite(valor)) {
    return <span className="text-xs text-zinc-300">-</span>;
  }
  const tom = tomDaVariacao(chave, valor);
  const cor =
    tom === "bom"
      ? "text-emerald-700"
      : tom === "ruim"
        ? "text-rose-700"
        : "text-zinc-500";
  const seta = valor > 0 ? "▲" : valor < 0 ? "▼" : "•";
  return (
    <span className={`text-xs font-medium whitespace-nowrap ${cor}`}>
      {seta} {Math.abs(valor).toFixed(0)}%
    </span>
  );
}

const COR_DO_TOM: Record<string, string> = {
  grave: "border-rose-200 bg-rose-50 text-rose-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

function Etiquetas({ linha }: { linha: LinhaDaCarteira }) {
  if (linha.alertas.length === 0) {
    return <span className="text-xs text-emerald-700">Sem pendencia</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {linha.alertas.map((a) => (
        <span
          key={a.chave}
          className={`rounded-full border px-2 py-0.5 text-[11px] ${COR_DO_TOM[a.tom]}`}
        >
          {a.texto}
        </span>
      ))}
    </div>
  );
}

/** Na tabela so cabe o motivo mais forte; o resto vira contagem. */
function Situacao({ linha }: { linha: LinhaDaCarteira }) {
  const [primeiro, ...resto] = linha.alertas;
  if (!primeiro) {
    return <span className="text-xs text-emerald-700">Sem pendencia</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] ${COR_DO_TOM[primeiro.tom]}`}
      >
        {primeiro.texto}
      </span>
      {resto.length > 0 && (
        <span
          className="text-[11px] text-zinc-500"
          title={resto.map((a) => a.texto).join(" · ")}
        >
          +{resto.length}
        </span>
      )}
    </div>
  );
}

function CartaoDeTotal({
  chave,
  valor,
  variacao,
}: {
  chave: string;
  valor: string;
  variacao?: number | null;
}) {
  const m = METRICAS[chave];
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-zinc-500">
        {m.rotulo}
        {m.sigla && <span className="ml-1 text-zinc-400">({m.sigla})</span>}
      </p>
      <p className="text-xl font-semibold text-zinc-900">{valor}</p>
      {variacao !== undefined && (
        <div className="mt-0.5">
          <Delta chave={chave} valor={variacao} />
        </div>
      )}
    </div>
  );
}

export default async function Resultados({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirUsuario();
  const { periodo } = await searchParams;

  const quinzena =
    (periodo ? quinzenaPorChave(periodo) : null) ?? quinzenaDe(new Date());
  const r = await resultadosDaCarteira({ quinzena });

  const anterior = quinzenaAnterior(quinzena);
  const seguinte = quinzenaSeguinte(quinzena);
  // Informacao solta ("sem anuncio rodando") nao entra: se tudo aparece aqui,
  // nada aparece. So o que a equipe resolve hoje.
  const precisamDeAtencao = r.linhas.filter((l) =>
    l.alertas.some((a) => a.tom !== "info"),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            Resultados da carteira
          </h1>
          <p className="text-sm text-zinc-500">
            {rotuloDaQuinzena(quinzena)} · {r.totais.comDados} de{" "}
            {r.totais.clientes} cliente(s) com dado coletado. A lista comeca por
            quem precisa de atencao.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/relatorios?periodo=${anterior.chave}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            ← {rotuloCurto(anterior)}
          </Link>
          <Link
            href={`/relatorios?periodo=${seguinte.chave}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {rotuloCurto(seguinte)} →
          </Link>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoDeTotal
          chave="investimento"
          valor={moeda(r.totais.investimento, r.totais.moeda)}
          variacao={r.totais.variacao.investimento}
        />
        <CartaoDeTotal
          chave="resultados"
          valor={numero(r.totais.resultados)}
          variacao={r.totais.variacao.resultados}
        />
        <CartaoDeTotal
          chave="custoPorResultado"
          valor={
            r.totais.custoPorResultado !== null
              ? moeda(r.totais.custoPorResultado, r.totais.moeda)
              : "-"
          }
          variacao={r.totais.variacao.custoPorResultado}
        />
        <CartaoDeTotal
          chave="ctr"
          valor={`${r.totais.ctr.toFixed(2).replace(".", ",")}%`}
        />
      </div>

      {precisamDeAtencao.length > 0 && (
        <Cartao
          titulo={`Precisa de atencao agora (${precisamDeAtencao.length})`}
          descricao="Ordenado pelo que custa mais caro deixar parado. Clique no cliente para abrir o relatorio da quinzena."
        >
          <ul className="divide-y divide-zinc-100">
            {precisamDeAtencao.map((l) => (
              <li key={l.clienteId} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/relatorios/${l.clienteId}?periodo=${quinzena.chave}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {l.cliente}
                  </Link>
                  {l.saldo.acompanhando && l.saldo.abaixoDoLimite && (
                    <Link
                      href={`/clientes/${l.clienteId}/saldo`}
                      className="text-xs font-medium text-rose-700 underline"
                    >
                      gerar PIX de recarga
                    </Link>
                  )}
                </div>
                <div className="mt-1">
                  <Etiquetas linha={l} />
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {r.serie.length > 0 && (
        <Cartao
          titulo="A carteira dia a dia"
          descricao="Investimento e resultado em graficos separados: juntos exigiriam dois eixos, e dois eixos fazem comparar alturas que nao sao comparaveis."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <GraficoDia
              titulo="Investimento por dia"
              pontos={r.serie.map((p) => ({
                data: p.data,
                valor: p.investimento,
              }))}
              formatar={(v) => moeda(v, r.totais.moeda)}
            />
            <GraficoDia
              titulo="Resultados por dia"
              pontos={r.serie.map((p) => ({
                data: p.data,
                valor: p.resultados,
              }))}
              formatar={(v) => numero(v)}
              cor="#1d4ed8"
            />
          </div>
        </Cartao>
      )}

      <Cartao titulo="Todos os clientes">
        {r.linhas.length === 0 ? (
          <Vazio>Nenhum cliente ativo.</Vazio>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="w-56 py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 text-right font-medium">Investimento</th>
                  <th className="py-2 text-right font-medium">Resultados</th>
                  <th
                    className="py-2 text-right font-medium"
                    title={METRICAS.custoPorResultado.explicacao}
                  >
                    CPR
                  </th>
                  <th
                    className="py-2 text-right font-medium"
                    title={METRICAS.ctr.explicacao}
                  >
                    CTR
                  </th>
                  <th className="py-2 text-right font-medium">Saldo</th>
                  <th className="py-2 text-right font-medium">Posts</th>
                  <th className="w-64 py-2 pl-4 font-medium">Situacao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {r.linhas.map((l) => (
                  <tr
                    key={l.clienteId}
                    className={l.atencao >= 70 ? "bg-rose-50/40" : undefined}
                  >
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/relatorios/${l.clienteId}?periodo=${quinzena.chave}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {l.cliente}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {l.temDados ? moeda(l.investimento, l.moeda) : "-"}
                      <div>
                        <Delta
                          chave="investimento"
                          valor={l.variacao.investimento}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {l.temDados ? numero(l.resultados) : "-"}
                      <div>
                        <Delta
                          chave="resultados"
                          valor={l.variacao.resultados}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {l.custoPorResultado !== null
                        ? moeda(l.custoPorResultado, l.moeda)
                        : "-"}
                      <div>
                        <Delta
                          chave="custoPorResultado"
                          valor={l.variacao.custoPorResultado}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {l.temDados
                        ? `${l.ctr.toFixed(2).replace(".", ",")}%`
                        : "-"}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {!l.saldo.acompanhando ? (
                        <Link
                          href={`/clientes/${l.clienteId}/saldo`}
                          className="text-xs text-zinc-400 underline"
                        >
                          sem recarga
                        </Link>
                      ) : (
                        <Link
                          href={`/clientes/${l.clienteId}/saldo`}
                          className={
                            l.saldo.abaixoDoLimite
                              ? "font-semibold text-rose-700"
                              : "text-zinc-700"
                          }
                        >
                          {moeda(l.saldo.saldo, l.moeda)}
                        </Link>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap text-zinc-600">
                      {l.posts.publicados}
                      {l.posts.aguardando > 0 && (
                        <span className="text-amber-700">
                          {" "}
                          +{l.posts.aguardando}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pl-4">
                      <Situacao linha={l} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Posts: publicados na quinzena; o numero em ambar e quanto ainda espera
          aprovacao. Investimento, resultado e CPR saem da mesma coleta que o
          cliente ve no relatorio dele.
        </p>
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao
          titulo="O que funcionou"
          descricao="Campanhas com o resultado mais barato da quinzena, em toda a carteira. Serve para repetir o que deu certo em cliente parecido."
        >
          <ListaDeCampanhas
            itens={r.destaques.melhores}
            quinzena={quinzena.chave}
            tom="bom"
          />
        </Cartao>
        <Cartao
          titulo="O que saiu caro"
          descricao="Mesmo criterio, do outro lado: e onde mexer primeiro em arte, publico ou oferta."
        >
          <ListaDeCampanhas
            itens={r.destaques.piores}
            quinzena={quinzena.chave}
            tom="ruim"
          />
        </Cartao>
      </div>
    </div>
  );
}

function ListaDeCampanhas({
  itens,
  quinzena,
  tom,
}: {
  itens: Awaited<
    ReturnType<typeof resultadosDaCarteira>
  >["destaques"]["melhores"];
  quinzena: string;
  tom: "bom" | "ruim";
}) {
  if (itens.length === 0) {
    return (
      <Vazio>
        Ainda nao da para dizer: nenhuma campanha da quinzena tem resultado
        suficiente para comparacao.
      </Vazio>
    );
  }

  return (
    <ul className="space-y-3">
      {itens.map((c) => (
        <li
          key={`${c.clienteId}-${c.campaignId}`}
          className="flex items-start gap-3"
        >
          {c.criativo ? (
            <img
              src={c.criativo}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-zinc-200 object-cover"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-zinc-200" />
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={`/relatorios/${c.clienteId}?periodo=${quinzena}`}
              className="text-sm font-medium text-zinc-900 hover:underline"
            >
              {c.cliente}
            </Link>
            <p
              className="truncate text-xs text-zinc-600"
              title={c.nomeOriginal}
            >
              {c.nome}
            </p>
            <p className="mt-0.5 text-xs">
              <span
                className={`font-semibold ${tom === "bom" ? "text-emerald-700" : "text-rose-700"}`}
              >
                {moeda(c.custoPorResultado)}
              </span>
              <span className="text-zinc-500">
                {" "}
                por resultado · {numero(c.resultados)} resultado(s) ·{" "}
                {moeda(c.investimento)} investidos
              </span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
