import Link from "next/link";
import { formatarData, formatarDataHora } from "@/lib/datetime.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Avatar, Cartao, Vazio } from "@/components/ui.tsx";
import { acaoSincronizarTarefas } from "@/app/actions/tarefas.ts";
import type { QuadroDeTarefas, TarefaDaEquipe } from "@/services/tarefas-notion.ts";

function LinhaTarefa({ t, mostrarData }: { t: TarefaDaEquipe; mostrarData: boolean }) {
  return (
    <li
      className={`relative flex items-center gap-3 py-2 ${
        t.minha ? "before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-destaque" : ""
      }`}
    >
      <div className="flex shrink-0 -space-x-1.5">
        {t.responsaveis.length === 0 ? (
          <span
            title="Sem responsavel"
            className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-linha-forte text-[10px] text-tinta-4"
          >
            ?
          </span>
        ) : (
          t.responsaveis
            .slice(0, 2)
            .map((r) => <Avatar key={r} nome={r} tamanho={28} className="ring-2 ring-superficie" />)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <a
          href={t.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-[13px] font-medium text-tinta underline-offset-2 hover:underline"
        >
          {t.titulo}
        </a>
        <p className="truncate text-xs text-tinta-3">
          {t.status ? <span className="sm:hidden">{t.status} · </span> : null}
          {t.responsaveis.length ? t.responsaveis.join(", ") : "sem responsavel"}
          {t.cliente ? ` · ${t.cliente}` : ""}
          {t.tipo ? ` · ${t.tipo}` : ""}
          {mostrarData && t.quando ? ` · ${formatarData(t.quando).slice(0, 5)}` : ""}
          {t.filmagem ? ` · filmagem ${formatarData(t.filmagem).slice(0, 5)}` : ""}
          {t.arteUrl ? (
            <>
              {" · "}
              <a href={t.arteUrl} target="_blank" rel="noreferrer" className="underline">
                arte
              </a>
            </>
          ) : null}
        </p>
      </div>
      {t.status && (
        <span className="hidden shrink-0 rounded-full bg-superficie-3 px-2 py-0.5 text-[11px] font-medium text-tinta-2 sm:inline">
          {t.status}
        </span>
      )}
    </li>
  );
}

function Grupo({
  titulo,
  tarefas,
  tom,
  mostrarData,
}: {
  titulo: string;
  tarefas: TarefaDaEquipe[];
  tom?: "erro" | "destaque";
  mostrarData: boolean;
}) {
  if (tarefas.length === 0) return null;
  return (
    <div>
      <h3 className="mb-0.5 flex items-center gap-2 text-xs font-semibold text-tinta-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            tom === "erro" ? "bg-rose-500" : tom === "destaque" ? "bg-destaque" : "bg-tinta-4"
          }`}
        />
        {titulo}
        <span className="num font-medium text-tinta-4">{tarefas.length}</span>
      </h3>
      <ul className="divide-y divide-linha-suave">
        {tarefas.map((t) => (
          <LinhaTarefa key={t.id} t={t} mostrarData={mostrarData} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Cartao do dashboard: as tarefas da equipe lidas do Notion (o mesmo que o
 * Notion Calendar mostra), para todo mundo ver o que esta na fila.
 */
export function TarefasDaEquipe({ quadro, nomeDaPessoa }: { quadro: QuadroDeTarefas; nomeDaPessoa: string }) {
  const todas = [...quadro.atrasadas, ...quadro.hoje, ...quadro.proximas, ...quadro.semData];
  const minhas = todas.filter((t) => t.minha).length;

  return (
    <Cartao
      titulo="Tarefas da equipe"
      contador={quadro.bases.length > 0 ? todas.length : undefined}
      acao={
        <span className="text-xs text-tinta-4">
          {quadro.bases.length === 0
            ? "Notion nao conectado"
            : quadro.ultimaLeitura
              ? `Notion · lido ${formatarDataHora(quadro.ultimaLeitura)}`
              : "Notion · nunca lido"}
        </span>
      }
    >
      {quadro.bases.length === 0 ? (
        <Vazio
          acao={
            <Link href="/configuracoes" className="text-xs font-semibold text-destaque">
              Conectar a base de tarefas
            </Link>
          }
        >
          As tarefas do Notion Calendar aparecem aqui para todo mundo. Falta colar o link da base
          em Configuracoes.
        </Vazio>
      ) : todas.length === 0 ? (
        <Vazio>Nenhuma tarefa em aberto. Se a base mudou agora, sincronize.</Vazio>
      ) : (
        <div className="space-y-5 pl-3">
          <Grupo titulo="Atrasadas" tarefas={quadro.atrasadas} tom="erro" mostrarData />
          <Grupo titulo="Hoje" tarefas={quadro.hoje} tom="destaque" mostrarData={false} />
          <Grupo titulo="Proximos 7 dias" tarefas={quadro.proximas} mostrarData />
          <Grupo titulo="Sem data" tarefas={quadro.semData} mostrarData={false} />
        </div>
      )}

      {quadro.bases.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-linha-suave pt-3">
          <p className="text-xs text-tinta-3">
            {minhas > 0 ? (
              <>
                <span className="mr-1.5 inline-block h-3 w-0.5 rounded-full bg-destaque align-middle" />
                {minhas} com voce, {nomeDaPessoa}.{" "}
              </>
            ) : null}
            O sistema rele o Notion de hora em hora.
          </p>
          <FormAcao acao={acaoSincronizarTarefas} textoBotao="Sincronizar agora">
            <span className="sr-only">Ler as bases do Notion agora</span>
          </FormAcao>
        </div>
      )}
    </Cartao>
  );
}
