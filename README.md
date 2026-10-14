# VORA - Aprovacao e publicacao automatizada de criativos

[![Status do deploy](https://api.netlify.com/api/v1/badges/57a5729e-d433-46b1-af12-b0146401fb58/deploy-status)](https://app.netlify.com/projects/vora-aprovacoes/deploys)

Sistema interno da VORA para publicar criativos de clientes no Instagram e no
Facebook **com uma etapa obrigatoria de aprovacao do cliente**.

A regra que define a arquitetura: **o agendamento e nosso, nao da Meta**. O post
fica guardado aqui e a chamada a Graph API acontece no horario marcado, e apenas
se o cliente tiver aprovado. Silencio nunca vira publicacao: no horario, um post
sem resposta recebe o status `POST SEM RESPOSTA` e nao sai.

```
RASCUNHO -> AGUARDANDO_APROVACAO -> APROVADO -> PUBLICANDO -> PUBLICADO
                                \-> REPROVADO -------> (ajuste) -> RASCUNHO
                                \-> POST_SEM_RESPOSTA -> (reagenda) -> RASCUNHO
APROVADO -> (agencia edita) -> RASCUNHO          PUBLICANDO -> FALHOU -> APROVADO
```

## Sumario

- [Como rodar localmente](#como-rodar-localmente)
- [Como funciona](#como-funciona)
- [Estrutura do codigo](#estrutura-do-codigo)
- [Testes](#testes)
- [Deploy](#deploy)
- [Configurar o app na Meta](#configurar-o-app-na-meta)
- [Templates do WhatsApp](#templates-do-whatsapp)
- [Operacao do dia a dia](#operacao-do-dia-a-dia)
- [O que ainda nao esta pronto](#o-que-ainda-nao-esta-pronto)

## Como rodar localmente

### Caminho rapido (um comando)

Precisa de **Node 22+** e, de preferencia, **Docker** (o script sobe Postgres e
Redis por voce). Sem Docker ele usa o Postgres e o Redis que voce ja tiver.

```bash
git clone https://github.com/ernandeskrepka/vora-app.git
cd vora-app
bash scripts/preparar.sh
```

O script confere o Node, sobe o banco e o Redis, cria o `.env` com uma chave de
criptografia nova, instala as dependencias, cria as tabelas e roda o seed. No
fim ele imprime o login e **um link de aprovacao pronto** para abrir no celular.

Depois, em dois terminais:

```bash
npm run dev          # painel e site de aprovacao: http://localhost:3000
npm run worker       # fila: publicacao, lembretes e corte de sem resposta
```

### Roteiro de teste (10 minutos)

1. **Entre no painel** com o login impresso pelo seed. O dashboard ja mostra um
   post aguardando aprovacao, um `POST SEM RESPOSTA` e um publicado.
2. **Abra o link de aprovacao no celular** (o endereco que o seed imprimiu).
   Veja o criativo, navegue no carrossel, digite um nome e aprove.
3. **Volte ao painel, no detalhe do post**: a decisao aparece com nome, data,
   hora e IP, e o post entra na fila de publicacao.
4. **Teste a trava**: edite esse post aprovado (legenda ou horario). Ele volta
   para aguardando aprovacao, a versao sobe e o link antigo para de funcionar -
   abra o link antigo para ver a mensagem de substituido.
5. **Veja o fluxo inteiro acontecer**, com o worker rodando:
   ```bash
   npx tsx scripts/smoke-publicacao.ts     # aprova e publica em segundos
   npx tsx scripts/smoke-sem-resposta.ts   # ninguem responde -> POST SEM RESPOSTA
   ```
6. **Crie um post do zero** em Novo post, com uma imagem sua. Experimente subir
   uma imagem 1080x1920 para Instagram: a validacao recusa pela proporcao.
7. `npm test` para rodar os 97 testes.

Nada e publicado na Meta e nenhuma mensagem de WhatsApp sai: `META_DRY_RUN=true`
e `WHATSAPP_MODE=log`. As publicacoes aparecem marcadas como `dry-run`.

### Caminho manual

Precisa de **Node 22+**, **PostgreSQL 14+**, **Redis 6+** e **ffmpeg** (para ler
duracao de video; sem ele o sistema segue, apenas avisa).

```bash
npm install

cp .env.example .env
# Gere a chave de criptografia e cole em ENCRYPTION_KEY:
openssl rand -base64 32

npm run db:push      # cria as tabelas
npm run db:seed      # equipe + 3 clientes do piloto + posts de exemplo
```

Dois processos, em terminais separados:

```bash
npm run dev          # painel e site de aprovacao: http://localhost:3000
npm run worker       # fila: publicacao, lembretes e corte de sem resposta
```

O seed imprime o login e um **link de aprovacao pronto** para abrir no celular.
Para ver os links em aberto a qualquer momento:

```bash
npx tsx scripts/link-pendente.ts
```

Em desenvolvimento, `META_DRY_RUN=true` e `WHATSAPP_MODE=log`: nada e publicado
na Meta e nenhuma mensagem sai: tudo fica no log e no banco.

### Montar um exemplo com material de um cliente

Para mostrar o sistema a um cliente antes de ligar de verdade, use uma pasta com
as artes dele (as mesmas que ja estao no Drive):

```bash
npx tsx scripts/demo-cliente.ts ./pasta-de-artes --nome "Santa Rita" --handle santarita
```

O script agrupa os arquivos (`nome_01`, `nome_02`... viram um carrossel), cria o
cliente, deixa os posts anteriores como publicados — para a previa do perfil ter
grade — e o mais recente aguardando aprovacao, imprimindo o link para abrir no
celular.

Material de cliente nao entra no repositorio: a pasta `demo-midia/` esta no
`.gitignore`.

### Testes de fumaca (com o worker rodando)

```bash
npx tsx scripts/smoke-publicacao.ts    # cliente aprova -> worker publica (dry-run)
npx tsx scripts/smoke-sem-resposta.ts  # ninguem responde -> POST SEM RESPOSTA
```

## Como funciona

**1. A agencia cria o post.** Upload (arrastar e soltar, varios arquivos no
carrossel), legenda, redes, data e hora. As imagens sao convertidas para JPEG
(exigencia do Instagram) e validadas na hora: proporcao, largura, tamanho,
duracao de video e quantidade de itens do carrossel.

**2. O cliente recebe um link pelo WhatsApp.** Pagina publica, pensada para
celular, com a marca da VORA. Duas abas: **O post** (criativo, legenda, redes e
horario) e **No perfil**, que mostra como o post fica na grade do Instagram, ao
lado do que ja publicamos para ele. Ele **digita o nome** e escolhe Aprovar ou
Reprovar (reprovar exige comentario).

A grade usa os posts que o proprio sistema publicou. Nao lemos a grade real do
Instagram: isso exigiria outra permissao da Meta e nao mudaria a decisao do
cliente.

**3. Aprovado entra na fila.** O worker dispara no horario marcado. Antes de
chamar a Meta, **revalida tudo**: o post continua aprovado? a aprovacao e da
versao atual do criativo? a conexao da Meta esta valida? Se qualquer resposta for
"nao", nao publica e avisa a equipe.

**4. Reprovado volta para ajuste.** A equipe recebe o comentario. Qualquer edicao
(criativo, legenda, redes ou horario) **derruba a aprovacao**: a versao sobe, o
link antigo para de funcionar e um novo pedido e enviado.

**5. Sem resposta nao publica.** No horario, o post vira `POST SEM RESPOSTA`,
aparece assim no historico e no relatorio mensal do cliente, e pode ser
reagendado pela agencia.

### Trilha de auditoria

Toda decisao do cliente guarda nome digitado, decisao, comentario, versao do
criativo, data, hora, IP e user agent. Esse registro nunca e apagado nem editado
e aparece inteiro na tela do post. E o que protege a agencia numa discussao sobre
o que foi aprovado.

### Jobs da fila

| Job | Quando | O que faz |
| --- | --- | --- |
| `publish-post` | horario do post | revalida e publica; 3 tentativas com backoff (30s, 60s, 120s) |
| `approval-reminder` | 24 h e 2 h antes (configuravel) | lembra o cliente pelo WhatsApp; no ultimo, avisa a equipe |
| `mark-no-response` | horario do post | se ainda aguardando: `POST SEM RESPOSTA` + aviso interno |
| `check-meta-connections` | diario, 07:00 | testa as conexoes e avisa as que cairam |
| `collect-ad-insights` | diario, 06:30 | coleta resultados de anuncios (fase 2) |

Os jobs sao cancelados e recriados a cada edicao, reagendamento, cancelamento ou
decisao do cliente. O id do job e fixo por post, e **a publicacao e idempotente
por post e rede**: uma rede que ja tem publicacao registrada nunca e publicada de
novo, mesmo que a fila reentregue o job.

## Estrutura do codigo

```
prisma/schema.prisma      modelo de dados (+ seed.ts)
src/domain/               regras puras, sem banco
  post-status.ts          maquina de estados (unico caminho para mudar status)
  formatos.ts             limites de midia da Meta
src/lib/                  infraestrutura
  crypto.ts               AES-256-GCM, hash de token, senha (scrypt)
  auth.ts                 sessao da equipe em cookie + banco
  datetime.ts             America/Sao_Paulo <-> UTC
  storage/                driver local (dev) e S3/R2 (producao)
  media/processar.ts      sharp (JPEG) e ffprobe (video)
  meta/                   Graph API: instagram, facebook, conexoes, dry-run
  whatsapp/               Cloud API e templates
  queue/                  BullMQ: filas, ids e agendamento
src/services/             casos de uso (posts, aprovacao, publicacao, ...)
src/app/                  painel (rotas protegidas) e /aprovar/[token] (publico)
src/worker/index.ts       processo do worker
```

Nenhum modulo escreve `post.status` direto: tudo passa por
`src/services/transicoes.ts`, que valida na maquina de estados, escreve
condicionando ao status lido (evita corrida entre equipe e worker) e registra
auditoria.

## Testes

```bash
npm test          # 97 testes
npm run typecheck
```

Cobrem: todas as transicoes validas e a recusa de todas as invalidas; geracao e
validacao dos tokens; cifra dos segredos; fuso horario; validacao de formato de
midia; e os fluxos de ponta a ponta com **Meta e WhatsApp mockados** - silencio
nao publica, revalidacao no disparo, idempotencia, retries, edicao derrubando a
aprovacao e os lembretes.

Os testes de fluxo usam um banco separado:

```bash
createdb vora_aprovacao_test
DATABASE_URL="postgresql://...vora_aprovacao_test" npx prisma db push
```

## Deploy

### Caminho completo (Render, Railway, VPS)

Dois processos a partir do mesmo repositorio:

| Processo | Comando |
| --- | --- |
| web | `npm run build` e depois `npm start` |
| worker | `npm run worker` |

O `render.yaml` ja descreve os dois servicos, o Postgres e o Redis. No Railway,
crie dois servicos apontando para este repositorio e mude so o comando de start.

### Caminho sem servidor (Netlify)

Hospedagem serverless nao tem processo continuo nem disco, entao o app se
adapta com tres chaves:

| Variavel | Valor | Por que |
| --- | --- | --- |
| `QUEUE_DRIVER` | `none` | sem Redis e sem worker: nada e agendado na fila |
| `STORAGE_DRIVER` | `netlify` | criativos vao para o Netlify Blobs |
| `AGENDA_TOKEN` | um segredo | protege `/api/agenda` |

Essas tres (e as demais que o app le em tempo de execucao) tem de estar nas
**variaveis do site**, nao no `netlify.toml`: a Netlify nao repassa o
`[build.environment]` para as funcoes, e no Next o servidor e uma funcao.

No lugar do worker, a funcao agendada `netlify/functions/agenda.mts` chama
`/api/agenda` a cada minuto. Essa rota faz o mesmo trabalho: publica o que
venceu, marca POST SEM RESPOSTA e envia lembretes. Tudo idempotente, entao
rodar de minuto em minuto nao duplica nada.

O banco e provisionado pela propria Netlify, sem clique: o pacote
`@netlify/database` nas dependencias e o que liga esse provisionamento, e a
conexao chega em `NETLIFY_DB_URL` (usada como `DATABASE_URL` quando essa nao
existe). As tabelas sao criadas no build por `scripts/preparar-hospedagem.mjs`.
O SQL inicial fica em `docs/sql/schema-inicial.sql` de proposito: dentro de
`netlify/database/migrations/` a Netlify aplicaria o mesmo schema por conta
propria e as duas coisas se atropelariam. Sem banco configurado o build nao quebra: ele
avisa e segue, para o site existir antes das variaveis.

Passo a passo com cliques em [docs/deploy-netlify.md](docs/deploy-netlify.md).

Primeira instalacao, depois do deploy:

```bash
curl -X POST "https://SEU_SITE/api/primeiro-acesso?token=SEU_AGENDA_TOKEN" \
  -H "content-type: application/json" \
  -d '{"email":"voce@vorabr.com","senha":"uma-senha-de-10-ou-mais"}'
```

Cria o primeiro usuario e os tres clientes do piloto. A rota recusa assim que
existir qualquer usuario.

A rotina de agenda tambem serve como rede de seguranca no caminho completo:
mesmo com worker e Redis, chamar `/api/agenda` de tempos em tempos pega
qualquer job que tenha se perdido.

Checklist de producao:

1. `STORAGE_DRIVER=s3` com R2 ou S3 - **a Meta precisa baixar a midia de uma URL
   publica**, e o driver local nao serve para isso.
2. `APP_URL` no dominio real (o link do WhatsApp aponta para ele).
3. `ENCRYPTION_KEY` definitiva, guardada no gerenciador de segredos. Trocar essa
   chave invalida os links de aprovacao em aberto.
4. `npm run db:deploy` para aplicar as migracoes.
5. `META_DRY_RUN=false` **somente** depois do App Review aprovado e das contas
   dos clientes conectadas.
6. `WHATSAPP_MODE=cloud_api` depois dos templates aprovados.
7. Webhooks apontados para `/api/webhooks/meta` e `/api/webhooks/whatsapp`.

## Planejamento vindo do Notion

Cada cliente pode apontar para a sua pagina de cronograma no Notion; o botao
**Sincronizar com o Notion** no planejamento le as linhas de dia
(`## Sexta-feira — 09/10 | Titulo`) e cria a pauta. Casa pelo titulo, nao
duplica e nao mexe no que ja virou post. Passo a passo em
[docs/notion.md](docs/notion.md).

## Configurar o app na Meta

Passo a passo em [docs/meta-setup.md](docs/meta-setup.md). Resumo:

1. **Verificacao da empresa** no Business Manager (comece por aqui: e o que
   costuma demorar).
2. **App** no painel de desenvolvedores, tipo Business.
3. **Produtos**: Instagram Graph API, Facebook Login for Business, WhatsApp.
4. **Permissoes para o App Review**: `instagram_basic`,
   `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `business_management` e, para a fase 2, `ads_read`.
   Peca `ads_read` no mesmo review para nao abrir uma segunda analise.
5. **System User** no Business Manager, com os ativos dos clientes (Instagram,
   Pagina e conta de anuncios) atribuidos. Gere o token de longa duracao e
   coloque em `META_SYSTEM_USER_TOKEN`.
6. Clientes cujos ativos nao estao no Business Manager da VORA usam o caminho
   OAuth: cadastre o token do cliente na tela do cliente (ele e guardado
   cifrado).

### Dois pontos onde a documentacao da Meta divergia (conferido em 13/10/2026)

- **Versao da Graph API**: a atual e a **v26.0** (de 29/07/2026), nao a v23.
  A versao fica em `META_GRAPH_VERSION`; revise a cada versao nova.
- **Limite de publicacoes**: o documento de projeto falava em 100 posts por conta
  do Instagram em 24 h. A pagina de Content Publishing cita 100, mas a referencia
  do endpoint `content_publishing_limit` mostra `quota_total: 50`. Por isso o
  sistema **consulta o limite real da conta** antes de publicar, em vez de fixar
  um numero; `META_IG_DAILY_LIMIT` e so o fallback.

## Templates do WhatsApp

Os tres textos prontos para submissao estao em
[docs/whatsapp-templates.md](docs/whatsapp-templates.md): aprovacao pendente,
lembrete e post publicado. Os nomes dos templates ficam em variaveis de ambiente,
e a ordem dos parametros no painel da Meta tem que ser a mesma do arquivo
`src/lib/whatsapp/templates.ts`.

## Operacao do dia a dia

### A area de cada cliente

Cada cliente tem o seu proprio espaco em `/clientes/<id>`, com menu proprio:

| Aba | Para que serve |
| --- | --- |
| Visao geral | numeros do mes, o que precisa de atencao, proximos posts, atalhos |
| Planejamento | quadro de pautas: Ideia, Em producao, Pronto para agendar |
| Materiais | biblioteca do cliente: fotos, artes e briefings que a equipe vai juntando |
| Posts | todos os posts daquele cliente, com filtro por status |
| Relatorio | o relatorio mensal do cliente |
| Conexoes | Instagram, Pagina e conta de anuncios, com teste |
| Ajustes | dados do cliente e contatos aprovadores |

O fluxo pensado para o dia a dia:

1. **Planejamento** - a equipe lanca as pautas do mes (titulo, data prevista,
   notas) e vai movendo entre as colunas.
2. **Materiais** - conforme o material chega (sessao de fotos, arte pronta,
   briefing em PDF), sobe para a biblioteca daquele cliente.
3. Com o criativo pronto, **seleciona os arquivos na biblioteca** e clica em
   "Criar post com estes": o formulario ja abre com eles na ordem escolhida.
   Pela pauta, o botao "Virar post" faz o mesmo e deixa a pauta apontando para
   o post criado.
4. Dali em diante e o fluxo normal: aprovacao do cliente, fila, publicacao.

### Geral

- **Dashboard**: pendentes de aprovacao, proximas publicacoes, POST SEM RESPOSTA,
  reprovados, falhas e conexoes com problema.
- **Calendario**: visao de mes por cliente, com cor por status.
- **Detalhe do post**: historico completo, link ativo, reenviar link, reagendar,
  cancelar.
- **Conexoes Meta**: status por cliente e teste manual.
- **Relatorios**: por cliente e mes, com resultados de anuncios, posts
  publicados, reprovados e POST SEM RESPOSTA. Para PDF, use a impressao do
  navegador (o layout de impressao esconde a navegacao).
- **Configuracoes**: horarios dos lembretes, canal de aviso interno e equipe.

## O que ainda nao esta pronto

Em ordem do que faz mais falta:

1. **Login Meta (OAuth) com tela propria.** Hoje o token do caminho alternativo e
   colado na tela do cliente (ja cifrado no banco). Falta a tela de consentimento
   e a renovacao automatica do token de longa duracao.
2. **PDF do relatorio gerado no servidor.** Hoje e a impressao do navegador.
3. **Aprovacao em lote** (um link para a semana do cliente, item por item).
4. **Coleta real de insights da fase 2.** O coletor esta implementado, mas so roda
   com `META_DRY_RUN=false`; os dados do relatorio em desenvolvimento vem do seed.
5. **Sentry**: a variavel existe, a instrumentacao ainda nao foi ligada.

### Primeiro acesso automatico

Numa instalacao nova, com `ADMIN_EMAIL` e `ADMIN_SENHA` definidos, a tela de
login cria o primeiro usuario e os clientes do piloto na primeira visita. Com
qualquer usuario no banco, nada acontece. Tambem existe a rota
`POST /api/primeiro-acesso?token=<AGENDA_TOKEN>` para fazer isso manualmente.
