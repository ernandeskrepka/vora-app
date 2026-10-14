"use server";

import { revalidatePath } from "next/cache";
import { contextoDaRequisicao, exigirUsuario } from "@/lib/auth.ts";
import { doFusoParaUtc } from "@/lib/datetime.ts";
import { adicionarMateriais, removerMaterial } from "@/services/materiais.ts";
import { criarPauta, moverPauta, removerPauta } from "@/services/planejamento.ts";
import { ErroDeRegra } from "@/services/erros.ts";
import type { StatusPauta } from "@/domain/planejamento.ts";
import type { ArquivoRecebido } from "@/lib/media/processar.ts";
import type { Ator } from "@/services/transicoes.ts";

export type EstadoArea = { erro?: string; sucesso?: string } | null;

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
  return erro instanceof Error ? erro.message : "Nao foi possivel concluir a acao.";
}

/* ------------------------------------------------------------- pautas */

export async function acaoCriarPauta(_estado: EstadoArea, dados: FormData): Promise<EstadoArea> {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  const data = String(dados.get("data") ?? "");

  try {
    await criarPauta({
      clientId: clienteId,
      titulo: String(dados.get("titulo") ?? ""),
      notas: String(dados.get("notas") ?? ""),
      data: data ? doFusoParaUtc(`${data}T12:00`) : null,
      ator,
    });
  } catch (erro) {
    return { erro: mensagem(erro) };
  }

  revalidatePath(`/clientes/${clienteId}/planejamento`);
  revalidatePath(`/clientes/${clienteId}`);
  return { sucesso: "Pauta criada." };
}

export async function acaoMoverPauta(dados: FormData) {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  await moverPauta({
    pautaId: String(dados.get("pautaId") ?? ""),
    para: String(dados.get("para") ?? "IDEIA") as StatusPauta,
    ator,
  });
  revalidatePath(`/clientes/${clienteId}/planejamento`);
}

export async function acaoRemoverPauta(dados: FormData) {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  await removerPauta({ pautaId: String(dados.get("pautaId") ?? ""), ator });
  revalidatePath(`/clientes/${clienteId}/planejamento`);
}

/* ---------------------------------------------------------- materiais */

export async function acaoAdicionarMateriais(
  _estado: EstadoArea,
  dados: FormData,
): Promise<EstadoArea> {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");

  const brutos = dados.getAll("arquivos").filter((a): a is File => a instanceof File && a.size > 0);
  const arquivos: ArquivoRecebido[] = [];
  for (const arquivo of brutos) {
    arquivos.push({
      nome: arquivo.name,
      mimeType: arquivo.type || "application/octet-stream",
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
  }

  try {
    const criados = await adicionarMateriais({
      clientId: clienteId,
      arquivos,
      label: String(dados.get("rotulo") ?? "") || null,
      ator,
    });
    revalidatePath(`/clientes/${clienteId}/materiais`);
    revalidatePath(`/clientes/${clienteId}`);
    return { sucesso: `${criados.length} arquivo(s) na biblioteca.` };
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
}

export async function acaoRemoverMaterial(dados: FormData) {
  const ator = await atorAtual();
  const clienteId = String(dados.get("clienteId") ?? "");
  await removerMaterial({ assetId: String(dados.get("assetId") ?? ""), ator });
  revalidatePath(`/clientes/${clienteId}/materiais`);
}
