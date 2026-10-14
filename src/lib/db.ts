import { PrismaClient } from "@/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/env";

/**
 * Uma unica instancia por processo (Next em dev recarrega modulos).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
