"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { dadosDaRequisicao } from "@/lib/audit.ts";
import { registrarDecisao } from "@/services/aprovacao.ts";
import { ErroDeRegra } from "@/services/erros.ts";

export type EstadoDecisao = {
  erro?: string;
  decidido?: "APROVADO" | "REPROVADO";
} | null;

/**
 * Decisao do cliente, a partir do link publico. Guarda nome, IP e user
 * agent na trilha de auditoria.
 */
export async function acaoDecidir(
  _estado: EstadoDecisao,
  dados: FormData,
): Promise<EstadoDecisao> {
  const token = String(dados.get("token") ?? "");
  const decisao = String(dados.get("decisao") ?? "");
  const nome = String(dados.get("nome") ?? "");
  const comentario = String(dados.get("comentario") ?? "");

  if (decisao !== "APROVADO" && decisao !== "REPROVADO") {
    return { erro: "Escolha aprovar ou reprovar." };
  }

  const contexto = dadosDaRequisicao(await headers());

  try {
    await registrarDecisao({
      token,
      nome,
      decisao,
      comentario,
      ipAddress: contexto.ipAddress,
      userAgent: contexto.userAgent,
    });
  } catch (erro) {
    return { erro: erro instanceof ErroDeRegra ? erro.message : "Nao foi possivel registrar." };
  }

  revalidatePath(`/aprovar/${token}`);
  return { decidido: decisao };
}
