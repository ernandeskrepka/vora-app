import { env } from "@/env";

/**
 * Templates do WhatsApp Cloud API.
 *
 * A Meta exige template aprovado para iniciar conversa com o cliente.
 * A ordem dos parametros aqui tem que ser exatamente a mesma do template
 * submetido no painel da Meta. O texto para submissao esta em
 * docs/whatsapp-templates.md.
 */

export type TipoTemplate = "APROVACAO_PENDENTE" | "LEMBRETE" | "POST_PUBLICADO";

export type DefinicaoTemplate = {
  tipo: TipoTemplate;
  nome: string;
  /** Nomes dos parametros, em ordem, so para leitura humana. */
  parametros: string[];
  /** Texto equivalente, usado no modo "log" e no fallback por e-mail. */
  previa: (p: string[]) => string;
};

export const TEMPLATES: Record<TipoTemplate, DefinicaoTemplate> = {
  APROVACAO_PENDENTE: {
    tipo: "APROVACAO_PENDENTE",
    nome: env.WHATSAPP_TEMPLATE_APPROVAL,
    parametros: ["nome_do_contato", "nome_do_cliente", "data_hora_prevista", "link"],
    previa: ([contato, cliente, dataHora, link]) =>
      `Ola ${contato}! Tem um post novo da ${cliente} esperando sua aprovacao, ` +
      `previsto para ${dataHora}. Veja e aprove aqui: ${link}`,
  },
  LEMBRETE: {
    tipo: "LEMBRETE",
    nome: env.WHATSAPP_TEMPLATE_REMINDER,
    parametros: ["nome_do_contato", "tempo_restante", "data_hora_prevista", "link"],
    previa: ([contato, tempo, dataHora, link]) =>
      `Ola ${contato}, lembrete: o post previsto para ${dataHora} ainda esta sem aprovacao ` +
      `(faltam ${tempo}). Sem a sua resposta ele nao sera publicado. Link: ${link}`,
  },
  POST_PUBLICADO: {
    tipo: "POST_PUBLICADO",
    nome: env.WHATSAPP_TEMPLATE_PUBLISHED,
    parametros: ["nome_do_contato", "redes", "link_do_post"],
    previa: ([contato, redes, link]) =>
      `Pronto, ${contato}! O post foi publicado em ${redes}. Veja: ${link}`,
  },
};
