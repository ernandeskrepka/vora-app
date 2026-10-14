# Configurar o app na Meta - passo a passo

Conferido em 13/10/2026. A Meta muda esses paineis com frequencia: se um nome
estiver diferente, procure pelo equivalente e **atualize este arquivo**.

O caminho critico do projeto esta aqui, nao no codigo: a verificacao da empresa
e o App Review levam de 2 a 6 semanas. Comece na primeira semana, em paralelo ao
desenvolvimento, com `META_DRY_RUN=true`.

## 1. Verificacao da empresa (Business Verification)

1. Abra o [Business Manager](https://business.facebook.com) da VORA.
2. Configuracoes do negocio > Centro de seguranca > Verificacao da empresa.
3. Envie CNPJ, comprovante de endereco e telefone da empresa.

Sem isso, as permissoes de publicacao nao saem do modo de desenvolvimento.

## 2. Criar o app

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) > Criar app.
2. Tipo **Business**, vinculado ao Business Manager da VORA.
3. Anote o **App ID** e o **App Secret** -> `META_APP_ID` e `META_APP_SECRET`.

## 3. Adicionar os produtos

- **Instagram** (Instagram Graph API / Content Publishing)
- **Facebook Login for Business** (necessario para o caminho OAuth)
- **WhatsApp** (Cloud API)
- **Marketing API** (fase 2, relatorios de anuncios)

## 4. Permissoes para o App Review

Peca todas de uma vez, inclusive `ads_read`, para nao abrir uma segunda analise:

| Permissao | Para que |
| --- | --- |
| `instagram_basic` | ler a conta profissional do cliente |
| `instagram_content_publish` | publicar no Instagram |
| `pages_show_list` | listar as Paginas do cliente |
| `pages_read_engagement` | ler dados da Pagina |
| `pages_manage_posts` | publicar na Pagina |
| `business_management` | ativos via Business Manager |
| `ads_read` | resultados de anuncios (fase 2) |

Para cada permissao a Meta pede um **video de demonstracao**. Grave mostrando o
caminho inteiro, falando o que acontece em cada tela:

1. Painel da VORA: criar o post e enviar para aprovacao.
2. Celular: o cliente abre o link, digita o nome e aprova.
3. Painel: o post aparece como aprovado e agendado.
4. O post publicado na conta do cliente.
5. Mostre tambem o caso **POST SEM RESPOSTA**: sem aprovacao, nao publica.

Deixe claro na descricao que a ferramenta e **de uso interno da agencia**, que
cada cliente autoriza o acesso aos proprios ativos e que nada e publicado sem a
aprovacao registrada do cliente.

## 5. System User (caminho preferido)

Com os ativos dos clientes ja no Business Manager da VORA (acesso de parceiro),
esse e o caminho mais simples: token de longa duracao, sem login do cliente.

1. Configuracoes do negocio > Usuarios > Usuarios do sistema > Adicionar.
2. Nome: `vora-publicacao`. Funcao: **Admin**.
3. Em **Ativos atribuidos**, adicione, para cada cliente:
   - a Pagina do Facebook (permissao de criar conteudo);
   - a conta do Instagram;
   - a conta de anuncios (fase 2, somente leitura ja basta).
4. **Gerar novo token**: escolha o app e marque as permissoes da tabela acima.
5. Copie o token para `META_SYSTEM_USER_TOKEN`. Guarde no gerenciador de
   segredos da hospedagem, nunca no repositorio.

## 6. Cadastrar os clientes no sistema

Para cada cliente, em **Clientes > [cliente] > Conexoes da Meta**:

| Campo | Onde achar |
| --- | --- |
| Instagram - ID | `GET /{page-id}?fields=instagram_business_account` ou no Business Manager |
| Pagina - ID | Pagina > Sobre > ID da Pagina |
| Conta de anuncios | Gerenciador de Anuncios, formato `act_<numero>` |

Deixe **Forma de acesso = System User** e o campo de token em branco: o sistema
usa o `META_SYSTEM_USER_TOKEN`. Clique em **Salvar e testar**: a conexao tem que
ficar `CONECTADO`.

Para cliente cujos ativos **nao** estao no Business Manager da VORA, escolha
**OAuth** e cole o token do cliente (fica cifrado com AES-256-GCM no banco).

## 7. Webhooks

No app, em cada produto, configure:

| Produto | URL | Verify token |
| --- | --- | --- |
| Instagram / Pagina | `https://SEU_DOMINIO/api/webhooks/meta` | `META_WEBHOOK_VERIFY_TOKEN` |
| WhatsApp | `https://SEU_DOMINIO/api/webhooks/whatsapp` | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |

Assine os campos de **permissions** (para saber quando o cliente revoga o
acesso) e, no WhatsApp, **messages** (status de entrega e leitura).

As duas rotas validam a assinatura `X-Hub-Signature-256` com o `META_APP_SECRET`.

## 8. Virar a chave

Quando o App Review for aprovado e as conexoes estiverem `CONECTADO`:

1. `META_DRY_RUN=false`
2. `WHATSAPP_MODE=cloud_api`
3. Publique **um post de teste** em uma conta da propria VORA antes de usar com
   cliente.

## Limites e formatos que o codigo aplica

Centralizados em `src/domain/formatos.ts`. Revise a cada versao nova da Graph API.

| Item | Regra |
| --- | --- |
| Imagem no Instagram | JPEG (convertemos), proporcao de 4:5 a 1.91:1, largura de 320 a 1440 px, ate 8 MB |
| Carrossel | 2 a 10 itens; todos recortados pela proporcao do primeiro |
| Video / Reels | 3 s a 15 min, ate 300 MB, MP4 ou MOV; Reels em 9:16 |
| Limite por conta | consultado em `/{ig-user-id}/content_publishing_limit` antes de publicar |
| Agendamento nativo | **nao usamos** `scheduled_publish_time`: o agendamento e nosso |
