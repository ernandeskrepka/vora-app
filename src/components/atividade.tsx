import Link from "next/link";
import { formatarDataHora } from "@/lib/datetime.ts";
import { Avatar, Vazio } from "@/components/ui.tsx";
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
        <li key={e.id} className="flex items-start gap-3 py-2 sm:items-center">
          {e.tipoDeQuem === "SISTEMA" ? (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-superficie-3 text-[10px] font-semibold text-tinta-4">
              SIS
            </span>
          ) : (
            <Avatar nome={e.quem.replace(/^cliente /, "")} tamanho={28} />
          )}
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-tinta-3">
            <span
              className={
                e.tipoDeQuem === "USUARIO"
                  ? "font-semibold text-tinta"
                  : e.tipoDeQuem === "CLIENTE"
                    ? "font-semibold text-destaque"
                    : "text-tinta-3"
              }
            >
              {e.quem}
            </span>{" "}
            {e.rotulo.charAt(0).toLowerCase() + e.rotulo.slice(1)}
            {mostrarCliente && e.cliente && (
              <>
                {" · "}
                <Link
                  href={`/clientes/${e.cliente.id}`}
                  className="font-medium text-tinta-2 underline-offset-2 hover:underline"
                >
                  {e.cliente.nome}
                </Link>
              </>
            )}
            {e.detalhe && <span className="text-tinta-4"> · {e.detalhe}</span>}
            {/* No celular a data desce para a linha de baixo. */}
            <span className="num block text-xs text-tinta-4 sm:hidden">
              {formatarDataHora(e.quando)}
            </span>
          </p>
          <p className="num hidden shrink-0 text-right text-xs text-tinta-4 sm:block">
            {formatarDataHora(e.quando)}
            {e.postId && (
              <>
                {" · "}
                <Link href={`/posts/${e.postId}`} className="font-medium text-tinta-3 hover:text-tinta">
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
