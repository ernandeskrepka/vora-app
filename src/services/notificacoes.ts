import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { enviarTemplate, enviarTextoInterno } from "@/lib/whatsapp/client.ts";
import { TEMPLATES, type TipoTemplate } from "@/lib/whatsapp/templates.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { obterConfiguracoes } from "./configuracoes.ts";
import type { ClientContact, Cliente, Post } from "@/lib/tipos.ts";

const log = logger("notificacoes");

/* ------------------------------------------------------- para o cliente */

async function enviarParaContato(input: {
  tipo: TipoTemplate;
  contato: ClientContact;
  parametros: string[];
  postId?: string;
  clientId?: string;
}) {
  const resultado = await enviarTemplate({
    para: input.contato.phoneE164,
    tipo: input.tipo,
    parametros: input.parametros,
  });

  await prisma.notification.create({
    data: {
      channel: env.WHATSAPP_MODE === "log" ? "LOG" : "WHATSAPP",
      destination: input.contato.phoneE164,
      type: input.tipo,
      status: resultado.ok ? "ENVIADO" : "FALHOU",
      payload: {
        template: TEMPLATES[input.tipo].nome,
        parametros: input.parametros,
        previa: resultado.previa,
        simulado: resultado.simulado,
      },
      providerMessageId: resultado.providerMessageId,
      errorMessage: resultado.erro ?? null,
      postId: input.postId ?? null,
      clientId: input.clientId ?? null,
      contactId: input.contato.id,
      sentAt: resultado.ok ? new Date() : null,
    },
  });

  return resultado;
}

export async function enviarPedidoDeAprovacao(input: {
  post: Pick<Post, "id" | "scheduledAt">;
  cliente: Pick<Cliente, "id" | "name" | "timezone">;
  contatos: ClientContact[];
  link: string;
}) {
  const quando = formatarDataHora(input.post.scheduledAt, input.cliente.timezone);
  const resultados = [];
  for (const contato of input.contatos) {
    resultados.push(
      await enviarParaContato({
        tipo: "APROVACAO_PENDENTE",
        contato,
        parametros: [primeiroNome(contato.name), input.cliente.name, quando, input.link],
        postId: input.post.id,
        clientId: input.cliente.id,
      }),
    );
  }
  log.info("pedido de aprovacao enviado", {
    postId: input.post.id,
    contatos: input.contatos.length,
    falhas: resultados.filter((r) => !r.ok).length,
  });
  return resultados;
}

export async function enviarLembreteDeAprovacao(input: {
  post: Pick<Post, "id" | "scheduledAt">;
  cliente: Pick<Cliente, "id" | "name" | "timezone">;
  contatos: ClientContact[];
  link: string;
  horasAntes: number;
}) {
  const quando = formatarDataHora(input.post.scheduledAt, input.cliente.timezone);
  const tempo = input.horasAntes >= 24 ? `${Math.round(input.horasAntes / 24)} dia(s)` : `${input.horasAntes} h`;
  for (const contato of input.contatos.filter((c) => c.receivesReminders)) {
    await enviarParaContato({
      tipo: "LEMBRETE",
      contato,
      parametros: [primeiroNome(contato.name), tempo, quando, input.link],
      postId: input.post.id,
      clientId: input.cliente.id,
    });
  }
}

export async function avisarClientePostPublicado(input: {
  post: Pick<Post, "id">;
  cliente: Pick<Cliente, "id" | "name">;
  contatos: ClientContact[];
  redes: string;
  link: string;
}) {
  for (const contato of input.contatos) {
    await enviarParaContato({
      tipo: "POST_PUBLICADO",
      contato,
      parametros: [primeiroNome(contato.name), input.redes, input.link],
      postId: input.post.id,
      clientId: input.cliente.id,
    });
  }
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/* -------------------------------------------------------- para a equipe */

export type TipoAvisoInterno =
  | "POST_REPROVADO"
  | "POST_SEM_RESPOSTA"
  | "FALHA_DE_PUBLICACAO"
  | "CONEXAO_META_COM_PROBLEMA"
  | "APROVACAO_PENDENTE_SEM_RESPOSTA";

/**
 * Aviso para a equipe da VORA. Canal configuravel: log (padrao),
 * WhatsApp interno ou Slack.
 */
export async function notificarEquipe(input: {
  tipo: TipoAvisoInterno;
  titulo: string;
  linhas: string[];
  postId?: string;
  clientId?: string;
}) {
  const texto = [`*${input.titulo}*`, ...input.linhas].join("\n");
  const canal = (await obterConfiguracoes()).canalInterno;
  let ok = true;
  let erro: string | undefined;
  let destino = "log";

  try {
    if (canal === "slack" && env.SLACK_WEBHOOK_URL) {
      destino = "slack";
      const r = await fetch(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto }),
      });
      ok = r.ok;
      if (!r.ok) erro = `Slack respondeu HTTP ${r.status}`;
    } else if (canal === "whatsapp" && env.INTERNAL_NOTIFY_WHATSAPP_TO) {
      destino = env.INTERNAL_NOTIFY_WHATSAPP_TO;
      const r = await enviarTextoInterno(destino, texto.replace(/\*/g, ""));
      ok = r.ok;
      erro = r.erro;
    } else {
      log.warn(`aviso interno (${input.tipo})`, { titulo: input.titulo, linhas: input.linhas });
    }
  } catch (e) {
    ok = false;
    erro = e instanceof Error ? e.message : String(e);
  }

  await prisma.notification.create({
    data: {
      channel: canal === "slack" ? "SLACK" : canal === "whatsapp" ? "WHATSAPP" : "LOG",
      destination: destino,
      type: `INTERNO_${input.tipo}`,
      status: ok ? "ENVIADO" : "FALHOU",
      payload: { titulo: input.titulo, linhas: input.linhas },
      errorMessage: erro ?? null,
      postId: input.postId ?? null,
      clientId: input.clientId ?? null,
      sentAt: ok ? new Date() : null,
    },
  });
}
