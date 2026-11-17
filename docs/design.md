# Desenho do painel

Como o painel e desenhado e por que. Vale para os dois temas (claro e escuro).

## De onde vem

- Redesenho do Linear (2024 e a revisao "calmer interface"): o menu recua
  para o conteudo aparecer, menos bordas, hierarquia pelo brilho do texto e
  nao pelo tamanho, tema mais neutro com pouca cor da marca.
- Guias de dashboard operacional: a pessoa precisa decidir em cinco
  segundos, entao o topo traz numeros de decisao (o que muda o que ela faz
  agora), nao totais de vaidade; no maximo seis blocos por grupo; cor
  saturada so para alerta; estado vazio que diz o proximo passo.
- Dark mode desenhado, nao invertido: escala de superficies em vez de um
  preto so, texto osso em vez de branco puro, algarismos tabulares.
- Claro e o padrao: ferramenta de uso diario, em horario comercial, cansa
  menos no claro. O escuro e opcao de cada pessoa (botao no menu).

## Regras

1. **Menu recua.** Fundo um tom abaixo do conteudo, texto mais apagado; so o
   item da pagina atual ganha destaque (fundo e icone verde).
2. **Um titulo por pagina**, na Creato Black (fonte da marca), via
   `CabecalhoPagina`. Sobre-titulo em mono, caixa alta, para situar.
3. **Hierarquia por brilho.** `text-tinta` para o que importa, `tinta-2` e
   `tinta-3` para apoio, `tinta-4` para o que so precisa existir.
4. **Cor e sinal.** Verde (`destaque`) para a acao principal e o que e "meu";
   vermelho e ambar so para o que pede acao. Numero que esta normal fica na
   cor do texto.
5. **Alertas numa lista so.** O dashboard junta tudo que pede acao em
   "Precisa de atencao", do mais grave para o menos grave, com o link de
   onde resolve. Faixa colorida empilhada vira ruido.
6. **Poucas bordas.** Cartao tem uma borda fina e sombra minima; dentro dele
   as linhas sao separadas por `linha-suave`. Nada de borda dentro de borda.
7. **Vazio ensina.** `Vazio` diz o que falta e, quando ha, o proximo passo.
8. **Interno nao vaza.** Paginas que o cliente abre (aprovacao, relatorio,
   perfil) nao usam o tema do painel nem mostram dado interno.

## Onde mexer

| O que | Onde |
| --- | --- |
| Cores, fontes, sombras dos dois temas | `src/app/globals.css` (variaveis em `:root`) |
| Cor de cada status de post | `globals.css`, bloco "Status" (`--st`) |
| Cartao, botao, etiqueta, aviso, avatar, metrica, cabecalho | `src/components/ui.tsx` |
| Icones | `src/components/icones.tsx` |
| Menu lateral (secoes, itens) | `src/components/nav-lateral.tsx` |
| Moldura do painel (menu, rodape do usuario, tema) | `src/app/(painel)/layout.tsx` |

Um tema novo e um bloco de variaveis em `globals.css` mais uma entrada em
`src/lib/tema.ts`. As paginas nao usam cor fixa: so os tokens.
