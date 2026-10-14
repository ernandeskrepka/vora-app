import { NextResponse } from "next/server";
import { env } from "@/env";
import { logger } from "@/lib/logger.ts";
import { processarPendencias } from "@/services/agenda.ts";

const log = logger("api.agenda");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Motor de tempo para hospedagem sem worker: um cron externo chama esta rota
 * de minuto em minuto. Protegida por AGENDA_TOKEN.
 */
async function executar(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-agenda-token");

  if (!env.AGENDA_TOKEN) {
    return NextResponse.json(
      { erro: "AGENDA_TOKEN nao configurado: a rota esta desligada." },
      { status: 503 },
    );
  }
  if (token !== env.AGENDA_TOKEN) {
    return NextResponse.json({ erro: "Token invalido." }, { status: 403 });
  }

  try {
    const resultado = await processarPendencias();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    log.error("falha na agenda", { erro: erro instanceof Error ? erro.message : String(erro) });
    return NextResponse.json({ erro: "Falha ao processar a agenda." }, { status: 500 });
  }
}

export const GET = executar;
export const POST = executar;
