import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";

const log = logger("webhook.whatsapp");

/** Verificacao do webhook (a Meta chama uma vez, com hub.challenge). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (modo === "subscribe" && token && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ erro: "Token de verificacao invalido." }, { status: 403 });
}

function assinaturaConfere(corpo: string, cabecalho: string | null): boolean {
  if (!env.META_APP_SECRET) return true; // sem segredo configurado, nao bloqueia o dev
  if (!cabecalho?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", env.META_APP_SECRET).update(corpo).digest("hex");
  const recebido = cabecalho.slice("sha256=".length);
  if (esperado.length !== recebido.length) return false;
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
}

type StatusWhatsapp = {
  id?: string;
  status?: "sent" | "delivered" | "read" | "failed";
  errors?: Array<{ title?: string; message?: string }>;
};

const MAPA_STATUS = {
  sent: "ENVIADO",
  delivered: "ENTREGUE",
  read: "LIDO",
  failed: "FALHOU",
} as const;

/** Recebe os status de entrega e leitura das mensagens enviadas. */
export async function POST(request: Request) {
  const corpo = await request.text();

  if (!assinaturaConfere(corpo, request.headers.get("x-hub-signature-256"))) {
    log.warn("assinatura do webhook invalida");
    return NextResponse.json({ erro: "Assinatura invalida." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const entradas =
    (payload as { entry?: Array<{ changes?: Array<{ value?: { statuses?: StatusWhatsapp[] } }> }> })
      .entry ?? [];

  let atualizados = 0;
  for (const entrada of entradas) {
    for (const mudanca of entrada.changes ?? []) {
      for (const status of mudanca.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const novo = MAPA_STATUS[status.status];
        const r = await prisma.notification.updateMany({
          where: { providerMessageId: status.id },
          data: {
            status: novo,
            errorMessage: status.errors?.[0]?.message ?? null,
          },
        });
        atualizados += r.count;
      }
    }
  }

  log.info("status de WhatsApp processados", { atualizados });
  return NextResponse.json({ ok: true, atualizados });
}
