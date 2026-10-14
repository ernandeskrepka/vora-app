// Configura o PIX da VORA no ambiente local, so para conferir a tela.
import { salvarRecebedorPix } from "../../src/services/saldo.ts";
salvarRecebedorPix(
  { chave: "financeiro@vorabr.com", nome: "VORA Marketing", cidade: "Fraiburgo" },
  { tipo: "SISTEMA", nome: "script local" },
).then(() => console.log("pix configurado"));
