import { prisma } from "@/lib/db.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { montarPayloadPix } from "@/lib/pix.ts";
import { ErroDeRegra } from "./erros.ts";
import { obterConfiguracoes } from "./configuracoes.ts";
import type { Ator } from "./transicoes.ts";

export type SaldoDoCliente = {
  clienteId: string;
  cliente: string;
  /** Total ja colocado na conta de anuncios desde a primeira recarga. */
  recarregado: number;
  /** Gasto coletado da Meta no mesmo periodo. */
  gasto: number;
  saldo: number;
  limite: number;
  abaixoDoLimite: boolean;
  /** Media de gasto por dia nos ultimos 7 dias com dado. */
  gastoPorDia: number;
  /** Quantos dias o saldo ainda aguenta nesse ritmo. */
  diasRestantes: number | null;
  desde: Date | null;
  ultimaRecarga: Date | null;
  /** Sem recarga registrada nao da para afirmar saldo nenhum. */
  acompanhando: boolean;
};

export const LIMITE_PADRAO = 80;
export const CHAVE_LIMITE_SALDO = "saldo_limite_padrao";
export const CHAVE_PIX = "pix_recebedor";

export type DadosRecebedorPix = { chave: string; nome: string; cidade: string };

/**
 * Saldo da conta de anuncios do cliente.
 *
 * A API de anuncios da Meta nao entrega saldo pre-pago (os campos `balance`,
 * `prepay_balance` e `funding_source_details` nao existem no catalogo), entao
 * o numero sai de duas coisas que a gente tem de verdade: as recargas que a
 * equipe registra e o gasto diario que ja coletamos para o relatorio.
 *
 * Por isso o resultado diz `acompanhando: false` enquanto nao houver nenhuma
 * recarga registrada - e melhor dizer "nao sei" do que mostrar saldo zero e a
 * equipe achar que o cliente ficou sem verba.
 */
export async function saldoDoCliente(clienteId: string): Promise<SaldoDoCliente> {
  const [cliente, recargas, config] = await Promise.all([
    prisma.client.findUniqueOrThrow({
      where: { id: clienteId },
      select: { id: true, name: true, saldoLimite: true },
    }),
    prisma.adAccountTopUp.findMany({
      where: { clientId: clienteId },
      orderBy: { occurredAt: "asc" },
    }),
    obterLimitePadrao(),
  ]);

  const limite = cliente.saldoLimite !== null ? Number(cliente.saldoLimite) : config;

  if (recargas.length === 0) {
    return {
      clienteId: cliente.id,
      cliente: cliente.name,
      recarregado: 0,
      gasto: 0,
      saldo: 0,
      limite,
      abaixoDoLimite: false,
      gastoPorDia: 0,
      diasRestantes: null,
      desde: null,
      ultimaRecarga: null,
      acompanhando: false,
    };
  }

  const desde = recargas[0].occurredAt;
  const recarregado = recargas.reduce((t, r) => t + Number(r.amount), 0);

  const diasDeGasto = await prisma.adInsightDaily.findMany({
    where: { clientId: clienteId, date: { gte: desde } },
    select: { date: true, spend: true },
    orderBy: { date: "asc" },
  });

  const gasto = diasDeGasto.reduce((t, d) => t + Number(d.spend), 0);
  const saldo = recarregado - gasto;

  // Ritmo recente: soma por dia (varias campanhas no mesmo dia) e media dos
  // ultimos sete dias com dado - a media do periodo inteiro envelhece mal.
  const porDia = new Map<string, number>();
  for (const d of diasDeGasto) {
    const chave = d.date.toISOString().slice(0, 10);
    porDia.set(chave, (porDia.get(chave) ?? 0) + Number(d.spend));
  }
  const ultimos = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7);
  const gastoPorDia = ultimos.length > 0 ? ultimos.reduce((t, [, v]) => t + v, 0) / ultimos.length : 0;

  return {
    clienteId: cliente.id,
    cliente: cliente.name,
    recarregado,
    gasto,
    saldo,
    limite,
    abaixoDoLimite: saldo <= limite,
    gastoPorDia,
    diasRestantes: gastoPorDia > 0 ? Math.max(0, Math.floor(saldo / gastoPorDia)) : null,
    desde,
    ultimaRecarga: recargas[recargas.length - 1].occurredAt,
    acompanhando: true,
  };
}

export async function obterLimitePadrao(): Promise<number> {
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_LIMITE_SALDO } });
  const valor = Number(linha?.value);
  return Number.isFinite(valor) && valor > 0 ? valor : LIMITE_PADRAO;
}

