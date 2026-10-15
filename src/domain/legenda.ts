/**
 * A legenda como ela deve aparecer na tela.
 *
 * Os posts de demonstracao antigos guardavam a referencia `[demo:ref]` no fim
 * da legenda. Hoje ela vive em `Post.demoRef`, fora do texto, e a carga da
 * demonstracao limpa as linhas antigas - mas enquanto houver banco que ainda
 * nao passou por essa limpeza, nenhuma tela pode mostrar a marca. Legenda e o
 * texto que o cliente le no link de aprovacao e, com o DRY-RUN desligado, o
 * que vai para o Instagram.
 */
const MARCA_DE_DEMONSTRACAO = /\n*\[demo:[^\]]+\]\s*$/;

export function legendaVisivel(caption: string): string {
  return caption.replace(MARCA_DE_DEMONSTRACAO, "").trim();
}

/** Primeira linha da legenda, para lista e resumo. */
export function resumoDaLegenda(caption: string): string {
  return legendaVisivel(caption).split("\n")[0].trim();
}
