"use client";

import { useActionState } from "react";
import { Aviso, Botao } from "@/components/ui.tsx";

type Estado = { erro?: string; sucesso?: string } | null;

/**
 * Formulario com estado de erro/sucesso, para usar dentro de paginas de
 * servidor sem transformar a pagina inteira em componente de cliente.
 */
export function FormAcao({
  acao,
  children,
  textoBotao,
  variante = "secundario",
  className,
}: {
  acao: (estado: Estado, dados: FormData) => Promise<Estado>;
  children: React.ReactNode;
  textoBotao: string;
  variante?: "primario" | "secundario" | "perigo";
  className?: string;
}) {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(acao, null);

  return (
    <form action={enviar} className={className}>
      {estado?.erro && (
        <div className="mb-3">
          <Aviso tom="erro">{estado.erro}</Aviso>
        </div>
      )}
      {estado?.sucesso && (
        <div className="mb-3">
          <Aviso tom="sucesso">{estado.sucesso}</Aviso>
        </div>
      )}
      {children}
      <div className="mt-3">
        <Botao type="submit" variante={variante} disabled={enviando}>
          {enviando ? "Salvando..." : textoBotao}
        </Botao>
      </div>
    </form>
  );
}
