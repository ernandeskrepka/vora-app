import Link from "next/link";
import { formatarDataHora } from "@/lib/datetime.ts";
import { Vazio } from "@/components/ui.tsx";
import type { EventoDoHistorico } from "@/services/historico.ts";

/**
 * Lista de atividade: quem fez, o que, quando. Interna - nunca entra numa
 * pagina que o cliente abre.
 */
export function ListaDeAtividade({
  eventos,
  mostrarCliente = true,
}: {
  eventos: EventoDoHistorico[];
  mostrarCliente?: boolean;
}) {
  if (eventos.length === 0) return <Vazio>Nenhuma acao registrada ainda.</Vazio>;

  return (
    <ol className="divide-y divide-linha-suave">
      {eventos.map((e) => (
        <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5 py-2">
          <div className="min-w-0">
            <p className="text-sm text-tinta">
              <span
                className={
                  e.tipoDeQuem === "USUARIO"
                    ? "font-semibold"
                    : e.tipoDeQuem === "CLIENTE"
                      ? "font-semibold text-emerald-700"
                      : "text-tinta-3"
                }
              >
                {e.quem}
              </span>{" "}
              <span className="text-tinta-2">{e.rotulo.charAt(0).toLowerCase() + e.rotulo.slice(1)}</span>
              {mostrarCliente && e.cliente && (
                <>
                  {" "}
                  <Link href={`/clientes/${e.cliente.id}`} className="text-tinta underline-offset-2 hover:underline">
                    {e.cliente.nome}
                  </Link>
                </>
              )}
              {e.detalhe && <span className="text-tinta-3"> · {e.detalhe}</span>}
            </p>
          </div>
          <p className="shrink-0 text-xs text-tinta-4">
            {formatarDataHora(e.quando)}
            {e.postId && (
              <>
                {" · "}
                <Link href={`/posts/${e.postId}`} className="underline">
                  post
                </Link>
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
