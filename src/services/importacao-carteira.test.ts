import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { ATOR_EQUIPE, limparBanco } = await import("@/testes/ajudantes.ts");
const { importarCarteira } = await import("./importacao-carteira.ts");

const CARTEIRA = [
  {
    nome: "Laboratorio Santa Rita",
    slug: "santa-rita",
    ativos: [
      { tipo: "FACEBOOK_PAGE" as const, id: "650347181506686", nome: "Santa Rita Laboratorio" },
      { tipo: "AD_ACCOUNT" as const, id: "act_4152717795011460", nome: "LAB. SANTA RITA CA 01" },
    ],
  },
  { nome: "Danieli Moveis", slug: "danieli-moveis", ativos: [], pendencia: "sem Pagina localizada" },
];

beforeEach(async () => {
  await limparBanco();
});

describe("importacao da carteira", () => {
  it("cria clientes e ativos, sem token e sem marcar como conectado", async () => {
    const r = await importarCarteira(CARTEIRA, ATOR_EQUIPE);

    expect(r.clientesCriados).toBe(2);
    expect(r.ativosCriados).toBe(2);

    const conexoes = await prisma.metaConnection.findMany();
    expect(conexoes).toHaveLength(2);
    for (const c of conexoes) {
      expect(c.status).toBe("NAO_CONFIGURADO");
      expect(c.authMode).toBe("SYSTEM_USER");
      expect(c.tokenCiphertext).toBeNull();
    }
  });

  it("rodar de novo nao duplica nada", async () => {
    await importarCarteira(CARTEIRA, ATOR_EQUIPE);
    const r = await importarCarteira(CARTEIRA, ATOR_EQUIPE);

    expect(r.clientesCriados).toBe(0);
    expect(r.clientesExistentes).toBe(2);
    expect(r.ativosCriados).toBe(0);
    expect(await prisma.client.count()).toBe(2);
    expect(await prisma.metaConnection.count()).toBe(2);
  });

  it("nao troca o ID de um ativo ja conectado", async () => {
    await importarCarteira(CARTEIRA, ATOR_EQUIPE);
    const cliente = await prisma.client.findUniqueOrThrow({ where: { slug: "santa-rita" } });
    await prisma.metaConnection.updateMany({
      where: { clientId: cliente.id, assetType: "FACEBOOK_PAGE" },
      data: { status: "CONECTADO" },
    });

    const r = await importarCarteira(
      [{ nome: "Laboratorio Santa Rita", slug: "santa-rita", ativos: [{ tipo: "FACEBOOK_PAGE", id: "999" }] }],
      ATOR_EQUIPE,
    );

    const conexao = await prisma.metaConnection.findFirstOrThrow({
      where: { clientId: cliente.id, assetType: "FACEBOOK_PAGE" },
    });
    expect(conexao.assetId).toBe("650347181506686");
    expect(conexao.status).toBe("CONECTADO");
    expect(r.linhas[0]?.situacao).toContain("ja conectado com outro ID");
  });

  it("atualiza so o nome quando o ID e o mesmo", async () => {
    await importarCarteira(CARTEIRA, ATOR_EQUIPE);
    const r = await importarCarteira(
      [
        {
          nome: "Laboratorio Santa Rita",
          slug: "santa-rita",
          ativos: [{ tipo: "FACEBOOK_PAGE", id: "650347181506686", nome: "Santa Rita Lab (novo nome)" }],
        },
      ],
      ATOR_EQUIPE,
    );

    expect(r.ativosAtualizados).toBe(1);
    const conexao = await prisma.metaConnection.findFirstOrThrow({ where: { assetType: "FACEBOOK_PAGE" } });
    expect(conexao.assetName).toBe("Santa Rita Lab (novo nome)");
  });

  it("recusa carteira vazia", async () => {
    await expect(importarCarteira([], ATOR_EQUIPE)).rejects.toThrow();
  });
});
