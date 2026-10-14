import { PrismaClient } from "@/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/env";

/**
 * Uma unica instancia por processo (Next em dev recarrega modulos).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL nao configurada: aponte para o Postgres antes de usar o painel.",
    );
  }
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Cliente preguicoso: so conecta (e so cobra o DATABASE_URL) quando alguem
 * faz a primeira consulta. Isso deixa o `next build` da hospedagem rodar
 * antes de existir banco, sem esconder o erro em producao.
 */
function createLazyClient(): PrismaClient {
  let real: PrismaClient | undefined;
  const obter = () => (real ??= createClient());
  return new Proxy({} as PrismaClient, {
    get(_alvo, prop) {
      const valor = Reflect.get(obter() as object, prop);
      return typeof valor === "function" ? valor.bind(obter()) : valor;
    },
    set(_alvo, prop, valor) {
      return Reflect.set(obter() as object, prop, valor);
    },
    has(_alvo, prop) {
      return Reflect.has(obter() as object, prop);
    },
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createLazyClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
