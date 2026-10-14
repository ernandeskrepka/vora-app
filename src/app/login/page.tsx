"use client";

import { useActionState } from "react";
import { acaoLogin, type EstadoLogin } from "@/app/actions/auth.ts";
import { Aviso, Botao, Campo, classeInput } from "@/components/ui.tsx";

export default function PaginaLogin() {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(acaoLogin, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-vora-preto px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/marca/vora-logo.svg" alt="VORA" className="h-8 w-auto" />
          <p className="mt-3 text-sm text-zinc-400">Aprovacao e publicacao de criativos</p>
        </div>

        <form action={acao} className="space-y-4 rounded-xl bg-white p-6 shadow-xl">
          {estado?.erro && <Aviso tom="erro">{estado.erro}</Aviso>}

          <Campo rotulo="E-mail">
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className={classeInput}
              placeholder="voce@vorabr.com"
            />
          </Campo>

          <Campo rotulo="Senha">
            <input
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              className={classeInput}
            />
          </Campo>

          <Botao type="submit" disabled={enviando} className="w-full">
            {enviando ? "Entrando..." : "Entrar"}
          </Botao>

          <p className="text-center text-xs text-zinc-500">
            Uso interno da equipe. Nao ha cadastro aberto.
          </p>
        </form>
      </div>
    </main>
  );
}
