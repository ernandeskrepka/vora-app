# Arquitetura

## Decisao central

A publicacao **nao** e agendada dentro da Meta. O sistema guarda o post e chama a
Graph API no horario marcado, e apenas se o cliente tiver aprovado. Isso torna a
aprovacao uma trava real, e nao um lembrete:

- cancelar ate o ultimo segundo;
- revalidar no disparo (aprovacao, versao do criativo, conexao);
- mesma regra para Instagram e Facebook (nao usamos `scheduled_publish_time`).

## Processos

```
+------------------+        +--------------------+
|  Next.js (web)   |        |  Worker (BullMQ)   |
|  painel + site   |        |  publicacao,       |
|  de aprovacao    |        |  lembretes, cortes |
+--------+---------+        +---------+----------+
         |                            |
         +------------+---------------+
                      |
        +-------------v--------------+
        | Postgres | Redis | S3/R2   |
        +-------------+--------------+
                      |
      +---------------+----------------+
      | Meta Graph API | WhatsApp Cloud |
      +--------------------------------+
```

O web so **coloca e remove** jobs na fila; quem executa e o worker. Os dois
compartilham banco, Redis e storage.

## Camadas

| Camada | Pasta | Regra |
| --- | --- | --- |
| Dominio | `src/domain` | regras puras, sem banco e sem rede. A maquina de estados vive aqui |
| Infra | `src/lib` | banco, cripto, storage, Meta, WhatsApp, fila, datas |
| Casos de uso | `src/services` | orquestram dominio + infra, e sao o unico ponto de escrita |
| Interface | `src/app` | paginas do painel, site publico de aprovacao e webhooks |

Dependencia sempre para dentro: `app` -> `services` -> `lib`/`domain`.

## Pontos de seguranca

- **Link de aprovacao**: token de 32 bytes derivado por HMAC do id do pedido.
  O banco guarda **somente o hash** (SHA-256). Derivar em vez de sortear permite
  que o lembrete reenvie o mesmo link sem guardar o token; a chave fica em
  `ENCRYPTION_KEY`, e troca-la invalida os links em aberto.
- **Tokens da Meta**: AES-256-GCM, cifrados no banco, nunca em log.
- **Senha da equipe**: scrypt com salt por usuario.
- **Sessao**: cookie HttpOnly com token aleatorio; o banco guarda o hash, e
  desativar um usuario apaga as sessoes dele.
- **Midia**: URL assinada com prazo (S3/R2 em producao; no driver local, a mesma
  ideia via HMAC em `/api/media`).
- **Webhooks**: assinatura `X-Hub-Signature-256` validada com o App Secret.
- **Auditoria**: nenhum fluxo apaga ou edita `audit_log` e `approval_decisions`.

## Concorrencia

Toda mudanca de status passa por `src/services/transicoes.ts`, que escreve com
`updateMany` condicionado ao status **e** a versao lidos. Se outro processo mexeu
no post no meio do caminho, a escrita nao acontece e o erro
`ConflitoDeEstadoError` sobe, em vez de uma publicacao errada.

A publicacao e idempotente pela chave unica `(post, rede)` em
`post_publications`: reentrega de job nao duplica post, e falha parcial retoma
apenas a rede que faltou.

## Modelo de dados

| Tabela | Papel |
| --- | --- |
| `users`, `sessions` | equipe da agencia e sessoes |
| `clients`, `client_contacts` | clientes e contatos aprovadores do WhatsApp |
| `meta_connections` | um ativo por cliente e tipo, com token cifrado e status |
| `posts`, `post_media` | o post, sua versao e os arquivos |
| `approval_requests` | um pedido por versao, com hash do token e validade |
| `approval_decisions` | decisao do cliente: nome, comentario, IP, user agent |
| `publish_attempts` | cada tentativa de publicacao, com resposta da Meta |
| `post_publications` | resultado final por rede (chave de idempotencia) |
| `notifications` | mensagens ao cliente e avisos internos, com status |
| `ad_insights_daily` | metricas de anuncios por campanha e dia (fase 2) |
| `audit_log` | trilha de tudo que aconteceu |
| `settings` | lembretes e canal de aviso interno (tela de Configuracoes) |

## Fases de entrega

1. **Fundacao** - projeto, banco, login, clientes, upload com validacao. Pronto.
2. **Aprovacao** - status, link, site mobile, auditoria, POST SEM RESPOSTA.
   Pronto (WhatsApp em modo log).
3. **WhatsApp** - Cloud API, templates, lembretes, avisos internos. Codigo
   pronto; falta submeter os templates e virar `WHATSAPP_MODE=cloud_api`.
4. **Meta** - conexoes, worker de publicacao, retries, tela de conexoes. Pronto
   em dry-run; falta o App Review para desligar o `META_DRY_RUN`.
5. **Piloto** - Danieli Moveis, Dental Care e Laboratorio Fleming no seed.
6. **Fase 2** - relatorios de anuncios. Coleta e relatorio mensal prontos; a
   coleta real depende das contas de anuncios conectadas.
