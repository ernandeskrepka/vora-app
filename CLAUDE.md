# Instrucoes para o Claude neste repositorio

Sistema interno da VORA: aprovacao do cliente e publicacao automatizada de
criativos no Instagram e no Facebook. Leia o `README.md` antes de mexer.

## Fluxo de trabalho (importante)

O Ernande testa e pede ajustes em sequencia. **Depois de cada ajuste aceito,
commite e empurre sem esperar que ele peca.** Nao acumule mudancas locais: ele
precisa dar `git pull` e testar.

- Branch: `main`. E um repositorio de uso interno, sem fluxo de pull request.
  Se o pedido for grande ou arriscado, proponha uma branch antes de comecar.
- Um commit por ajuste, mensagem em portugues explicando o porque.
- Antes de empurrar, rode **sempre**: `npm test` e `npm run typecheck`.
  Nao empurre com teste quebrado.
- Nao abra pull request sem ele pedir.

## Regras de negocio que nao podem ser quebradas

1. **Nada e publicado sem aprovacao registrada do cliente.** A fila de
   publicacao so recebe post aprovado.
2. **Silencio nunca publica.** Chegou o horario sem resposta: o post vira
   `POST_SEM_RESPOSTA` e nao sai.
3. **Revalidacao no disparo.** O worker reconfere status, versao aprovada do
   criativo e conexao da Meta antes de chamar a API.
4. **Edicao derruba a aprovacao.** Mudar criativo, legenda, redes ou horario
   sobe a versao, invalida o link antigo e exige nova aprovacao.
5. **Auditoria e imutavel.** Nada apaga ou edita `audit_log` e
   `approval_decisions`.

Mudanca de status de post passa **somente** por `src/services/transicoes.ts`,
que valida na maquina de estados de `src/domain/post-status.ts`. Precisa de um
status ou transicao nova? Adicione na tabela de transicoes e no teste - nunca
escreva `status` direto.

## Convencoes de codigo

- Interface, mensagens e comentarios em portugues; nomes de variaveis, tabelas e
  arquivos em ingles quando for o padrao da ferramenta.
- Sem acentos no codigo e nos comentarios (evita problema de encoding em log).
- Nada de token ou segredo em log: use `redact()` de `src/lib/logger.ts`.
- `META_DRY_RUN=true` e `WHATSAPP_MODE=log` sao o padrao seguro. So troque se o
  pedido for explicitamente sobre virar a chave.

## Ambiente local

`bash scripts/preparar.sh` sobe Postgres e Redis (Docker), cria o `.env`,
instala, cria as tabelas e roda o seed. Dois processos: `npm run dev` e
`npm run worker`.

Os testes de fluxo usam o banco `vora_aprovacao_test` (ver `vitest.setup.ts`);
crie-o com `createdb vora_aprovacao_test && npx prisma db push` apontando o
`DATABASE_URL` para ele.
