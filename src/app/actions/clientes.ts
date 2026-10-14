"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contextoDaRequisicao, exigirUsuario } from "@/lib/auth.ts";
import {
  adicionarContato,
  atualizarCliente,
  criarCliente,
  removerContato,
} from "@/services/clientes.ts";
import { salvarConexao, verificarConexao } from "@/services/conexoes.ts";
import { ErroDeRegra } from "@/services/erros.ts";
import type { Ator } from "@/services/transicoes.ts";
import type { MetaAssetType, MetaAuthMode } from "@/lib/tipos.ts";

export type EstadoSimples = { erro?: string; sucesso?: string } | null;

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

function mensagem(erro: unknown) {
  if (erro instanceof ErroDeRegra) return erro.message;
  return erro instanceof Error
    ? erro.message
    : "Nao foi possivel concluir a acao.";
}

export async function acaoCriarCliente(
  _estado: EstadoSimples,
  dados: FormData,
): Promise<EstadoSimples> {
  const ator = await atorAtual();
  let id: string;
  try {
    const cliente = await criarCliente({
      nome: String(dados.get("nome") ?? ""),
      notas: String(dados.get("notas") ?? ""),
      contatos: [
        {
          nome: String(dados.get("contatoNome") ?? ""),
          telefone: String(dados.get("contatoTelefone") ?? ""),
          aprovador: true,
          lembretes: true,
        },
      ],
      ator,
    });
    id = cliente.id;
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
  revalidatePath("/clientes");
  redirect(`/clientes/${id}`);
}

export async function acaoAtualizarCliente(dados: FormData) {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  await atualizarCliente({
    clienteId,
    nome: String(dados.get("nome") ?? "") || undefined,
    notas: String(dados.get("notas") ?? ""),
    ativo: dados.get("ativo") === "sim",
    notionPageId: String(dados.get("notionPageId") ?? ""),
    ator,
  });
  revalidatePath(`/clientes/${clienteId}`);
}

/**
 * Puxa o calendario do cliente no Notion para o planejamento.
 * Nao mexe no que ja virou post: mudar data de post agendado passa pelo
 * reagendamento, que invalida a aprovacao.
 */
export async function acaoSincronizarNotion(
  _estado: EstadoSimples,
  dados: FormData,
): Promise<EstadoSimples> {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  try {
    const { sincronizarCalendarioDoNotion } =
      await import("@/services/notion-planejamento.ts");
    const criarPostos = dados.get("criarPostos") === "sim";
    const hora = Number(String(dados.get("hora") ?? "9"));
    const r = await sincronizarCalendarioDoNotion({
      clienteId,
      ator,
      criarPostos,
      hora: Number.isFinite(hora) && hora >= 0 && hora <= 23 ? hora : 9,
    });
    revalidatePath(`/clientes/${clienteId}/planejamento`);
    revalidatePath(`/clientes/${clienteId}`);
    return {
      sucesso:
        `Notion lido: ${r.lidos} dia(s) no cronograma, ${r.criados} pauta(s) nova(s), ` +
        `${r.atualizados} atualizada(s)` +
        (r.postosNoCalendario > 0
          ? `, ${r.postosNoCalendario} no calendario`
          : "") +
        (r.noPassado > 0
          ? `, ${r.noPassado} de dia que ja passou (ficaram so como pauta)`
          : "") +
        (r.jaEramPost > 0
          ? `, ${r.jaEramPost} ja eram post e ficaram como estao`
          : "") +
        ".",
    };
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
}

export async function acaoAdicionarContato(
  _estado: EstadoSimples,
  dados: FormData,
): Promise<EstadoSimples> {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  try {
    await adicionarContato({
      clienteId,
      nome: String(dados.get("nome") ?? ""),
      telefone: String(dados.get("telefone") ?? ""),
      aprovador: dados.get("aprovador") === "sim",
      lembretes: dados.get("lembretes") === "sim",
      ator,
    });
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { sucesso: "Contato adicionado." };
}

export async function acaoRemoverContato(dados: FormData) {
  const ator = await atorAtual();
  await removerContato({
    contatoId: String(dados.get("contatoId") ?? ""),
    ator,
  });
  revalidatePath(`/clientes/${String(dados.get("clienteId") ?? "")}`);
}

export async function acaoSalvarConexao(
  _estado: EstadoSimples,
  dados: FormData,
): Promise<EstadoSimples> {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  try {
    await salvarConexao({
      clientId: clienteId,
      assetType: String(dados.get("assetType") ?? "INSTAGRAM") as MetaAssetType,
      assetId: String(dados.get("assetId") ?? ""),
      assetName: String(dados.get("assetName") ?? "") || null,
      authMode: String(dados.get("authMode") ?? "SYSTEM_USER") as MetaAuthMode,
      token: String(dados.get("token") ?? "") || null,
      ator,
    });
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
  revalidatePath("/conexoes");
  revalidatePath(`/clientes/${clienteId}`);
  return { sucesso: "Conexao salva e testada." };
}

export async function acaoTestarConexao(dados: FormData) {
  await exigirUsuario();
  await verificarConexao(String(dados.get("conexaoId") ?? ""));
  revalidatePath("/conexoes");
}
