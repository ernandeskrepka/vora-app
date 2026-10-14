"use client";

import { useState } from "react";
import Link from "next/link";
import { acaoRemoverMaterial } from "@/app/actions/cliente-area.ts";

export type MaterialCliente = {
  id: string;
  kind: "IMAGEM" | "VIDEO" | "DOCUMENTO";
  url: string | null;
  nome: string;
  tamanho: string;
  quando: string;
  rotulo: string | null;
};

/**
 * Biblioteca do cliente. A selecao serve para montar um post direto com os
 * arquivos escolhidos, sem subir de novo.
 */
export function BibliotecaMateriais({
  clienteId,
  itens,
}: {
  clienteId: string;
  itens: MaterialCliente[];
}) {
  const [selecao, setSelecao] = useState<string[]>([]);

  const alternar = (id: string) =>
    setSelecao((atual) => (atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id]));

  const criativos = itens.filter((i) => i.kind !== "DOCUMENTO");
  const documentos = itens.filter((i) => i.kind === "DOCUMENTO");

  return (
    <div className="space-y-5">
      {selecao.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vora-preto bg-vora-preto px-4 py-3 text-white shadow-lg">
          <p className="text-sm">
            {selecao.length} arquivo(s) selecionado(s)
            <span className="ml-2 text-xs text-zinc-400">
              a ordem da selecao e a ordem do carrossel
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelecao([])}
              className="text-xs text-zinc-300 underline"
            >
              limpar
            </button>
            <Link
              href={`/posts/novo?cliente=${clienteId}&materiais=${selecao.join(",")}`}
              className="rounded-lg bg-vora-verde px-3 py-1.5 text-sm font-semibold text-black"
            >
              Criar post com estes
            </Link>
          </div>
        </div>
      )}

      {criativos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {criativos.map((item) => {
            const posicao = selecao.indexOf(item.id);
            const escolhido = posicao > -1;
            return (
              <figure key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => alternar(item.id)}
                  className={`block w-full overflow-hidden rounded-xl border-2 transition ${
                    escolhido ? "border-vora-verde" : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  {item.kind === "VIDEO" ? (
                    <video src={item.url ?? undefined} className="aspect-square w-full object-cover" />
                  ) : (
                    <img src={item.url ?? ""} alt="" className="aspect-square w-full object-cover" />
                  )}
                </button>

                {escolhido && (
                  <span className="absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full bg-vora-verde text-xs font-bold text-black">
                    {posicao + 1}
                  </span>
                )}
                {item.kind === "VIDEO" && (
                  <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 text-[10px] text-white">
                    video
                  </span>
                )}

                <figcaption className="mt-1.5 flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-600" title={item.nome}>
                    {item.rotulo ?? item.nome}
                  </span>
                  <form action={acaoRemoverMaterial}>
                    <input type="hidden" name="assetId" value={item.id} />
                    <input type="hidden" name="clienteId" value={clienteId} />
                    <button
                      type="submit"
                      className="text-[11px] text-rose-600 opacity-0 transition group-hover:opacity-100"
                    >
                      remover
                    </button>
                  </form>
                </figcaption>
                <p className="text-[11px] text-zinc-400">
                  {item.tamanho} · {item.quando}
                </p>
              </figure>
            );
          })}
        </div>
      )}

      {documentos.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Documentos</h3>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {documentos.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-800">{item.rotulo ?? item.nome}</p>
                  <p className="text-xs text-zinc-500">
                    {item.tamanho} · {item.quando}
                  </p>
                </div>
                <form action={acaoRemoverMaterial}>
                  <input type="hidden" name="assetId" value={item.id} />
                  <input type="hidden" name="clienteId" value={clienteId} />
                  <button type="submit" className="text-xs text-rose-600 hover:underline">
                    remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
