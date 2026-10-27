import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { criarEquipeInicial } from "../src/services/equipe.ts";
import { ROTULO_FUNCAO } from "../src/domain/equipe.ts";

/**
 * Cria os logins da equipe da VORA (um por pessoa, com funcao).
 *
 *   npx tsx scripts/criar-equipe.ts [sufixo]
 *
 * Imprime a senha inicial de cada conta nova. Na primeira entrada a pessoa e
 * obrigada a trocar. Quem ja existe nao e mexido.
 */
const sufixo = process.argv[2] ?? String(new Date().getFullYear());

const r = await criarEquipeInicial({
  sufixo,
  ator: { tipo: "SISTEMA", nome: "script criar-equipe" },
});

if (r.criados.length === 0) {
  console.log("Nenhuma conta nova: a equipe ja esta cadastrada.");
} else {
  console.log("Contas criadas (senha inicial, trocar na primeira entrada):\n");
  for (const p of r.criados) {
    console.log(`  ${p.nome.padEnd(20)} ${p.email.padEnd(30)} ${ROTULO_FUNCAO[p.funcao].padEnd(26)} senha: ${p.senha}`);
  }
}
if (r.existentes.length > 0) console.log(`\nJa existiam: ${r.existentes.join(", ")}`);

await prisma.$disconnect();
