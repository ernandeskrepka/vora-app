import { NextResponse } from "next/server";
import { env } from "@/env";
import { semearPrimeiroAcesso } from "@/services/primeiro-acesso.ts";

export const dynamic = "force-dynamic";

/**
 * Configuracao inicial de uma instalacao nova. Protegida pelo AGENDA_TOKEN e
 * recusada assim que existir um usuario.
 *
 *   curl -X POST "https://SEU_SITE/api/primeiro-acesso?token=..." \
 *     -H "content-type: application/json" \
 *     -d '{"email":"voce@vorabr.com","senha":"uma-senha-boa"}'
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-agenda-token");

  if (!env.AGENDA_TOKEN) {
    return NextResponse.json({ erro: "AGENDA_TOKEN nao configurado." }, { status: 503 });
  }
  if (token !== env.AGENDA_TOKEN) {
    return NextResponse.json({ erro: "Token invalido." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => ({}))) as {
    email?: string;
    senha?: string;
    nome?: string;
  };

  const r = await semearPrimeiroAcesso({
    email: corpo.email ?? "",
    senha: corpo.senha ?? "",
    nome: corpo.nome,
  });

  return NextResponse.json(r, { status: r.criado ? 201 : 409 });
}