export async function obterRecebedorPix(): Promise<DadosRecebedorPix | null> {
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_PIX } });
  const v = linha?.value as Partial<DadosRecebedorPix> | undefined;
  if (!v?.chave || !v.nome || !v.cidade) return null;
  return { chave: v.chave, nome: v.nome, cidade: v.cidade };
}

export async function salvarRecebedorPix(dados: DadosRecebedorPix, ator: Ator) {
  // Valida montando o payload: se o QR nao sai aqui, nao sai na hora de cobrar.
  montarPayloadPix({ ...dados, valor: 100 });

  await prisma.setting.upsert({
    where: { key: CHAVE_PIX },
    update: { value: dados },
    create: { key: CHAVE_PIX, value: dados },
  });

  await registrarAuditoria({
    entityType: "setting",
    entityId: CHAVE_PIX,
    action: "pix_recebedor_salvo",
    actorType: ator.tipo,
    actorUserId: ator.usuarioId ?? null,
    actorName: ator.nome ?? null,
    // A chave nao vai para a auditoria: e dado de pagamento.
    metadata: { nome: dados.nome, cidade: dados.cidade },
  });
}

export async function salvarLimitePadrao(valor: number, ator: Ator) {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new ErroDeRegra("O limite de aviso precisa ser maior que zero.");
  }
  await prisma.setting.upsert({
    where: { key: CHAVE_LIMITE_SALDO },
    update: { value: valor },
    create: { key: CHAVE_LIMITE_SALDO, value: valor },
  });
  await registrarAuditoria({
    entityType: "setting",
    entityId: CHAVE_LIMITE_SALDO,
    action: "limite_saldo_salvo",
    actorType: ator.tipo,
    actorUserId: ator.usuarioId ?? null,
    actorName: ator.nome ?? null,
    metadata: { valor },
  });
}

export async function registrarRecarga(input: {
  clienteId: string;
  valor: number;
  quando?: Date;
  observacao?: string | null;
  ator: Ator;
}) {
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    throw new ErroDeRegra("Informe o valor da recarga.");
  }

  const recarga = await prisma.adAccountTopUp.create({
    data: {
      clientId: input.clienteId,
      amount: input.valor,
      occurredAt: input.quando ?? new Date(),
      note: input.observacao?.trim() || null,
      createdById: input.ator.usuarioId ?? null,
    },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: input.clienteId,
    action: "recarga_registrada",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { valor: input.valor },
  });

  return recarga;
}

/** Clientes acompanhados que ja estao no limite - o que o painel avisa. */
export async function clientesComSaldoBaixo(): Promise<SaldoDoCliente[]> {
  const clientes = await prisma.client.findMany({
    where: { active: true },
    select: { id: true },
  });

  const saldos = await Promise.all(clientes.map((c) => saldoDoCliente(c.id)));
  return saldos
    .filter((s) => s.acompanhando && s.abaixoDoLimite)
    .sort((a, b) => a.saldo - b.saldo);
}

/**
 * Cobranca pronta para mandar ao cliente: o codigo copia e cola e o QR.
 *
 * O valor sugerido e o que falta para voltar ao patamar da ultima recarga -
 * se a equipe recarregou R$ 500 e sobraram R$ 60, sugere R$ 440. Arredonda
 * para cima em dezenas, porque ninguem pede R$ 437,13.
 */
export async function cobrancaDeRecarga(input: {
  clienteId: string;
  valor?: number | null;
}): Promise<{ payload: string; qrSvg: string; valor: number | null; recebedor: DadosRecebedorPix }> {
  const recebedor = await obterRecebedorPix();
  if (!recebedor) {
    throw new ErroDeRegra(
      "Configure a chave PIX da VORA em Configuracoes antes de gerar a cobranca.",
    );
  }

  const cliente = await prisma.client.findUniqueOrThrow({
    where: { id: input.clienteId },
    select: { slug: true },
  });

  const valor = input.valor && input.valor > 0 ? Number(input.valor.toFixed(2)) : null;

  const payload = montarPayloadPix({
    ...recebedor,
    valor,
    txid: `${cliente.slug}${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
  });

  const QRCode = (await import("qrcode")).default;
  const qrSvg = await QRCode.toString(payload, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  return { payload, qrSvg, valor, recebedor };
}

/** Sugestao de quanto pedir: recompor o patamar da ultima recarga. */
export function valorSugerido(saldo: SaldoDoCliente, ultimaRecargaValor: number): number {
  const falta = Math.max(ultimaRecargaValor - saldo.saldo, 0);
  return Math.max(50, Math.ceil(falta / 10) * 10);
}

export async function obterConfiguracoesDeSaldo() {
  const [limite, recebedor, config] = await Promise.all([
    obterLimitePadrao(),
    obterRecebedorPix(),
    obterConfiguracoes(),
  ]);
  return { limite, recebedor, canalInterno: config.canalInterno };
}
