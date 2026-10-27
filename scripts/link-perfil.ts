import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { linkDoPerfil } from "../src/services/perfil-link.ts";

/**
 * Imprime o link do perfil (o que o cliente abre) de cada cliente ativo.
 *
 *   npx tsx scripts/link-perfil.ts [parte do nome]
 */
const filtro = process.argv[2]?.toLowerCase();
const clientes = await prisma.client.findMany({
  where: { active: true },
  orderBy: { name: "asc" },
});
for (const c of clientes) {
  if (filtro && !c.name.toLowerCase().includes(filtro)) continue;
  console.log(`${c.name.padEnd(32)} ${linkDoPerfil(c.id)}`);
}
await prisma.$disconnect();
