import Link from "next/link";
import { exigirUsuario } from "@/lib/auth.ts";
import { FUSO_PADRAO, formatarData, formatarDataHora } from "@/lib/datetime.ts";
import { formatInTimeZone } from "date-fns-tz";
import { relatorioMensal } from "@/services/relatorios.ts";
import { Aviso, Cartao, Etiqueta, Vazio } from "@/components/ui.tsx";
import { BotaoImprimir } from "@/components/botao-imprimir.tsx";
import type { PostStatus } from "@/domain/post-status.ts";

export const dynamic = "force-dynamic";

function moeda(valor: number, moedaSigla = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moedaSigla }).format(valor);
}
function numero(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(valor));
}

export default async function RelatorioCliente({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  await exigirUsuario();
  const { clienteId } = await params;
  const { mes } = await searchParams;

  const referencia = mes ?? formatInTimeZone(new Date(), FUSO_PADRAO, "yyyy-MM");
  const [ano, mesNumero] = referencia.split("-").map(Number);

  const r = await relatorioMensal({ clientId: clienteId, ano, mes: mesNumero });
  const t = r.anuncios.totais;

  const anterior =
    mesNumero === 1 ? `${ano - 1}-12` : `${ano}-${String(mesNumero - 1).padStart(2, "0")}`;
  const seguinte =
    mesNumero === 12 ? `${ano + 1}-01` : `${ano}-${String(mesNumero + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{r.cliente.name}</h1>
          <p className="text-sm text-zinc-500">
            Relatorio de {formatInTimeZone(r.periodo.inicio, FUSO_PADRAO, "MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 nao-imprimir">
          <Link
            href={`/relatorios/${clienteId}?mes=${anterior}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            Anterior
          </Link>
          <Link
            href={`/relatorios/${clienteId}?mes=${seguinte}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            Proximo
          </Link>
          <BotaoImprimir />
        </div>
      </header>

      <Cartao titulo="Resultados de anuncios">
        {!r.anuncios.temDados ? (
          <Aviso tom="info">
            Sem dados de anuncios nesse mes. Conecte a conta de anuncios do cliente em Conexoes e
            aguarde a coleta diaria.
          </Aviso>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[
                ["Investimento", moeda(t.investimento, t.moeda)],
                ["Alcance (melhor dia)", numero(t.alcance)],
                ["Impressoes", numero(t.impressoes)],
                ["Cliques", numero(t.cliques)],
                ["CTR", `${t.ctr.toFixed(2)}%`],
                ["CPC", moeda(t.cpc, t.moeda)],
                ["CPM", moeda(t.cpm, t.moeda)],
                ["Conversoes / leads", numero(t.conversoes)],
                [
                  "Custo por resultado",
                  t.custoPorResultado !== null ? moeda(t.custoPorResultado, t.moeda) : "-",
                ],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{rotulo}</p>
                  <p className="text-lg font-semibold text-zinc-900">{valor}</p>
                </div>
              ))}
            </div>

            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="py-2">Campanha</th>
                  <th className="py-2 text-right">Investimento</th>
                  <th className="py-2 text-right">Impressoes</th>
                  <th className="py-2 text-right">Cliques</th>
                  <th className="py-2 text-right">Conversoes</th>
                </tr>
              </thead>
              <tbody>
                {r.anuncios.campanhas.map((c) => (
                  <tr key={c.campaignId} className="border-b border-zinc-100">
                    <td className="py-2">{c.campaignName}</td>
                    <td className="py-2 text-right">{moeda(c.spend, c.currency)}</td>
                    <td className="py-2 text-right">{numero(c.impressions)}</td>
                    <td className="py-2 text-right">{numero(c.clicks)}</td>
                    <td className="py-2 text-right">{numero(c.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo={`Posts publicados (${r.posts.publicados.length})`}>
          {r.posts.publicados.length === 0 ? (
            <Vazio>Nenhum post publicado nesse mes.</Vazio>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {r.posts.publicados.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <p className="font-medium text-zinc-800">
                    {formatarData(p.scheduledAt, r.cliente.timezone)} -{" "}
                    {p.format.replace("_", " ").toLowerCase()}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {p.publications.map((pub) =>
                      pub.permalink ? (
                        <a
                          key={pub.id}
                          href={pub.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="mr-2 underline"
                        >
                          {pub.network}
                        </a>
                      ) : (
                        <span key={pub.id} className="mr-2">
                          {pub.network}
                        </span>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo={`POST SEM RESPOSTA (${r.posts.semResposta.length})`}>
          {r.posts.semResposta.length === 0 ? (
            <Vazio>Nenhum post ficou sem resposta nesse mes.</Vazio>
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-600">
                Posts que nao foram publicados porque nao houve aprovacao ate o horario previsto.
              </p>
              <ul className="divide-y divide-zinc-100">
                {r.posts.semResposta.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{formatarDataHora(p.scheduledAt, r.cliente.timezone)}</span>
                    <Etiqueta status={p.status as PostStatus} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        <Cartao titulo={`Reprovados (${r.posts.reprovados.length})`} className="lg:col-span-2">
          {r.posts.reprovados.length === 0 ? (
            <Vazio>Nenhuma reprovacao nesse mes.</Vazio>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {r.posts.reprovados.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <p className="font-medium text-zinc-800">
                    {formatarDataHora(p.scheduledAt, r.cliente.timezone)}
                    {p.decisions[0] ? ` - por ${p.decisions[0].approverName}` : ""}
                  </p>
                  {p.decisions[0]?.comment && (
                    <p className="text-xs text-zinc-600">"{p.decisions[0].comment}"</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <p className="text-xs text-zinc-400">
        Para PDF, use a impressao do navegador (salvar como PDF). O layout de impressao esconde a
        navegacao.
      </p>
    </div>
  );
}
