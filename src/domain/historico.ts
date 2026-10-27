/**
 * Rotulos do historico de acoes (audit_log), em portugues, para a equipe
 * entender quem fez o que e quando sem ler nome tecnico de acao.
 */
export const ROTULO_ACAO: Record<string, string> = {
  // posts
  post_criado: "Criou o post",
  post_editado: "Editou o post",
  pedido_de_aprovacao_enviado: "Enviou para aprovacao do cliente",
  link_reenviado: "Reenviou o link ao cliente",
  cliente_aprovou: "Cliente aprovou",
  cliente_reprovou: "Cliente reprovou",
  aprovacao_registrada: "Decisao do cliente registrada",
  marcado_sem_resposta: "Virou POST SEM RESPOSTA",
  publicacao_iniciada: "Publicacao iniciada",
  post_publicado: "Post publicado",
  publicacao_falhou: "Publicacao falhou",
  publicacao_abortada: "Publicacao abortada na revalidacao",
  post_cancelado: "Cancelou o post",
  reagendado_apos_falha: "Reagendou apos falha",
  reagendado: "Reagendou o post",
  // clientes e area do cliente
  cliente_criado: "Cadastrou o cliente",
  cliente_atualizado: "Atualizou o cadastro do cliente",
  contato_adicionado: "Adicionou um contato aprovador",
  contato_removido: "Removeu um contato aprovador",
  materiais_adicionados: "Subiu material para a biblioteca",
  material_removido: "Removeu material da biblioteca",
  pauta_criada: "Criou uma pauta",
  pauta_movida: "Moveu uma pauta",
  pauta_removida: "Removeu uma pauta",
  pauta_virou_post: "Pauta virou post",
  notion_sincronizado: "Releu o planejamento no Notion",
  recarga_registrada: "Registrou recarga de saldo",
  limite_saldo_salvo: "Ajustou o limite de saldo",
  conexao_salva: "Salvou uma conexao da Meta",
  conexao_importada: "Importou uma conexao da Meta",
  // equipe e sistema
  login: "Entrou no sistema",
  usuario_criado: "Criou um usuario",
  funcao_alterada: "Mudou a funcao de um usuario",
  senha_trocada: "Trocou a propria senha",
  senha_redefinida: "Redefiniu a senha de um usuario",
  configuracoes_salvas: "Salvou as configuracoes",
  pix_recebedor_salvo: "Salvou os dados do PIX",
  primeiro_acesso: "Configuracao inicial",
  tarefas_sincronizadas: "Sincronizou as tarefas do Notion",
};

export function rotuloDaAcao(acao: string): string {
  return ROTULO_ACAO[acao] ?? acao.replace(/_/g, " ");
}

/** Acoes de rotina que poluem o feed geral (continuam no historico do post). */
export const ACOES_SILENCIOSAS: ReadonlySet<string> = new Set(["login"]);

export type QuemFez = {
  actorType: "USUARIO" | "CLIENTE" | "SISTEMA";
  actorName: string | null;
};

/** "Natalia", "cliente Joao" ou "sistema". */
export function nomeDeQuemFez(quem: QuemFez): string {
  if (quem.actorType === "CLIENTE") return `cliente ${quem.actorName ?? "sem nome"}`;
  if (quem.actorType === "SISTEMA") return quem.actorName ? `sistema (${quem.actorName})` : "sistema";
  return quem.actorName ?? "equipe";
}

/**
 * Uma linha de detalhe a partir do metadata, so para os casos em que ele diz
 * algo que a pessoa quer ler (quantos arquivos, o que mudou). O resto fica
 * no historico completo do post.
 */
export function detalheDoEvento(acao: string, metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  switch (acao) {
    case "materiais_adicionados":
      return typeof m.arquivos === "number" ? `${m.arquivos} arquivo(s)` : null;
    case "post_criado":
      return typeof m.arquivos === "number"
        ? m.arquivos === 0
          ? "sem criativo ainda"
          : `${m.arquivos} arquivo(s) de criativo`
        : null;
    case "post_editado": {
      const alterou = m.alterou as Record<string, boolean> | undefined;
      if (!alterou) return null;
      const partes = Object.entries(alterou)
        .filter(([, v]) => v)
        .map(([k]) => k);
      return partes.length ? `mudou ${partes.join(", ")}` : null;
    }
    case "pauta_criada":
    case "pauta_movida":
    case "pauta_removida":
    case "pauta_virou_post":
      return typeof m.titulo === "string" ? m.titulo : null;
    case "material_removido":
      return typeof m.arquivo === "string" ? m.arquivo : null;
    case "usuario_criado":
      return typeof m.email === "string" ? m.email : null;
    case "notion_sincronizado":
      return typeof m.itens === "number" ? `${m.itens} item(ns)` : null;
    default:
      return null;
  }
}
