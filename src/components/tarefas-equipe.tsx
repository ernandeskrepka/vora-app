import Link from "next/link";
import { formatarData, formatarDataHora } from "@/lib/datetime.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Cartao, Vazio } from "@/components/ui.tsx";
import { acaoSincronizarTarefas } from "@/app/actions/tarefas.ts";
import type { QuadroDeTarefas, TarefaDaEquipe } from "@/services/tarefas-notion.ts";

function LinhaTarefa({ t, mostrarData }: { t: TarefaDaEquipe; mostrarData: boolean }) {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 ${
        t.minha ? "-mx-2 rounded-md bg-vora-verde/10 px-2" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <a
          href={t.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-tinta underline-offset-2 hover:underline"
        >
          {t.titulo}
        </a>
        <p className="text-xs text-tinta-3">
          {t.responsaveis.length ? t.responsaveis.join(", ") : "sem responsavel"}
          {t.cliente ? ` · ${t.cliente}` : ""}
          {t.tipo ? ` · ${t.tipo}` : ""}
          {mostrarData && t.quando ? ` · ${formatarData(t.quando)}` : ""}
          {t.filmagem ? ` · filmagem ${formatarData(t.filmagem)}` : ""}
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
        <span className="shrink-0 rounded-full border border-linha-forte px-2 py-0.5 text-[11px] text-tinta-2">
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
      <h3
        className={`mb-1 text-[11px] font-semibold tracking-wider uppercase ${
          tom === "erro" ? "text-rose-700" : tom === "destaque" ? "text-vora-verde-escuro" : "text-tinta-3"
        }`}
      >
        {titulo} · {tarefas.length}
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
  const minhas = [...quadro.atrasadas, ...quadro.hoje, ...quadro.proximas, ...quadro.semData].filter(
    (t) => t.minha,
  ).length;
  const vazio =
    quadro.atrasadas.length + quadro.hoje.length + quadro.proximas.length + quadro.semData.length === 0;

  return (
    <Cartao
      titulo="Tarefas da equipe (Notion)"
      acao={
        <span className="text-xs text-tinta-3">
          {quadro.bases.length === 0
            ? "nenhuma base configurada"
            : quadro.ultimaLeitura
              ? `lido ${formatarDataHora(quadro.ultimaLeitura)}`
              : "nunca lido"}
        </span>
      }
      className="lg:col-span-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-tinta-2">
          O calendario de tarefas do Notion, o mesmo do Notion Calendar, lido pelo sistema: quem
          esta com o que, para quando. Em verde, o que esta com voce, {nomeDaPessoa}
          {minhas > 0 ? ` (${minhas})` : ""}. O sistema rele sozinho de hora em hora; o botao le agora.
        </p>
        <FormAcao acao={acaoSincronizarTarefas} textoBotao="Sincronizar com o Notion">
          <span className="sr-only">Ler as bases do Notion agora</span>
        </FormAcao>
      </div>

      {quadro.bases.length === 0 ? (
        <div className="mt-3">
          <Vazio>
            Nenhuma base configurada.{" "}
            <Link href="/configuracoes" className="underline">
              Cole o link da base de tarefas em Configuracoes
            </Link>
            .
          </Vazio>
        </div>
      ) : vazio ? (
        <div className="mt-3">
          <Vazio>Nenhuma tarefa em aberto. Ou a base ainda nao foi lida: clique em sincronizar.</Vazio>
        </div>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <Grupo titulo="Atrasadas" tarefas={quadro.atrasadas} tom="erro" mostrarData />
            <Grupo titulo="Hoje" tarefas={quadro.hoje} tom="destaque" mostrarData={false} />
          </div>
          <div className="space-y-5">
            <Grupo titulo="Proximos 7 dias" tarefas={quadro.proximas} mostrarData />
            <Grupo titulo="Sem data" tarefas={quadro.semData} mostrarData={false} />
          </div>
        </div>
      )}

      {quadro.concluidasRecentes.length > 0 && (
        <p className="mt-4 text-xs text-tinta-4">
          Concluidas recentemente: {quadro.concluidasRecentes.map((t) => t.titulo).join(" · ")}
        </p>
      )}
    </Cartao>
  );
}
