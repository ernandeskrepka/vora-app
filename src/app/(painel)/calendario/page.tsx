import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import {
  FUSO_PADRAO,
  formatarDataHora,
  formatarHora,
  formatarMesAno,
  intervaloDoMes,
} from "@/lib/datetime.ts";
import { formatInTimeZone } from "date-fns-tz";
import { Cartao, Etiqueta, Vazio, classeInput } from "@/components/ui.tsx";
import { FormAcao } from "@/components/form-acao.tsx";
import { ROTULO_STATUS, type PostStatus } from "@/domain/post-status.ts";
import { ROTULO_PAUTA } from "@/domain/planejamento.ts";
import {
  carregarCalendario,
  situacaoDoNotion,
  type ItemDoCalendarioGeral,
} from "@/services/calendario.ts";
import { acaoSincronizarTodosNotion } from "@/app/actions/clientes.ts";

export const dynamic = "force-dynamic";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

/** Um item na celula do dia: post com a cor do status, pauta tracejada. */
function ItemDoDia({ item }: { item: ItemDoCalendarioGeral }) {
  if (item.tipo === "post") {
    return (
      <Link
        href={`/posts/${item.id}`}
        className={`block truncate rounded border px-1.5 py-1 text-[11px] status-${item.status}`}
        title={`${item.cliente} - ${ROTULO_STATUS[item.status]}${item.resumo ? ` - ${item.resumo}` : ""}`}
      >
        {formatarHora(item.quando, item.fuso)} {item.cliente}
      </Link>
    );
  }

  return (
    <Link
      href={`/clientes/${item.clienteId}/planejamento`}
      className="block truncate rounded border border-dashed border-zinc-300 bg-zinc-50/70 px-1.5 py-1 text-[11px] text-zinc-500"
      title={`${item.cliente} - pauta (${ROTULO_PAUTA[item.status]}): ${item.titulo}${item.doNotion ? " - do Notion" : ""}`}
    >
      {item.doNotion && (
        <span className="mr-1 rounded bg-zinc-800 px-1 text-[9px] font-bold text-white">
          N
        </span>
      )}
      {item.cliente}
    </Link>
  );
}

