import { env } from "@/env";
import { logger } from "@/lib/logger.ts";
import { tokenDoPedido } from "@/lib/crypto.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { enviarLembreteDeAprovacao, notificarEquipe } from "./notificacoes.ts";
import { carregarPost, linkDeAprovacao } from "./posts.ts";
import { obterConfiguracoes } from "./configuracoes.ts";

const log = logger("lembretes");

/**
 * Lembrete antes do horario do post. Se o cliente ja respondeu (ou a
 * agencia editou), o lembrete simplesmente nao e enviado.
 *
 * O alerta para a equipe sai apenas no ultimo lembrete, para nao virar ruido.
 */
export async function enviarLembrete(input: {
  postId: string;
  horasAntes: number;
}): Promise<"enviado" | "ignorado"> {
  const post = await carregarPost(input.postId);

  if (post.status !== "AGUARDANDO_APROVACAO") {
    log.info("lembrete ignorado: post nao esta aguardando aprovacao", {
      postId: post.id,
      status: post.status,
    });
    return "ignorado";
  }

  const pendente = post.approvalRequests.find((r) => r.status === "PENDENTE");
  if (!pendente) {
    log.warn("lembrete ignorado: sem pedido de aprovacao ativo", { postId: post.id });
    return "ignorado";
  }

  const contatos = post.client.contacts.filter((c) => c.isApprover && c.active && c.receivesReminders);
  if (contatos.length === 0) {
    log.warn("lembrete ignorado: nenhum contato recebe lembrete", { postId: post.id });
    return "ignorado";
  }

  const link = linkDeAprovacao(tokenDoPedido(pendente.id));

  await enviarLembreteDeAprovacao({
    post,
    cliente: post.client,
    contatos,
    link,
    horasAntes: input.horasAntes,
  });

  const { lembretesHoras } = await obterConfiguracoes();
  const ultimoLembrete = input.horasAntes === Math.min(...lembretesHoras);
  if (ultimoLembrete) {
    await notificarEquipe({
      tipo: "APROVACAO_PENDENTE_SEM_RESPOSTA",
      titulo: "Aprovacao pendente perto do horario",
      linhas: [
        `Cliente: ${post.client.name}`,
        `Horario previsto: ${formatarDataHora(post.scheduledAt, post.client.timezone)}`,
        `Faltam ${input.horasAntes} h e o cliente ainda nao respondeu.`,
        `Painel: ${env.APP_URL}/posts/${post.id}`,
      ],
      postId: post.id,
      clientId: post.clientId,
    });
  }

  return "enviado";
}
