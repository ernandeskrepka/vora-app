"use server";

import { revalidatePath } from "next/cache";
import { contextoDaRequisicao, exigirAdmin, exigirUsuario } from "@/lib/auth.ts";
import type { Ator } from "@/services/transicoes.ts";
import { registrarRecarga, salvarLimitePadrao, salvarRecebedorPix } from "@/services/saldo.ts";
import type { EstadoSimples } from "./clientes.ts";

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

async function atorAtual(): Promise<Ator> {
  const usuario = await exigirUsuario();
  const contexto = await contextoDaRequisicao();
  return {
    tipo: "USUARIO",
    usuarioId: usuario.id,
    nome: usuario.name,
    ipAddress: contexto.ipAddress,
    userAgent: contexto.userAgent,
  };
}

export async function acaoRegistrarRecarga(
  _estado: EstadoSimples,
  dados: FormData,
): Promise<EstadoSimples> {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  const quando = String(dados.get("quando") ?? "");

  try {
    await registrarRecarga({
      clienteId,
      valor: Number(String(dados.get("valor") ?? "").replace(",", ".")),
      // O input de data vem sem hora: meio-dia evita a recarga cair no dia
      // anterior quando o navegador manda meia-noite UTC.
      quando: quando ? new Date(`${quando}T12:00:00`) : undefined,
      observacao: String(dados.get("observacao") ?? ""),
      ator,
    });
  } catch (erro) {
    return { erro: mensagem(erro) };
  }

  revalidatePath(`/clientes/${clienteId}/saldo`);
  revalidatePath("/");
  return { sucesso: "Recarga registrada." };
}

export async function acaoSalvarPix(
  _estado: EstadoSimples,
  dados: FormData,
): Promise<EstadoSimples> {
  const admin = await exigirAdmin();
  try {
    await salvarRecebedorPix(
      {
        chave: String(dados.get("chave") ?? "").trim(),
        nome: String(dados.get("nome") ?? "").trim(),
        cidade: String(dados.get("cidade") ?? "").trim(),
      },
      { tipo: "USUARIO", usuarioId: admin.id, nome: admin.name },
    );

    const limite = Number(String(dados.get("limite") ?? "").replace(",", "."));
    if (Number.isFinite(limite) && limite > 0) {
      await salvarLimitePadrao(limite, {
        tipo: "USUARIO",
        usuarioId: admin.id,
        nome: admin.name,
      });
    }
  } catch (erro) {
    return { erro: mensagem(erro) };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/");
  return { sucesso: "PIX e limite de aviso salvos." };
}
