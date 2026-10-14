"use client";

import { useState } from "react";
import { Botao } from "@/components/ui.tsx";

/** Campo com o link pronto e um botao que copia - e abre, se preferirem conferir. */
export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Navegador sem permissao de area de transferencia: o campo fica
      // selecionavel do mesmo jeito.
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700"
      />
      <Botao type="button" variante="primario" onClick={copiar}>
        {copiado ? "Copiado!" : "Copiar link"}
      </Botao>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
      >
        Abrir
      </a>
    </div>
  );
}
