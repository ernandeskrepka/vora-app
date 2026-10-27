/**
 * Funcoes da equipe da VORA.
 *
 * A funcao diz o que a pessoa faz; a permissao (ADMIN ou EDITOR) diz o que
 * ela pode mexer no sistema. Gestao e coordenacao administram; o resto edita.
 */
export const FUNCOES = [
  "GESTAO",
  "PLANEJAMENTO",
  "EDICAO_DESIGN",
  "DESIGN",
  "COORDENACAO",
  "OUTRA",
] as const;
export type Funcao = (typeof FUNCOES)[number];

export const ROTULO_FUNCAO: Record<Funcao, string> = {
  GESTAO: "Gestao",
  PLANEJAMENTO: "Planejamento e Estrategia",
  EDICAO_DESIGN: "Edicao e Design",
  DESIGN: "Designer",
  COORDENACAO: "Coordenacao",
  OUTRA: "Equipe",
};

/** Funcoes que administram o sistema (usuarios, configuracoes, conexoes). */
export const FUNCOES_ADMIN: readonly Funcao[] = ["GESTAO", "COORDENACAO"];

export function papelDaFuncao(funcao: Funcao): "ADMIN" | "EDITOR" {
  return FUNCOES_ADMIN.includes(funcao) ? "ADMIN" : "EDITOR";
}

export function normalizarFuncao(valor: string | null | undefined): Funcao {
  const limpo = String(valor ?? "").trim().toUpperCase();
  return (FUNCOES as readonly string[]).includes(limpo) ? (limpo as Funcao) : "OUTRA";
}

/** A equipe da VORA, como entra no primeiro cadastro. */
export const EQUIPE_VORA: ReadonlyArray<{ nome: string; email: string; funcao: Funcao }> = [
  { nome: "Ernande Skrepka", email: "ernandeskrepka@gmail.com", funcao: "GESTAO" },
  { nome: "Pamela Skrepka", email: "pamela@vorabr.com", funcao: "PLANEJAMENTO" },
  { nome: "Victor", email: "victor@vorabr.com", funcao: "EDICAO_DESIGN" },
  { nome: "Natalia", email: "natalia@vorabr.com", funcao: "DESIGN" },
  { nome: "Guilherme Henrik", email: "guilherme@vorabr.com", funcao: "COORDENACAO" },
];

/** Primeiro nome, para o historico e o menu: "Pamela", nao "Pamela Skrepka". */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/**
 * Senha inicial previsivel so para o primeiro acesso: a pessoa e obrigada a
 * trocar na primeira entrada (mustChangePassword).
 */
export function senhaInicial(nome: string, sufixo: string): string {
  const base = primeiroNome(nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return `vora-${base}-${sufixo}`;
}

export function senhaForte(senha: string): string | null {
  if (senha.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
    return "Misture letras e numeros na senha.";
  }
  return null;
}
