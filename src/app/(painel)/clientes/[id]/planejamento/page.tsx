import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { FUSO_PADRAO } from "@/lib/datetime.ts";
import { formatInTimeZone } from "date-fns-tz";
import { carregarQuadro } from "@/services/planejamento.ts";
import { COLUNAS, ROTULO_PAUTA, destinosPossiveis, podeVirarPost, type StatusPauta } from "@/domain/planejamento.ts";
import { acaoCriarPauta, acaoMoverPauta, acaoRemoverPauta } from "@/app/actions/cliente-area.ts";
import { acaoSincronizarNotion } from "@/app/actions/clientes.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Aviso, Campo, Cartao, classeInput } from "@/components/ui.tsx";
import { formatarDataHora } from "@/lib/datetime.ts";

export const dynamic = "force-dynamic";

const COR_COLUNA: Record<string, string> = {
  IDEIA: "border-zinc-300",
  EM_PRODUCAO: "border-sky-300",
  PRONTO: "border-emerald-300",
};

export default async function Planejamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { pautas, arquivadas } = await carregarQuadro(id);
  const cliente = await prisma.client.findUniqueOrThrow({ where: { id } });

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        O que a equipe vai produzir para a {cliente.name}. A pauta anda da ideia ate ficar pronta e,
        quando o criativo existe, vira post com um clique.
        {arquivadas > 0 && ` ${arquivadas} arquivada(s).`}
      </p>

      <Cartao titulo="Calendario no Notion">
        {cliente.notionPageId ? (
          <>
            <p className="text-sm text-zinc-600">
              Le o cronograma do cliente no Notion e cria a pauta aqui. Casa pelo titulo, entao
              rodar de novo atualiza o que mudou em vez de duplicar. O que ja virou post fica como
              esta - mudar a data de um post agendado passa pelo reagendamento, que invalida a
              aprovacao do cliente.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              <a
                href={cliente.notionPageId}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Abrir a pagina no Notion
              </a>
              {cliente.notionSyncedAt
                ? ` · ultima leitura em ${formatarDataHora(cliente.notionSyncedAt)}`
                : " · nunca sincronizado"}
            </p>
            <div className="mt-3">
              <FormAcao acao={acaoSincronizarNotion} textoBotao="Sincronizar com o Notion">
                <input type="hidden" name="clienteId" value={id} />
              </FormAcao>
            </div>
          </>
        ) : (
          <Aviso tom="info">
            Esse cliente ainda nao tem pagina do Notion configurada. Cole o link do cronograma em{" "}
            <Link href={`/clientes/${id}/ajustes`} className="font-semibold underline">
              Ajustes
            </Link>
            .
          </Aviso>
        )}
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUNAS.map((coluna) => {
          const daColuna = pautas.filter((p) => p.status === coluna);
          return (
            <section
              key={coluna}
              className={`rounded-xl border-t-4 ${COR_COLUNA[coluna]} border border-zinc-200 bg-white`}
            >
              <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-zinc-800">{ROTULO_PAUTA[coluna]}</h2>
                <span className="text-xs text-zinc-400">{daColuna.length}</span>
              </header>

              <ul className="space-y-3 p-3">
                {daColuna.length === 0 && (
                  <li className="py-4 text-center text-xs text-zinc-400">Nada aqui.</li>
                )}

                {daColuna.map((pauta) => (
                  <li key={pauta.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-medium text-zinc-900">{pauta.title}</p>
                    {pauta.targetDate && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        para {formatInTimeZone(pauta.targetDate, FUSO_PADRAO, "dd/MM")}
                      </p>
                    )}
                    {pauta.notes && (
                      <p className="mt-1.5 text-xs whitespace-pre-wrap text-zinc-600">{pauta.notes}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {destinosPossiveis(pauta.status as StatusPauta)
                        .filter((d) => d !== "VIROU_POST")
                        .map((destino) => (
                          <form key={destino} action={acaoMoverPauta}>
                            <input type="hidden" name="pautaId" value={pauta.id} />
                            <input type="hidden" name="clienteId" value={id} />
                            <input type="hidden" name="para" value={destino} />
                            <button
                              type="submit"
                              className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100"
                            >
                              {destino === "ARQUIVADO" ? "Arquivar" : `→ ${ROTULO_PAUTA[destino]}`}
                            </button>
                          </form>
                        ))}

                      {podeVirarPost(pauta.status as StatusPauta) && (
                        <Link
                          href={`/posts/novo?cliente=${id}&pauta=${pauta.id}`}
                          className="rounded border border-vora-preto bg-vora-preto px-2 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800"
                        >
                          Virar post
                        </Link>
                      )}

                      <form action={acaoRemoverPauta} className="ml-auto">
                        <input type="hidden" name="pautaId" value={pauta.id} />
                        <input type="hidden" name="clienteId" value={id} />
                        <button type="submit" className="text-[11px] text-rose-600 hover:underline">
                          excluir
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <Cartao titulo="Nova pauta">
        <FormAcao acao={acaoCriarPauta} textoBotao="Adicionar pauta" variante="primario">
          <input type="hidden" name="clienteId" value={id} />
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Campo rotulo="Titulo">
              <input
                name="titulo"
                required
                className={classeInput}
                placeholder="Ex.: Carrossel sobre check-up de outubro"
              />
            </Campo>
            <Campo rotulo="Data prevista (opcional)">
              <input type="date" name="data" className={classeInput} />
            </Campo>
          </div>
          <div className="mt-3">
            <Campo rotulo="Notas (opcional)" dica="Referencias, o que precisa gravar, quem aparece.">
              <textarea name="notas" rows={3} className={classeInput} />
            </Campo>
          </div>
        </FormAcao>
      </Cartao>

      {pautas.some((p) => p.status === "VIROU_POST") && (
        <Cartao titulo="Pautas que viraram post">
          <ul className="divide-y divide-zinc-100">
            {pautas
              .filter((p) => p.status === "VIROU_POST")
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{p.title}</span>
                  {p.post && (
                    <Link href={`/posts/${p.post.id}`} className="text-xs underline">
                      ver post
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
