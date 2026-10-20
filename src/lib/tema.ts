/**
 * Temas visuais do painel.
 *
 * "padrao" e o layout claro original. "vora" segue a identidade do site
 * vorabr.com: grafite escuro, verde tungstenio, Bricolage Grotesque nos
 * titulos e JetBrains Mono nos detalhes. A escolha fica num cookie, por
 * navegador, entao o cliente que abre o link de aprovacao ou o relatorio
 * continua vendo o padrao claro.
 */
export const TEMAS = ["padrao", "vora"] as const;
export type Tema = (typeof TEMAS)[number];

export const TEMA_PADRAO: Tema = "padrao";
export const COOKIE_TEMA = "tema";

export const ROTULO_TEMA: Record<Tema, string> = {
  padrao: "Padrao",
  vora: "VORA",
};

/** Le o valor do cookie (ou qualquer string) e devolve um tema valido. */
export function normalizarTema(valor: string | undefined | null): Tema {
  if (!valor) return TEMA_PADRAO;
  const limpo = valor.trim().toLowerCase();
  return (TEMAS as readonly string[]).includes(limpo)
    ? (limpo as Tema)
    : TEMA_PADRAO;
}

/** O tema VORA carrega fontes do Google; o padrao usa a Creato local. */
export function temaUsaFontesDoGoogle(tema: Tema): boolean {
  return tema === "vora";
}
