/**
 * Temas visuais do painel.
 *
 * "padrao" e o claro. "vora" e o escuro, com a identidade do site
 * vorabr.com: grafite em camadas e verde tungstenio. Os dois usam as mesmas
 * fontes (Creato nos titulos, Inter na interface). A escolha fica num cookie, por
 * navegador, entao o cliente que abre o link de aprovacao ou o relatorio
 * continua vendo o padrao claro.
 */
export const TEMAS = ["padrao", "vora"] as const;
export type Tema = (typeof TEMAS)[number];

export const TEMA_PADRAO: Tema = "padrao";
export const COOKIE_TEMA = "tema";

export const ROTULO_TEMA: Record<Tema, string> = {
  padrao: "Claro",
  vora: "Escuro",
};

/** Le o valor do cookie (ou qualquer string) e devolve um tema valido. */
export function normalizarTema(valor: string | undefined | null): Tema {
  if (!valor) return TEMA_PADRAO;
  const limpo = valor.trim().toLowerCase();
  return (TEMAS as readonly string[]).includes(limpo)
    ? (limpo as Tema)
    : TEMA_PADRAO;
}
