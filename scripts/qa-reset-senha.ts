import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { redefinirSenha } from "../src/services/equipe.ts";

/** Apoio ao teste: volta uma conta para a senha inicial (troca obrigatoria). */
const [email, senha] = [process.argv[2], process.argv[3]];
const u = await prisma.user.findUniqueOrThrow({ where: { email } });
await redefinirSenha({ usuarioId: u.id, novaSenha: senha, ator: { tipo: "SISTEMA", nome: "qa" } });
console.log("ok");
await prisma.$disconnect();
