// Monta um ambiente local completo para conferir o painel: primeiro usuario,
// carteira de clientes e a demonstracao. So para desenvolvimento.
import { garantirPrimeiroUsuario } from "../../src/services/primeiro-acesso.ts";
import { carregarCarteira } from "../../src/services/carteira-arquivo.ts";
import { importarCarteira } from "../../src/services/importacao-carteira.ts";
import { carregarDemonstracao } from "../../src/services/demonstracao.ts";

const ator = { tipo: "SISTEMA" as const, nome: "script local" };

await garantirPrimeiroUsuario();
console.log("carteira:", await importarCarteira(await carregarCarteira(), ator));
console.log("demonstracao:", await carregarDemonstracao(ator));
process.exit(0);
