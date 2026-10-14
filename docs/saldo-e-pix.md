# Saldo de anuncios e PIX de recarga

## Por que o saldo e calculado, e nao lido da Meta

A API de anuncios **nao entrega o saldo pre-pago**: os campos `balance`,
`prepay_balance` e `funding_source_details` nao existem no catalogo de campos
disponivel para a VORA (conferido em 14/10/2026). O que existe e
`amount_spent`, que ja coletamos todo dia para o relatorio.

Entao o saldo sai de duas coisas que a gente tem de verdade:

```
saldo = soma das recargas registradas - gasto coletado desde a primeira recarga
```

Enquanto nao houver nenhuma recarga registrada para o cliente, o sistema diz
**"nao da para afirmar o saldo"** em vez de mostrar zero. Mostrar zero faria a
equipe achar que o cliente ficou sem verba.

## Fluxo no dia a dia

1. Colocou dinheiro na conta do cliente? **Clientes > [cliente] > Saldo >
   Registrar recarga.**
2. O sistema desconta o gasto diario sozinho, junto com a coleta do relatorio.
3. Quando o saldo chega no limite (padrao R$ 80), aparece aviso no Dashboard e
   a aba Saldo monta o **PIX de recarga** - QR e copia e cola - pronto para
   mandar no WhatsApp do cliente.
4. O valor sugerido recompoe o patamar da ultima recarga, arredondado para
   cima em dezenas. O cliente pode pagar outro valor.

A aba tambem mostra **quantos dias o saldo ainda aguenta** no ritmo dos ultimos
sete dias - serve para pedir a recarga antes de a campanha parar.

## Configurar o PIX da VORA

**Configuracoes > PIX de recarga e aviso de saldo**: chave, nome do recebedor
(ate 25 caracteres) e cidade (ate 15). O limite de aviso vale para todos; cada
cliente pode ter o seu proprio em `saldoLimite`.

A chave fica guardada so nessa configuracao e **nao entra na auditoria** - e
dado de pagamento.

## Sobre o QR

O codigo e o BR Code do PIX (padrao EMV): campos `ID + tamanho + valor`,
terminando no CRC-16/CCITT-FALSE calculado **incluindo** o proprio cabecalho
`6304` - o erro mais comum nos geradores por ai. Nome e cidade vao em ASCII
sem acento porque o padrao exige.

A montagem tem teste, inclusive com o vetor de referencia do algoritmo de CRC
(`123456789` -> `29B1`), entao da para mexer no payload sem medo de gerar um QR
que o banco recusa.
