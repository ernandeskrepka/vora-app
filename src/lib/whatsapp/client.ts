import { env } from "@/env";
import { logger } from "@/lib/logger.ts";
import { TEMPLATES, type TipoTemplate } from "./templates.ts";

const log = logger("whatsapp");

export type ResultadoEnvio = {
  ok: boolean;
  providerMessageId: string | null;
  simulado: boolean;
  previa: string;
  erro?: string;
};

/** Normaliza para o formato que a Cloud API espera (E.164 sem o "+"). */
export function normalizarTelefone(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length <= 11) return `55${digitos}`; // numero brasileiro sem DDI
  return digitos;
}

/**
 * Envia uma mensagem de template.
 *
 * WHATSAPP_MODE=log (padrao no desenvolvimento e na fase 2 do plano):
 * nada sai, a mensagem e registrada no log e no banco com a previa do texto.
 */
export async function enviarTemplate(input: {
  para: string;
  tipo: TipoTemplate;
  parametros: string[];
}): Promise<ResultadoEnvio> {
  const definicao = TEMPLATES[input.tipo];
  const previa = definicao.previa(input.parametros);
  const para = normalizarTelefone(input.para);

  if (env.WHATSAPP_MODE === "log") {
    log.warn("WhatsApp em modo log: mensagem NAO enviada", {
      para,
      template: definicao.nome,
      previa,
    });
    return { ok: true, providerMessageId: null, simulado: true, previa };
  }

  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    return {
      ok: false,
      providerMessageId: null,
      simulado: false,
      previa,
      erro: "WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN sao obrigatorios com WHATSAPP_MODE=cloud_api.",
    };
  }

  const corpo = {
    messaging_product: "whatsapp",
    to: para,
    type: "template",
    template: {
      name: definicao.nome,
      language: { code: env.WHATSAPP_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: input.parametros.map((texto) => ({ type: "text", text: texto })),
        },
      ],
    },
  };

  try {
    const resposta = await fetch(
      `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
      },
    );
    const json = (await resposta.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };

    if (!resposta.ok) {
      const erro = json.error?.message ?? `HTTP ${resposta.status}`;
      log.error("falha ao enviar WhatsApp", { para, template: definicao.nome, erro });
      return { ok: false, providerMessageId: null, simulado: false, previa, erro };
    }

    const id = json.messages?.[0]?.id ?? null;
    log.info("WhatsApp enviado", { para, template: definicao.nome, providerMessageId: id });
    return { ok: true, providerMessageId: id, simulado: false, previa };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    log.error("erro de rede ao enviar WhatsApp", { para, erro: mensagem });
    return { ok: false, providerMessageId: null, simulado: false, previa, erro: mensagem };
  }
}

/** Mensagem de texto livre, usada so para avisos internos da equipe. */
export async function enviarTextoInterno(para: string, texto: string): Promise<ResultadoEnvio> {
  if (env.WHATSAPP_MODE === "log") {
    log.warn("aviso interno em modo log", { para, texto });
    return { ok: true, providerMessageId: null, simulado: true, previa: texto };
  }
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    return { ok: false, providerMessageId: null, simulado: false, previa: texto, erro: "WhatsApp nao configurado." };
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizarTelefone(para),
        type: "text",
        text: { body: texto },
      }),
    },
  );
  const json = (await resposta.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  return {
    ok: resposta.ok,
    providerMessageId: json.messages?.[0]?.id ?? null,
    simulado: false,
    previa: texto,
    erro: resposta.ok ? undefined : (json.error?.message ?? `HTTP ${resposta.status}`),
  };
}
