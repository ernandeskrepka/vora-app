# Ligar o Notion ao sistema

O planejamento de cada cliente ja existe no Notion (base **Clientes VORA**,
coluna *Ultimo planejamento*). O sistema le essa pagina e cria a pauta no
quadro de planejamento, sem ninguem redigitar nada.

## 1. Criar a integracao interna (uma vez)

1. <https://www.notion.so/profile/integrations> > **New integration**.
2. Nome: `VORA - sistema de aprovacao`. Associe ao workspace da VORA.
3. Capacidades: **Read content** basta. Nao precisa de escrita.
4. Copie o *Internal Integration Secret* e guarde nas variaveis do site como
   `NOTION_TOKEN` (o painel da Netlify, nao o repositorio).

## 2. Dar acesso as paginas

A integracao so enxerga o que foi compartilhado com ela. Em cada pagina de
cronograma (ou, mais pratico, na pagina-mae que contem todas):

**... (canto superior direito) > Conexoes > VORA - sistema de aprovacao**

O acesso e herdado pelas subpaginas, entao compartilhar a pasta do cliente
costuma resolver de uma vez.

## 3. Apontar o cliente para a pagina

Em **Clientes > [cliente] > Ajustes**, campo *Planejamento no Notion*: cole o
link. Dez clientes ja vem preenchidos pela carteira (`dados/clientes-meta.json`).

## 4. Sincronizar

Em **Clientes > [cliente] > Planejamento**, botao **Sincronizar com o Notion**.

## O que o sistema entende

Ele procura, no texto da pagina, as linhas de dia do jeito que a equipe ja
escreve:

```
## Sexta-feira — 09/10 | Um passeio pela loja
**Formato:** video simples / tour
1. Filmar a entrada e revelar um dos ambientes mais bonitos.
```

Vira uma pauta com titulo `Um passeio pela loja`, data `09/10`, e as notas com
o formato e os passos. Tambem aceita `09/10 - Titulo`, barra escapada
(`\|`), dia da semana ausente e ano escrito (`03/11/2026`). Data sem ano que
ja passou ha mais de seis meses e lida como do ano seguinte - cronograma de
janeiro lido em dezembro nao entra atrasado.

Texto solto antes do primeiro dia e ignorado: observacao de topo nao e pauta.

## Regras da sincronizacao

- **Casa pelo titulo** dentro do mesmo cliente: rodar de novo atualiza data e
  notas em vez de duplicar.
- **Nao mexe no que ja virou post.** Mudar o horario de um post agendado tem de
  passar pelo reagendamento, que sobe a versao e invalida a aprovacao do
  cliente - o Notion nao pode furar isso.
- Toda sincronizacao entra na auditoria, com quantos itens foram lidos,
  criados e atualizados.
