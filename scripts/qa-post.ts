import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
const id = process.argv[2];
const p = await prisma.post.findUniqueOrThrow({ where: { id }, include: { publishAttempts: true, client: { include: { metaConnections: true } } } });
console.log(JSON.stringify({ status: p.status, scheduledAt: p.scheduledAt, lastError: p.lastError, tentativas: p.publishAttempts.map((t) => ({ s: t.status, dry: t.dryRun, erro: t.errorMessage })), conexoes: p.client.metaConnections.map((c) => `${c.assetType}:${c.status}`) }, null, 1));
const audit = await prisma.auditLog.findMany({ where: { entityType: "post", entityId: id }, orderBy: { createdAt: "asc" } });
console.log(audit.map((a) => `${a.action} ${a.fromStatus ?? ""}->${a.toStatus ?? ""} ${JSON.stringify(a.metadata ?? {}).slice(0, 160)}`).join("\n"));
await prisma.$disconnect();
