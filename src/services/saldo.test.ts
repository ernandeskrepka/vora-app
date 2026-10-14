import { beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db.ts");
const { ATOR_EQUIPE, criarClienteCompleto, limparBanco } = await import("@/testes/ajudantes.ts");
const {
  saldoDoCliente,
  registrarRecarga,
  clientesComSaldoBaixo,
  salvarLimitePadrao,
  salvarRecebedorPix,
  cobrancaDeRecarga,
  valorSugerido,
} = await import("./saldo.ts");

async function gastar(clienteId: string, dias: Array<{ dia: string; valor: number }>) {
  for (const [i, d] of dias.entries()) {
    await prisma.adInsightDaily.create({
      data: {
        clientId: clienteId,
        adAccountId: "act_1",
        date: new Date(`${d.dia}T00:00:00Z`),
        campaignId: `c-${i}`,
        spend: d.valor,
        impressions: 100,
        clicks: 5,
        conversions: 1,
      },
    });
  }
}

beforeEach(async () => {
  await limparBanco();
  await prisma.adAccountTopUp.deleteMany();
  await prisma.setting.deleteMany();
});

describe("saldo da conta de anuncios", () => {
  it("sem recarga registrada, nao afirma saldo nenhum", async () => {
    const cliente = await criarClienteCompleto();
    const s = await saldoDoCliente(cliente.id);

    expect(s.acompanhando).toBe(false);
    expect(s.abaixoDoLimite).toBe(false);
  });

  it("desconta o gasto coletado das recargas", async () => {
    const cliente = await criarClienteCompleto();
    await registrarRecarga({
      clienteId: cliente.id,
      valor: 500,
      quando: new Date("2026-10-01T00:00:00Z"),
      ator: ATOR_EQUIPE,
    });
    await gastar(cliente.id, [
      { dia: "2026-10-02", valor: 100 },
      { dia: "2026-10-03", valor: 150 },
    ]);

    const s = await saldoDoCliente(cliente.id);
    expect(s.recarregado).toBe(500);
    expect(s.gasto).toBe(250);
    expect(s.saldo).toBe(250);
    expect(s.abaixoDoLimite).toBe(false);
  });

  it("ignora gasto anterior a primeira recarga", async () => {
    const cliente = await criarClienteCompleto();
    await gastar(cliente.id, [{ dia: "2026-09-20", valor: 999 }]);
    await registrarRecarga({
      clienteId: cliente.id,
      valor: 300,
      quando: new Date("2026-10-01T00:00:00Z"),
      ator: ATOR_EQUIPE,
    });

    const s = await saldoDoCliente(cliente.id);
    expect(s.gasto).toBe(0);
    expect(s.saldo).toBe(300);
  });

  it("soma varias recargas", async () => {
    const cliente = await criarClienteCompleto();
    await registrarRecarga({
      clienteId: cliente.id,
      valor: 200,
      quando: new Date("2026-10-01T00:00:00Z"),
      ator: ATOR_EQUIPE,
    });
    await registrarRecarga({
      clienteId: cliente.id,
      valor: 300,
      quando: new Date("2026-10-10T00:00:00Z"),
      ator: ATOR_EQUIPE,
    });

    const s = await saldoDoCliente(cliente.id);
    expect(s.recarregado).toBe(500);
  });

  it("avisa quando chega no limite e estima quantos dias faltam", async () => {
    const cliente = await criarClienteCompleto();
    await registrarRecarga({
      clienteId: cliente.id,
      valor: 300,
      quando: new Date("2026-10-01T00:00:00Z"),
      ator: ATOR_EQUIPE,
    });
    await gastar(cliente.id, [
      { dia: "2026-10-02", valor: 80 },
      { dia: "2026-10-03", valor: 80 },
      { dia: "2026-10-04", valor: 80 },
    ]);

    const s = await saldoDoCliente(cliente.id);
    expect(s.saldo).toBe(60);
    expect(s.limite).toBe(80);
    expect(s.abaixoDoLimite).toBe(true);
    expect(s.gastoPorDia).toBe(80);
    expect(s.diasRestantes).toBe(0);

    const baixos = await clientesComSaldoBaixo();
    expect(baixos.map((b) => b.clienteId)).toContain(cliente.id);
  });

  it("respeita o limite proprio do cliente e o limite geral salvo", async () => {
    const cliente = await criarClienteCompleto();
    await registrarRecarga({
      clienteId: cliente.id,
      valor: 200,
      quando: new Date("2026-10-01T00:00:00Z"),
      ator: ATOR_EQUIPE,
    });
    await gastar(cliente.id, [{ dia: "2026-10-02", valor: 50 }]);

    expect((await saldoDoCliente(cliente.id)).abaixoDoLimite).toBe(false);

    await salvarLimitePadrao(200, ATOR_EQUIPE);
    expect((await saldoDoCliente(cliente.id)).abaixoDoLimite).toBe(true);

    await prisma.client.update({ where: { id: cliente.id }, data: { saldoLimite: 20 } });
    const comLimiteProprio = await saldoDoCliente(cliente.id);
    expect(comLimiteProprio.limite).toBe(20);
    expect(comLimiteProprio.abaixoDoLimite).toBe(false);
  });

  it("recusa recarga sem valor", async () => {
    const cliente = await criarClienteCompleto();
    await expect(
      registrarRecarga({ clienteId: cliente.id, valor: 0, ator: ATOR_EQUIPE }),
    ).rejects.toThrow();
  });

  it("so gera cobranca depois que o PIX da VORA esta configurado", async () => {
    const cliente = await criarClienteCompleto();
    await expect(cobrancaDeRecarga({ clienteId: cliente.id, valor: 300 })).rejects.toThrow();

    await salvarRecebedorPix(
      { chave: "financeiro@vorabr.com", nome: "VORA Marketing", cidade: "Fraiburgo" },
      ATOR_EQUIPE,
    );

    const cobranca = await cobrancaDeRecarga({ clienteId: cliente.id, valor: 300 });
    expect(cobranca.payload).toContain("br.gov.bcb.pix");
    expect(cobranca.payload).toContain("300.00");
    expect(cobranca.qrSvg).toContain("<svg");
    expect(cobranca.valor).toBe(300);
  });

  it("a chave PIX nao vai para a auditoria", async () => {
    await salvarRecebedorPix(
      { chave: "financeiro@vorabr.com", nome: "VORA Marketing", cidade: "Fraiburgo" },
      ATOR_EQUIPE,
    );
    const registros = await prisma.auditLog.findMany({ where: { action: "pix_recebedor_salvo" } });
    expect(registros).toHaveLength(1);
    expect(JSON.stringify(registros[0].metadata)).not.toContain("financeiro@vorabr.com");
  });

  it("sugere recompor o patamar da ultima recarga, arredondado", async () => {
    const saldo = {
      saldo: 62.87,
      limite: 80,
    } as Awaited<ReturnType<typeof saldoDoCliente>>;
    expect(valorSugerido(saldo, 500)).toBe(440);
    expect(valorSugerido({ ...saldo, saldo: 495 }, 500)).toBe(50);
  });
});
