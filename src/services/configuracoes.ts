import { env, reminderOffsetsHours } from "@/env";
import { prisma } from "@/lib/db.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

export const CHAVE_LEMBRETES = "lembretes_horas";
export const CHAVE_CANAL_INTERNO = "canal_notificacao_interna";

export type CanalInterno = "log" | "whatsapp" | "slack";

export type Configuracoes = {
  /** Horas antes do post em que o lembrete e enviado, da maior para a menor. */
  lembretesHoras: number[];
  canalInterno: CanalInterno;
  /** De onde veio cada valor, para a tela deixar claro. */
  origem: { lembretes: "banco" | "ambiente"; canal: "banco" | "ambiente" };
};

/**
 * Configuracao operacional: o valor do banco (tela de Configuracoes) tem
 * prioridade; se nao houver, vale a variavel de ambiente.
 */
export async function obterConfiguracoes(): Promise<Configuracoes> {
  const linhas = await prisma.setting.findMany({
    where: { key: { in: [CHAVE_LEMBRETES, CHAVE_CANAL_INTERNO] } },
  });

  const lembretesSalvos = linhas.find((l) => l.key === CHAVE_LEMBRETES)?.value as
    | number[]
    | undefined;
  const canalSalvo = linhas.find((l) => l.key === CHAVE_CANAL_INTERNO)?.value as
    | CanalInterno
    | undefined;

  return {
    lembretesHoras:
      Array.isArray(lembretesSalvos) && lembretesSalvos.length > 0
        ? [...lembretesSalvos].sort((a, b) => b - a)
        : reminderOffsetsHours,
    canalInterno: canalSalvo ?? env.INTERNAL_NOTIFY_CHANNEL,
    origem: {
      lembretes: Array.isArray(lembretesSalvos) && lembretesSalvos.length > 0 ? "banco" : "ambiente",
      canal: canalSalvo ? "banco" : "ambiente",
    },
  };
}

export async function salvarConfiguracoes(input: {
  lembretesHoras: number[];
  canalInterno: CanalInterno;
  ator: Ator;
}) {
  const horas = [...new Set(input.lembretesHoras)]
    .filter((h) => Number.isFinite(h) && h > 0 && h <= 720)
    .sort((a, b) => b - a);

  if (horas.length === 0) {
    throw new ErroDeRegra("Informe ao menos um horario de lembrete (em horas antes do post).");
  }

  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: CHAVE_LEMBRETES },
      create: { key: CHAVE_LEMBRETES, value: horas },
      update: { value: horas },
    }),
    prisma.setting.upsert({
      where: { key: CHAVE_CANAL_INTERNO },
      create: { key: CHAVE_CANAL_INTERNO, value: input.canalInterno },
      update: { value: input.canalInterno },
    }),
  ]);

  await registrarAuditoria({
    entityType: "user",
    entityId: input.ator.usuarioId ?? "sistema",
    action: "configuracoes_salvas",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { lembretesHoras: horas, canalInterno: input.canalInterno },
  });

  return { lembretesHoras: horas, canalInterno: input.canalInterno };
}
