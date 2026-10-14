"use client";

import { Botao } from "@/components/ui.tsx";

export function BotaoImprimir() {
  return (
    <Botao variante="primario" onClick={() => window.print()}>
      Imprimir / PDF
    </Botao>
  );
}