export default async function Calendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cliente?: string }>;
}) {
  await exigirUsuario();
  const params = await searchParams;

  const hoje = new Date();
  const [anoStr, mesStr] = (
    params.mes ?? formatInTimeZone(hoje, FUSO_PADRAO, "yyyy-MM")
  ).split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const { inicio, fim } = intervaloDoMes(ano, mes);

  const [clientes, calendario, notion] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    carregarCalendario({ inicio, fim, clienteId: params.cliente || undefined }),
    situacaoDoNotion(),
  ]);

  // Monta a grade do mes no fuso local.
  const diasDoMes = new Date(ano, mes, 0).getDate();
  const primeiroDiaSemana = new Date(
    `${ano}-${String(mes).padStart(2, "0")}-01T12:00:00`,
  ).getDay();
  const celulas: Array<{ dia: number | null; itens: ItemDoCalendarioGeral[] }> =
    [];

  for (let i = 0; i < primeiroDiaSemana; i++)
    celulas.push({ dia: null, itens: [] });
  for (let dia = 1; dia <= diasDoMes; dia++) {
    const chave = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    celulas.push({
      dia,
      itens: calendario.itens.filter(
        (i) => formatInTimeZone(i.quando, FUSO_PADRAO, "yyyy-MM-dd") === chave,
      ),
    });
  }

  const mesAnterior =
    mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const mesSeguinte =
    mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const qs = (m: string) =>
    `?mes=${m}${params.cliente ? `&cliente=${params.cliente}` : ""}`;

  const doNotion = calendario.pautas.filter((p) => p.doNotion).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Calendario</h1>
          <p className="text-sm text-zinc-500">
            {formatarMesAno(inicio)} · {calendario.posts.length} post(s) ·{" "}
            {calendario.pautas.length} pauta(s) com data
            {doNotion > 0 ? ` (${doNotion} do Notion)` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={qs(mesAnterior)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            Anterior
          </Link>
          <Link
            href={qs(mesSeguinte)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            Proximo
          </Link>
          <form method="get" className="flex items-center gap-2">
            <input
              type="hidden"
              name="mes"
              value={`${ano}-${String(mes).padStart(2, "0")}`}
            />
            <select
              name="cliente"
              defaultValue={params.cliente ?? ""}
              className={classeInput}
            >
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              Filtrar
            </button>
          </form>
        </div>
      </header>

      <Cartao
        titulo="Sincronizado com o Notion"
        acao={
          <span className="text-xs text-zinc-500">
            {notion.comPagina} cliente(s) com pagina
            {notion.semPagina > 0 ? ` · ${notion.semPagina} sem` : ""}
            {notion.maisRecente
              ? ` · ultima leitura ${formatarDataHora(notion.maisRecente)}`
              : " · nunca lido"}
          </span>
        }
      >
        <p className="text-sm text-zinc-600">
          O cronograma de cada cliente no Notion entra aqui como pauta, no dia
          marcado - e o sistema rele sozinho, algumas vezes por dia. O botao
          forca a leitura agora, de todos de uma vez. Pauta e planejamento: vira
          post quando a equipe sobe o criativo, ou na hora se voce marcar a
          opcao abaixo.
        </p>
        {notion.nuncaLidos > 0 && notion.comPagina > 0 && (
          <p className="mt-1 text-xs text-amber-700">
            {notion.nuncaLidos} cliente(s) com pagina configurada ainda nao
            foram lidos.
          </p>
        )}
        <div className="mt-3">
          <FormAcao
            acao={acaoSincronizarTodosNotion}
            textoBotao="Sincronizar todos agora"
          >
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="criarPostos" value="sim" />
                Ja criar o rascunho do post nos dias com data
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                Horario
                <select
                  name="hora"
                  defaultValue="9"
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                >
                  {Array.from({ length: 15 }, (_, i) => i + 7).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </FormAcao>
        </div>
      </Cartao>

      <Cartao>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-zinc-200 text-xs">
          {DIAS.map((d) => (
            <div
              key={d}
              className="bg-zinc-50 px-2 py-1.5 text-center font-semibold text-zinc-600"
            >
              {d}
            </div>
          ))}
          {celulas.map((celula, i) => (
            <div key={i} className="min-h-[92px] bg-white p-1.5">
              {celula.dia && (
                <p className="mb-1 text-[11px] font-semibold text-zinc-400">
                  {celula.dia}
                </p>
              )}
              <ul className="space-y-1">
                {celula.itens.map((item) => (
                  <li key={`${item.tipo}-${item.id}`}>
                    <ItemDoDia item={item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-dashed border-zinc-400 bg-zinc-50 align-middle" />
            pauta com data (ainda nao e post)
          </span>
          <span>
            <span className="mr-1 rounded bg-zinc-800 px-1 text-[9px] font-bold text-white">
              N
            </span>
            veio do Notion
          </span>
          {(
            [
              "AGUARDANDO_APROVACAO",
              "APROVADO",
              "PUBLICADO",
              "POST_SEM_RESPOSTA",
            ] as const
          ).map((s) => (
            <span key={s}>
              <span
                className={`mr-1 inline-block h-2.5 w-2.5 rounded border align-middle status-${s}`}
              />
              {ROTULO_STATUS[s]}
            </span>
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Lista do mes">
        {calendario.itens.length === 0 ? (
          <Vazio>Nada planejado nesse mes.</Vazio>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {calendario.itens.map((item) => (
              <li
                key={`${item.tipo}-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                {item.tipo === "post" ? (
                  <>
                    <Link
                      href={`/posts/${item.id}`}
                      className="text-sm hover:underline"
                    >
                      {formatInTimeZone(
                        item.quando,
                        item.fuso,
                        "dd/MM 'as' HH:mm",
                      )}{" "}
                      - {item.cliente}
                      {item.resumo && (
                        <span className="text-zinc-500">
                          {" "}
                          · {item.resumo.slice(0, 60)}
                        </span>
                      )}
                    </Link>
                    <Etiqueta status={item.status as PostStatus} />
                  </>
                ) : (
                  <>
                    <Link
                      href={`/clientes/${item.clienteId}/planejamento`}
                      className="text-sm text-zinc-600 hover:underline"
                    >
                      {formatInTimeZone(item.quando, item.fuso, "dd/MM")} -{" "}
                      {item.cliente}
                      <span className="text-zinc-500">
                        {" "}
                        · {item.titulo.slice(0, 60)}
                      </span>
                    </Link>
                    <span className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500">
                      pauta · {ROTULO_PAUTA[item.status]}
                      {item.doNotion ? " · Notion" : ""}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
