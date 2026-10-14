# Templates do WhatsApp para submeter na Meta

A Cloud API so permite iniciar conversa com template aprovado. Submeta os tres
abaixo em **WhatsApp Manager > Modelos de mensagem**, categoria **Utilidade**,
idioma **Portugues (BR)**.

A ordem dos parametros `{{n}}` tem que ser exatamente a mesma de
`src/lib/whatsapp/templates.ts`. Se mudar a ordem no painel da Meta, mude lá
tambem.

---

## 1. `vora_aprovacao_pendente`

Enviado quando a agencia manda o post para aprovacao.

**Corpo:**

```
Ola {{1}}! Tem um post novo da {{2}} esperando sua aprovacao, previsto para {{3}}.

Veja o criativo e aprove aqui: {{4}}

Sem a sua resposta ate o horario, o post nao e publicado.
```

| Parametro | Conteudo | Exemplo |
| --- | --- | --- |
| `{{1}}` | primeiro nome do contato | Danieli |
| `{{2}}` | nome do cliente | Danieli Moveis |
| `{{3}}` | data e hora previstas | 15/10/2026 as 14:30 |
| `{{4}}` | link de aprovacao | https://aprovacao.vorabr.com/aprovar/... |

---

## 2. `vora_aprovacao_lembrete`

Enviado nos horarios configurados (padrao: 24 h e 2 h antes).

**Corpo:**

```
Ola {{1}}, um lembrete: o post previsto para {{3}} ainda esta sem aprovacao (faltam {{2}}).

Se nao houver resposta ate o horario, ele nao sera publicado.

Link: {{4}}
```

| Parametro | Conteudo | Exemplo |
| --- | --- | --- |
| `{{1}}` | primeiro nome do contato | Danieli |
| `{{2}}` | tempo restante | 2 h |
| `{{3}}` | data e hora previstas | 15/10/2026 as 14:30 |
| `{{4}}` | link de aprovacao | https://... |

---

## 3. `vora_post_publicado`

Confirmacao depois da publicacao.

**Corpo:**

```
Pronto, {{1}}! O post foi publicado em {{2}}.

Veja aqui: {{3}}
```

| Parametro | Conteudo | Exemplo |
| --- | --- | --- |
| `{{1}}` | primeiro nome do contato | Danieli |
| `{{2}}` | redes | Instagram e Facebook |
| `{{3}}` | link do post publicado | https://instagram.com/p/... |

---

## Dicas de aprovacao

- Categoria **Utilidade** (nao Marketing): sao mensagens de processo, pedidas
  pelo proprio cliente da agencia.
- Nao use texto promocional: template de utilidade com cara de propaganda e
  recusado.
- O link entra como parametro de texto no corpo. Se preferir botao de URL
  dinamica, ajuste `src/lib/whatsapp/client.ts` para enviar o componente
  `button` alem do `body`.
- Cada cliente precisa ter aceitado receber mensagens no numero cadastrado.
- Teste com `WHATSAPP_MODE=log` antes de virar a chave: a previa do texto fica no
  log e na tabela `notifications`.
