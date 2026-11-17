"use client";

import { useActionState } from "react";
import { acaoLogin, type EstadoLogin } from "@/app/actions/auth.ts";
import { Aviso, Botao, Campo, classeInput } from "@/components/ui.tsx";

const PONTOS = [
  ["Aprovacao", "O cliente aprova pelo WhatsApp, sem login."],
  ["Publicacao", "So sai o que foi aprovado. Silencio nunca publica."],
  ["Historico", "Cada acao fica com nome, data e hora."],
] as const;

/**
 * Login em duas colunas: a marca de um lado (sempre escura, como o site), o
 * formulario do outro. No celular fica so o formulario.
 */
export function FormularioLogin() {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(acaoLogin, null);

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0f1113] p-12 text-[#eeece7] lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 55% at 100% 0%, rgba(2,216,157,.22), transparent 60%), radial-gradient(60% 50% at 0% 100%, rgba(0,81,60,.35), transparent 60%)",
          }}
        />
        <img src="/marca/vora-logo.svg" alt="VORA" className="relative h-6 w-auto self-start" />

        <div className="relative max-w-md">
          <p className="mb-4 font-mono text-[11px] tracking-[0.2em] text-[#02d89d] uppercase">
            Aprovacao e publicacao
          </p>
          <h1 className="titulo text-[2.75rem] leading-[1.02]">
            Do planejamento ao post no ar, sem perder o fio.
          </h1>
          <ul className="mt-10 space-y-4">
            {PONTOS.map(([titulo, texto]) => (
              <li key={titulo} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#02d89d]" />
                <span className="text-[#a9aeb1]">
                  <strong className="font-semibold text-[#eeece7]">{titulo}.</strong> {texto}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-[11px] tracking-[0.14em] text-[#666b6f] uppercase">
          vorabr.com · uso interno
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <span className="logo-vora mb-10 h-5 lg:hidden" />
          <h2 className="titulo text-2xl text-tinta">Entrar</h2>
          <p className="mt-1.5 text-sm text-tinta-3">
            Cada pessoa da equipe usa o proprio login.
          </p>

          <form action={acao} className="mt-8 space-y-4">
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

            <Botao type="submit" disabled={enviando} className="h-10 w-full">
              {enviando ? "Entrando..." : "Entrar"}
            </Botao>

            <p className="pt-2 text-center text-xs text-tinta-4">
              Nao ha cadastro aberto. Esqueceu a senha? Peca a um administrador para redefinir.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
