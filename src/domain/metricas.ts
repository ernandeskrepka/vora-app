/**
 * O que cada numero do relatorio quer dizer, em portugues de cliente.
 *
 * Fica no dominio porque a explicacao e a mesma no painel, no relatorio do
 * cliente e no PDF - e porque e ela que evita a pergunta "o que e CPC?" em
 * toda reuniao.
 */
export type Metrica = {
  chave: string;
  /** Nome curto que aparece no cartao. */
  rotulo: string;
  /** Sigla, quando existe, para o cliente reconhecer no Gerenciador. */
  sigla?: string;
  /** Uma frase. Sem jargao. */
  explicacao: string;
  /** Para onde e bom o numero ir. */
  sentido: "maior" | "menor" | "neutro";
};

export const METRICAS: Record<string, Metrica> = {
  investimento: {
    chave: "investimento",
    rotulo: "Investimento",
    explicacao: "Quanto foi gasto em anuncios no periodo.",
    sentido: "neutro",
  },
  alcance: {
    chave: "alcance",
    rotulo: "Alcance",
    explicacao:
      "Quantas pessoas diferentes viram o anuncio. Uma pessoa que viu dez vezes conta uma vez so.",
    sentido: "maior",
  },
  impressoes: {
    chave: "impressoes",
    rotulo: "Impressoes",
    explicacao:
      "Quantas vezes o anuncio apareceu na tela. Sempre maior que o alcance, porque a mesma pessoa ve mais de uma vez.",
    sentido: "maior",
  },
  cliques: {
    chave: "cliques",
    rotulo: "Cliques",
    explicacao: "Quantas vezes alguem clicou no anuncio.",
    sentido: "maior",
  },
  ctr: {
    chave: "ctr",
    rotulo: "Taxa de cliques",
    sigla: "CTR",
    explicacao:
      "De cada 100 vezes que o anuncio apareceu, quantas viraram clique. Mede se a arte e a mensagem chamam atencao.",
    sentido: "maior",
  },
  cpc: {
    chave: "cpc",
    rotulo: "Custo por clique",
    sigla: "CPC",
    explicacao: "Quanto custou, em media, cada clique no anuncio.",
    sentido: "menor",
  },
  cpm: {
    chave: "cpm",
    rotulo: "Custo por mil aparicoes",
    sigla: "CPM",
    explicacao:
      "Quanto custa aparecer mil vezes. Serve para comparar o preco do leilao entre periodos e entre campanhas.",
    sentido: "menor",
  },
  resultados: {
    chave: "resultados",
    rotulo: "Resultados",
    explicacao:
      "Quantas vezes aconteceu o que a campanha pedia: conversa iniciada no WhatsApp, mensagem, cadastro ou compra, conforme o objetivo.",
    sentido: "maior",
  },
  custoPorResultado: {
    chave: "custoPorResultado",
    rotulo: "Custo por resultado",
    sigla: "CPR",
    explicacao:
      "Quanto custou, em media, cada resultado. E o numero que mais importa: diz quanto se paga por cada pessoa que chega.",
    sentido: "menor",
  },
  frequencia: {
    chave: "frequencia",
    rotulo: "Frequencia",
    explicacao:
      "Quantas vezes, em media, a mesma pessoa viu o anuncio. Muito alta cansa o publico e costuma encarecer o resultado.",
    sentido: "neutro",
  },
};

/** Ordem em que os numeros fazem sentido para quem le de cima para baixo. */
export const ORDEM_RELATORIO = [
  "investimento",
  "resultados",
  "custoPorResultado",
  "alcance",
  "impressoes",
  "cliques",
  "ctr",
  "cpc",
  "cpm",
] as const;

/**
 * Como ler uma variacao percentual: para custo, cair e bom; para resultado,
 * subir e bom. Devolve o tom para a tela, sem inventar julgamento quando a
 * metrica nao tem lado melhor.
 */
export function tomDaVariacao(
  chave: string,
  variacao: number | null,
): "bom" | "ruim" | "neutro" {
  if (variacao === null || Math.abs(variacao) < 1) return "neutro";
  const sentido = METRICAS[chave]?.sentido ?? "neutro";
  if (sentido === "neutro") return "neutro";
  const subiu = variacao > 0;
  return (sentido === "maior") === subiu ? "bom" : "ruim";
}
