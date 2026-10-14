import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { ATOR_EQUIPE, limparBanco } = await import("@/testes/ajudantes.ts");
const { carregarDemonstracao, carregarArquivoDeDemonstracao } = await import("./demonstracao.ts");

beforeEach(async () => {
  await limparBanco();
  await prisma.planningItem.deleteMany();
});

describe("demonstracao", () => {
  it("monta o painel com posts, aprovacoes e metricas", async () => {
    const r = await carregarDemonstracao(ATOR_EQUIPE);

    expect(r.postsCriados).toBeGreaterThan(10);
    expect(r.pautasCriadas).toBeGreaterThan(5);
    expect(r.diasDeAnuncio).toBeGreaterThan(100);

    const clientes = await prisma.client.count();
    expect(clientes).toBeGreaterThanOrEqual(6);
  });

  it("nao duplica quando roda de novo", async () => {
    const primeira = await carregarDemonstracao(ATOR_EQUIPE);
    const segunda = await carregarDemonstracao(ATOR_EQUIPE);

    expect(segunda.postsCriados).toBe(0);
    expect(segunda.ignorados).toBe(primeira.postsCriados);
    expect(await prisma.post.count()).toBe(primeira.postsCriados);
  });

  it("respeita as regras: publicado tem aprovacao, sem resposta nao tem publicacao", async () => {
    await carregarDemonstracao(ATOR_EQUIPE);

    const publicados = await prisma.post.findMany({
      where: { status: "PUBLICADO" },
      include: { decisions: true, publications: true },
    });
    expect(publicados.length).toBeGreaterThan(0);
    for (const post of publicados) {
      expect(post.decisions.some((d) => d.decision === "APROVADO")).toBe(true);
      expect(post.approvedAt).not.toBeNull();
      // Nada foi para a Meta de verdade.
      for (const p of post.publications) expect(p.dryRun).toBe(true);
    }

    const semResposta = await prisma.post.findMany({
      where: { status: "POST_SEM_RESPOSTA" },
      include: { publications: true, decisions: true },
    });
    expect(semResposta.length).toBeGreaterThan(0);
    for (const post of semResposta) {
      expect(post.publications).toHaveLength(0);
      expect(post.decisions).toHaveLength(0);
    }
  });

  it("toda midia citada no arquivo existe no repositorio", async () => {
    const { access } = await import("node:fs/promises");
    const path = await import("node:path");
    const clientes = await carregarArquivoDeDemonstracao();

    const chaves = clientes.flatMap((c) => c.posts.flatMap((p) => p.midias ?? []));
    expect(chaves.length).toBeGreaterThan(10);
    for (const chave of chaves) {
      await expect(access(path.join(process.cwd(), "public", chave))).resolves.toBeUndefined();
    }
  });

  it("aprovacao guarda quem aprovou, quando e de onde", async () => {
    await carregarDemonstracao(ATOR_EQUIPE);
    const decisoes = await prisma.approvalDecision.findMany();

    expect(decisoes.length).toBeGreaterThan(0);
    for (const d of decisoes) {
      expect(d.approverName.length).toBeGreaterThan(2);
      expect(d.ipAddress).toBeTruthy();
      expect(d.userAgent).toBeTruthy();
      expect(d.postVersion).toBe(1);
    }
  });
});
