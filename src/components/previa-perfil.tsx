import Link from "next/link";
import { formatarData, formatarDataHora } from "@/lib/datetime.ts";
import { ROTULO_STATUS } from "@/domain/post-status.ts";
import { Vazio } from "@/components/ui.tsx";
import type { PreviaDoPerfil } from "@/services/perfil.ts";

/** Completa a grade ate fechar as linhas de tres, como o Instagram faz. */
function vazias(quantidade: number): Array<{ id: string; vazia: true }> {
  const faltam = quantidade >= 9 ? (3 - (quantidade % 3)) % 3 : 9 - quantidade;
  return Array.from({ length: faltam }, (_, i) => ({ id: `vazia-${i}`, vazia: true as const }));
}

/**
 * O celular com a grade do feed. Serve para a equipe (com link para o post e
 * quem subiu a arte) e para o cliente (so a grade e as datas).
 */
export function CelularComGrade({
  previa,
  interno,
}: {
  previa: PreviaDoPerfil;
  interno: boolean;
}) {
  const grade = [...previa.grade.slice(0, 18), ...vazias(Math.min(previa.grade.length, 18))];

  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="overflow-hidden rounded-[28px] border-8 border-zinc-900 bg-zinc-900 shadow-xl">
        <div className="bg-white text-zinc-900">
          <div className="flex items-center gap-4 px-4 pt-5 pb-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-800 to-zinc-600 text-lg font-black text-white">
              {previa.iniciais}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{previa.handle}</p>
              <p className="truncate text-sm text-zinc-500">{previa.cliente.nome}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {previa.publicados} publicados · {previa.aCaminho.length} a caminho
              </p>
            </div>
          </div>

          {previa.grade.length === 0 ? (
            <div className="px-4 pb-6 text-zinc-500">
              <Vazio>Nenhum post ainda. A grade aparece aqui conforme a equipe for subindo.</Vazio>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 bg-zinc-200 p-0.5">
              {grade.map((item) => {
                if ("vazia" in item) return <div key={item.id} className="aspect-4/5 bg-white" />;
                const conteudo = (
                  <>
                    {item.url ? (
                      item.video ? (
                        <video src={item.url} muted playsInline className="h-full w-full object-cover" />
                      ) : (
                        <img src={item.url} alt="" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-zinc-100 text-[10px] text-zinc-400">
                        sem arte
                      </div>
                    )}
                    {!item.publicado && (
                      <>
                        <span className="pointer-events-none absolute inset-0 ring-2 ring-amber-400 ring-inset" />
                        <span className="absolute bottom-1 left-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 uppercase">
                          {formatarData(item.quando, previa.cliente.fuso).slice(0, 5)}
                        </span>
                      </>
                    )}
                    {item.carrossel && (
                      <span className="absolute top-1 right-1 rounded bg-black/55 px-1 text-[10px] text-white">
                        ❏
                      </span>
                    )}
                  </>
                );
                const classe = "relative aspect-4/5 overflow-hidden bg-zinc-300";
                const titulo = interno
                  ? `${ROTULO_STATUS[item.status as keyof typeof ROTULO_STATUS] ?? item.status} · ${formatarData(item.quando, previa.cliente.fuso)}`
                  : item.publicado
                    ? `Publicado em ${formatarData(item.quando, previa.cliente.fuso)}`
                    : `Previsto para ${formatarData(item.quando, previa.cliente.fuso)}`;
                return interno ? (
                  <Link key={item.id} href={`/posts/${item.id}`} className={classe} title={titulo}>
                    {conteudo}
                  </Link>
                ) : (
                  <div key={item.id} className={classe} title={titulo}>
                    {conteudo}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A fila do que ainda vai entrar, com legenda e data. */
export function FilaDoPerfil({ previa, interno }: { previa: PreviaDoPerfil; interno: boolean }) {
  if (previa.aCaminho.length === 0) {
    return (
      <Vazio>
        {interno ? "Nada agendado. O feed desse cliente vai parar." : "Nenhum post a caminho no momento."}
      </Vazio>
    );
  }
  return (
    <ul className="divide-y divide-linha-suave">
      {previa.aCaminho.map((item) => (
        <li key={item.id} className="flex gap-3 py-3">
          <div className="h-16 w-14 shrink-0 overflow-hidden rounded-md bg-superficie-3">
            {item.url && !item.video && <img src={item.url} alt="" className="h-full w-full object-cover" />}
            {item.url && item.video && <video src={item.url} muted playsInline className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm text-tinta ${interno ? "truncate" : "line-clamp-3"}`}>
              {item.legenda.split("\n")[0] || (interno ? "(sem legenda)" : "")}
            </p>
            <p className="mt-0.5 text-xs text-tinta-3">
              {interno
                ? `${formatarDataHora(item.quando, previa.cliente.fuso)} · ${ROTULO_STATUS[item.status as keyof typeof ROTULO_STATUS] ?? item.status}`
                : `Previsto para ${formatarData(item.quando, previa.cliente.fuso)}`}
              {interno && item.arte && (
                <span className="text-tinta-4">
                  {" "}
                  · arte subida{item.arte.por ? ` por ${item.arte.por}` : ""} em {formatarDataHora(item.arte.em)}
                </span>
              )}
              {interno && item.arte === null && <span className="text-amber-700"> · sem arte</span>}
            </p>
          </div>
          {interno && (
            <Link
              href={`/posts/${item.id}`}
              className="self-center text-xs font-medium text-tinta-2 underline-offset-2 hover:underline"
            >
              abrir
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
