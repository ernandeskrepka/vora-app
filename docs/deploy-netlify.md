# Subir o sistema na Netlify (passo a passo)

O objetivo e sair com um link funcionando, sem terminal. Sao tres passos seus
(uns 5 minutos) e o resto fica automatico: cada push no `main` gera um deploy
novo.

## 1. Criar o site a partir do repositorio

Abra o link abaixo e confirme:

<https://app.netlify.com/start/deploy?repository=https://github.com/ernandeskrepka/vora-app>

Se ele pedir, autorize a Netlify a ler o GitHub e escolha o repositorio
`ernandeskrepka/vora-app`. Nao mude nada no build: o `netlify.toml` do
repositorio ja traz o comando certo, o plugin do Next e os padroes seguros
(`META_DRY_RUN=true`, `WHATSAPP_MODE=log`).

> **Por que nao dar "Link repository" num site que ja existe?** A Netlify so
> deixa ligar um repositorio a um site que ja teve um deploy de producao
> ("Site must have a production deploy before linking a repository"). Criar o
> site ja a partir do Git resolve isso porque o primeiro deploy sai no mesmo
> fluxo.

Esse primeiro deploy sobe o site sem banco e sem segredos - e esperado. O build
foi feito para nao quebrar nesse estado: ele avisa que nao achou banco e segue.

## 2. Criar o banco

No painel do site: **Project configuration -> Database** (ou **Extensions ->
Netlify DB**) e crie o Postgres. A Netlify injeta a variavel `NETLIFY_DB_URL`,
que o app usa como `DATABASE_URL` quando essa nao existe.

Se preferir um banco de fora (Neon, Supabase, Railway), e so criar la e colocar
a string de conexao em `DATABASE_URL` nas variaveis do site.

As tabelas sao criadas no proprio build, por `scripts/preparar-hospedagem.mjs`
(`prisma db push`, idempotente).

## 3. Variaveis do site

**Atencao:** o que esta em `[build.environment]` no `netlify.toml` vale **so no
build**. A Netlify nao repassa essas variaveis para as funcoes, e no Next o
servidor roda como funcao - ou seja, tudo que o app le em tempo de execucao
tem de estar em **Project configuration -> Environment variables**, com escopo
`all`:

| Variavel | Valor | Para que |
| --- | --- | --- |
| `APP_URL` | endereco do site | entra nos links de aprovacao |
| `APP_TIMEZONE` | `America/Sao_Paulo` | horario dos agendamentos |
| `QUEUE_DRIVER` | `none` | sem Redis e sem worker |
| `STORAGE_DRIVER` | `netlify` | criativos no Netlify Blobs |
| `META_DRY_RUN` | `true` | nada e enviado para a Meta |
| `WHATSAPP_MODE` | `log` | mensagem so no log e no banco |
| `INTERNAL_NOTIFY_CHANNEL` | `log` | aviso interno so no log |
| `ENCRYPTION_KEY` | 32 bytes em base64 (`openssl rand -base64 32`) | cifra os tokens da Meta |
| `AGENDA_TOKEN` | um segredo qualquer | protege `/api/agenda` |
| `ADMIN_EMAIL` | e-mail do primeiro login | primeiro acesso |
| `ADMIN_SENHA` | senha do primeiro login (10+ caracteres) | primeiro acesso |

Sem `QUEUE_DRIVER=none` e `STORAGE_DRIVER=netlify` ali, o app cai nos padroes de
servidor normal (Redis e disco local) e quebra no primeiro uso.

Depois de mexer nas variaveis, rode **Deploys -> Trigger deploy -> Clear cache
and deploy site** (ou espere o proximo push).

## 4. Entrar

Abra `/login`. Se o banco estiver vazio, a propria tela cria o primeiro usuario
com `ADMIN_EMAIL` e `ADMIN_SENHA` - depois disso essas variaveis sao ignoradas.

## O que roda no lugar do worker

`netlify/functions/agenda.mts` chama `/api/agenda` de minuto em minuto com o
`AGENDA_TOKEN`. E essa rota que publica o que venceu, marca `POST_SEM_RESPOSTA`
e manda lembrete. Tudo idempotente: rodar de novo nao duplica nada.

## Antes de ligar na Meta de verdade

1. Trocar a `ENCRYPTION_KEY` por uma definitiva e guardada (trocar invalida os
   links de aprovacao em aberto).
2. `META_DRY_RUN=false` so depois do App Review e das contas conectadas.
3. `WHATSAPP_MODE=cloud_api` so depois dos templates aprovados.
