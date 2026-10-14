import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { notificarEquipe } from "@/services/notificacoes.ts";

const log = logger("webhook.meta");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (modo === "subscribe" && token && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ erro: "Token de verificacao invalido." }, { status: 403 });
}

function assinaturaConfere(corpo: string, cabecalho: string | null): boolean {
  if (!env.META_APP_SECRET) return true;
  if (!cabecalho?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", env.META_APP_SECRET).update(corpo).digest("hex");
  const recebido = cabecalho.slice("sha256=".length);
  if (esperado.length !== recebido.length) return false;
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
}

/**
 * Avisa quando o cliente revoga o acesso ou tira uma permissao: a conexao
 * fica marcada e a equipe e notificada antes de a publicacao falhar.
 */
export async function POST(request: Request) {
  const corpo = await request.text();

  if (!assinaturaConfere(corpo, request.headers.get("x-hub-signature-256"))) {
    log.warn("assinatura do webhook invalida");
    return NextResponse.json({ erro: "Assinatura invalida." }, { status: 403 });
  }

  let payload: {
    object?: string;
    entry?: Array<{
      id?: string;
      uid?: string;
      changes?: Array<{ field?: string; value?: unknown }>;
    }>;
  };
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  log.info("webhook da Meta recebido", { object: payload.object, entradas: payload.entry?.length });

  const afetados: string[] = [];

  for (const entrada of payload.entry ?? []) {
    const idsPossiveis = [entrada.id, entrada.uid].filter(Boolean) as string[];
    const revogacao = (entrada.changes ?? []).some(
      (m) => m.field === "permissions" || m.field === "deauthorize",
    );
    if (!revogacao || idsPossiveis.length === 0) continue;

    const conexoes = await prisma.metaConnection.findMany({
      where: { assetId: { in: idsPossiveis } },
      include: { client: { select: { name: true } } },
    });

    for (const conexao of conexoes) {
      await prisma.metaConnection.update({
        where: { id: conexao.id },
        data: {
          status: "SEM_PERMISSAO",
          lastCheckedAt: new Date(),
          lastError: "A Meta avisou mudanca de permissao ou revogacao de acesso.",
        },
      });
      afetados.push(`${conexao.client.name} - ${conexao.assetType}`);
    }
  }

  if (afetados.length > 0) {
    await notificarEquipe({
      tipo: "CONEXAO_META_COM_PROBLEMA",
      titulo: "Acesso revogado na Meta",
      linhas: [...afetados, `Painel: ${env.APP_URL}/conexoes`],
    });
  }

  return NextResponse.json({ ok: true, afetados: afetados.length });
}
