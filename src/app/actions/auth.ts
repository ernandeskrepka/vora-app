"use server";

import { redirect } from "next/navigation";
import { autenticar, contextoDaRequisicao, encerrarSessao } from "@/lib/auth.ts";

export type EstadoLogin = { erro?: string } | null;

export async function acaoLogin(_estado: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const email = String(dados.get("email") ?? "");
  const senha = String(dados.get("senha") ?? "");

  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const contexto = await contextoDaRequisicao();
  const r = await autenticar({ email, senha, ...contexto });
  if (!r.ok) return { erro: r.motivo };

  redirect("/");
}

export async function acaoLogout() {
  await encerrarSessao();
  redirect("/login");
}
