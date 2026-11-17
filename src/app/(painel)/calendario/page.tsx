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
import {
  Botao,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Vazio,
  classeInput,
} from "@/components/ui.tsx";
import {
  IconeDireita,
  IconeEsquerda,
  IconeSincronizar,
} from "@/components/icones.tsx";
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
        className={`flex items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-80 status-${item.status}`}
        title={`${item.cliente} - ${ROTULO_STATUS[item.status]}${item.resumo ? ` - ${item.resumo}` : ""}`}
      >
        <span className="num shrink-0 opacity-70">
          {formatarHora(item.quando, item.fuso)}
        </span>
        <span className="truncate">{item.cliente}</span>
      </Link>
    );
  }

  return (
    <Link
      href={`/clientes/${item.clienteId}/planejamento`}
      className="flex items-center gap-1.5 truncate rounded-md border border-dashed border-linha-forte px-1.5 py-1 text-[11px] text-tinta-3 transition-colors hover:border-tinta-4 hover:text-tinta-2"
      title={`${item.cliente} - pauta (${ROTULO_PAUTA[item.status]}): ${item.titulo}${item.doNotion ? " - do Notion" : ""}`}
    >
      {item.doNotion && (
        <span className="rounded bg-tinta px-1 text-[9px] font-bold text-fundo">
          N
        </span>
      )}
      <span className="truncate">{item.cliente}</span>
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

  // Fecha a ultima semana, para a grade nao terminar num buraco.
  while (celulas.length % 7 !== 0) celulas.push({ dia: null, itens: [] });

  const hojeChave = formatInTimeZone(hoje, FUSO_PADRAO, "yyyy-MM-dd");
  const ehHoje = (dia: number | null) =>
    dia !== null &&
    `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` === hojeChave;

  const mesAnterior =
    mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const mesSeguinte =
    mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const qs = (m: string) =>
    `?mes=${m}${params.cliente ? `&cliente=${params.cliente}` : ""}`;

  const doNotion = calendario.pautas.filter((p) => p.doNotion).length;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        sobre="Todos os clientes"
        titulo={formatarMesAno(inicio).replace(/^./, (l) => l.toUpperCase())}
        descricao={`${calendario.posts.length} post(s) · ${calendario.pautas.length} pauta(s) com data${
          doNotion > 0 ? ` (${doNotion} do Notion)` : ""
        }`}
        acoes={
          <>
            <form method="get" className="flex items-center gap-2">
              <input
                type="hidden"
                name="mes"
                value={`${ano}-${String(mes).padStart(2, "0")}`}
              />
              <select
                name="cliente"
                defaultValue={params.cliente ?? ""}
                className={`${classeInput} h-9 w-52 py-0`}
                aria-label="Filtrar por cliente"
              >
                <option value="">Todos os clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Botao type="submit" variante="secundario">
                Filtrar
              </Botao>
            </form>
            <div className="flex items-center rounded-lg border border-linha-forte bg-superficie">
              <Link
                href={qs(mesAnterior)}
                aria-label="Mes anterior"
                className="grid h-9 w-9 place-items-center rounded-l-lg text-tinta-2 hover:bg-superficie-2"
              >
                <IconeEsquerda tamanho={16} />
              </Link>
              <Link
                href={qs(formatInTimeZone(hoje, FUSO_PADRAO, "yyyy-MM"))}
                className="border-x border-linha px-3 text-[13px] font-semibold leading-9 text-tinta hover:bg-superficie-2"
              >
                Hoje
              </Link>
              <Link
                href={qs(mesSeguinte)}
                aria-label="Proximo mes"
                className="grid h-9 w-9 place-items-center rounded-r-lg text-tinta-2 hover:bg-superficie-2"
              >
                <IconeDireita tamanho={16} />
              </Link>
            </div>
          </>
        }
      />

      <Cartao>
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-linha text-xs">
          {DIAS.map((d, i) => (
            <div
              key={d}
              className={`sobre border-b border-linha px-2 py-2 text-center ${
                i === 0 || i === 6 ? "bg-superficie-2" : ""
              }`}
            >
              {d}
            </div>
          ))}
          {celulas.map((celula, i) => {
            const coluna = i % 7;
            const fimDeSemana = coluna === 0 || coluna === 6;
            return (
              <div
                key={i}
                className={`min-h-[104px] border-linha p-1.5 ${coluna < 6 ? "border-r" : ""} ${
                  i < celulas.length - 7 ? "border-b" : ""
                } ${celula.dia === null || fimDeSemana ? "bg-superficie-2" : ""}`}
              >
                {celula.dia && (
                  <p className="mb-1 flex justify-end">
                    <span
                      className={`num grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11px] font-semibold ${
                        ehHoje(celula.dia)
                          ? "bg-destaque text-white"
                          : "text-tinta-3"
                      }`}
                    >
                      {celula.dia}
                    </span>
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
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-tinta-3">
          {(
            [
              "AGUARDANDO_APROVACAO",
              "APROVADO",
              "PUBLICADO",
              "POST_SEM_RESPOSTA",
              "RASCUNHO",
            ] as const
          ).map((st) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full status-${st}`}
                style={{ backgroundColor: "var(--st)" }}
              />
              {ROTULO_STATUS[st]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3.5 rounded border border-dashed border-tinta-4" />
            pauta com data (ainda nao e post)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-tinta px-1 text-[9px] font-bold text-fundo">
              N
            </span>
            veio do Notion
          </span>
        </div>
      </Cartao>

      {/* Sincronizacao: uma linha de estado; as opcoes abrem sob demanda. */}
      <details className="vidro group rounded-2xl border border-linha bg-superficie shadow-cartao">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <span className="flex items-center gap-2.5 text-[13px] font-semibold text-tinta">
            <IconeSincronizar tamanho={15} className="text-tinta-4" />
            Sincronizacao com o Notion
          </span>
          <span className="text-xs text-tinta-3">
            {notion.comPagina} cliente(s) com pagina
            {notion.semPagina > 0 ? ` · ${notion.semPagina} sem` : ""}
            {notion.maisRecente
              ? ` · ultima leitura ${formatarDataHora(notion.maisRecente)}`
              : " · nunca lido"}
            <span className="ml-2 font-semibold text-tinta-2 group-open:hidden">abrir</span>
            <span className="ml-2 hidden font-semibold text-tinta-2 group-open:inline">fechar</span>
          </span>
        </summary>
        <div className="border-t border-linha-suave px-5 pt-4 pb-5">
          <p className="max-w-3xl text-sm leading-relaxed text-tinta-3">
            O cronograma de cada cliente no Notion entra aqui como pauta, no dia marcado, e o
            sistema rele sozinho algumas vezes por dia. O botao forca a leitura agora, de todos de
            uma vez. Pauta e planejamento: vira post quando a equipe sobe o criativo, ou na hora se
            voce marcar a opcao abaixo.
          </p>
          {notion.nuncaLidos > 0 && notion.comPagina > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {notion.nuncaLidos} cliente(s) com pagina configurada ainda nao foram lidos.
            </p>
          )}
          <div className="mt-4">
            <FormAcao acao={acaoSincronizarTodosNotion} textoBotao="Sincronizar todos agora">
              <div className="flex flex-wrap items-center gap-4 rounded-xl bg-superficie-2 px-3 py-2.5">
                <label className="flex items-center gap-2 text-sm text-tinta-2">
                  <input type="checkbox" name="criarPostos" value="sim" className="accent-[var(--destaque)]" />
                  Ja criar o rascunho do post nos dias com data
                </label>
                <label className="flex items-center gap-2 text-sm text-tinta-2">
                  Horario
                  <select
                    name="hora"
                    defaultValue="9"
                    className="rounded-lg border border-linha-forte bg-superficie px-2 py-1 text-sm"
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
        </div>
      </details>

      <Cartao titulo="Lista do mes" contador={calendario.itens.length}>
        {calendario.itens.length === 0 ? (
          <Vazio>Nada planejado nesse mes.</Vazio>
        ) : (
          <ul className="divide-y divide-linha-suave">
            {calendario.itens.map((item) => (
              <li
                key={`${item.tipo}-${item.id}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                {item.tipo === "post" ? (
                  <>
                    <Link
                      href={`/posts/${item.id}`}
                      className="min-w-0 flex-1 truncate text-[13px] text-tinta hover:underline"
                    >
                      {formatInTimeZone(
                        item.quando,
                        item.fuso,
                        "dd/MM 'as' HH:mm",
                      )}{" "}
                      - {item.cliente}
                      {item.resumo && (
                        <span className="text-tinta-3">
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
                      className="min-w-0 flex-1 truncate text-[13px] text-tinta-2 hover:underline"
                    >
                      {formatInTimeZone(item.quando, item.fuso, "dd/MM")} -{" "}
                      {item.cliente}
                      <span className="text-tinta-3">
                        {" "}
                        · {item.titulo.slice(0, 60)}
                      </span>
                    </Link>
                    <span className="shrink-0 rounded-full border border-dashed border-linha-forte px-2 py-0.5 text-[11px] text-tinta-3">
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
