import { writeFileSync } from "node:fs";

// Aqui o texto vai com acento: isto e material de apresentacao para pessoas,
// nao codigo nem log. A regra de "sem acento" do projeto vale para o codigo.

const pagina = (corpo) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>VORA</title><link rel="stylesheet" href="base.css"></head>
<body>${corpo}</body></html>`;

const cartao = ({ selo, titulo, sub, marca }) =>
  pagina(`<div class="cartao">
    ${marca ? `<img class="marca entra" src="vora-logo-branco.svg" alt="VORA">` : ""}
    ${selo ? `<span class="selo entra">${selo}</span>` : ""}
    ${titulo ? `<h1 class="titulo ${marca ? "entra-2" : "entra"}">${titulo}</h1>` : ""}
    ${sub ? `<p class="sub entra-3">${sub}</p>` : ""}
  </div>`);

const cartoes = {
  "00-abertura": cartao({
    marca: true,
    titulo: "Aprovação e publicação",
    sub: "O sistema interno da VORA: o cliente aprova pelo celular, o sistema publica no Instagram e no Facebook, e o resultado volta explicado.",
  }),
  "01-regra-aprovacao": cartao({
    selo: "Regra que não se quebra",
    titulo: "Nada é publicado<br>sem aprovação registrada",
    sub: "A fila de publicação só aceita post aprovado. E no disparo o sistema reconfere status, versão do criativo e conexão da Meta antes de chamar a API.",
  }),
  "02-regra-silencio": cartao({
    selo: "Regra que não se quebra",
    titulo: "Silêncio nunca publica",
    sub: "Chegou o horário sem resposta do cliente? O post vira POST SEM RESPOSTA e não sai. Ninguém precisa correr atrás no último minuto.",
  }),
  "03-resultado": cartao({
    selo: "Do outro lado",
    titulo: "O que o cliente recebe",
    sub: "Um link que abre no celular, sem login e sem instalar nada.",
  }),
};

cartoes["04-encerramento"] = pagina(`<div class="cartao">
  <img class="marca entra" src="vora-logo-branco.svg" alt="VORA">
  <h1 class="titulo entra-2" style="font-size:56px">As cinco regras do sistema</h1>
  <div class="regras entra-3">
    <div class="regra"><b>1.</b><span>Nada é publicado sem aprovação registrada do cliente.</span></div>
    <div class="regra"><b>2.</b><span>Silêncio nunca publica: vira POST SEM RESPOSTA.</span></div>
    <div class="regra"><b>3.</b><span>No disparo, o sistema reconfere tudo antes de chamar a Meta.</span></div>
    <div class="regra"><b>4.</b><span>Editar derruba a aprovação e exige uma nova.</span></div>
    <div class="regra"><b>5.</b><span>A auditoria é imutável: nada apaga o histórico.</span></div>
  </div>
</div>`);

for (const [nome, html] of Object.entries(cartoes)) {
  writeFileSync(`${process.argv[2]}/${nome}.html`, html);
}
console.log("cartoes gerados");
