import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { criarClienteCompleto, limparBanco } =
  await import("@/testes/ajudantes.ts");
const { processarPendencias } = await import("./agenda.ts");

beforeEach(async () => {
  await limparBanco();
});

describe("agenda e o Notion", () => {
  it("sem token do Notion, a agenda segue normal e nao rele ninguem", async () => {
    // Cliente com pagina configurada, mas o ambiente de teste nao tem
    // NOTION_TOKEN: a agenda nao pode cair por causa disso.
    const c = await criarClienteCompleto();
    await prisma.client.update({
      where: { id: c.id },
      data: {
        notionPageId:
          "https://app.notion.com/p/3f48b499e74381d6b63af048deef3927",
      },
    });

    const r = await processarPendencias();

    expect(r.notion).toBe(0);
    expect(r).toMatchObject({
      publicados: 0,
      falhas: 0,
      semResposta: 0,
      lembretes: 0,
    });
    // E nao marca como lido quem nao foi lido.
    const depois = await prisma.client.findUniqueOrThrow({
      where: { id: c.id },
    });
    expect(depois.notionSyncedAt).toBeNull();
  });
});
