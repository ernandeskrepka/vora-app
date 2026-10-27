"use server";

import { revalidatePath } from "next/cache";
import { contextoDaRequisicao, exigirAdmin, exigirUsuario } from "@/lib/auth.ts";
import { NotionNaoConfigurado } from "@/lib/notion/client.ts";
import { ErroDeRegra } from "@/services/erros.ts";
import { adicionarBase, removerBase, sincronizarTarefas } from "@/services/tarefas-notion.ts";
import type { Ator } from "@/services/transicoes.ts";

export type EstadoTarefas = { erro?: string; sucesso?: string } | null;

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

/** Botao do dashboard: rele as bases do Notion agora. */
export async function acaoSincronizarTarefas(
  _estado: EstadoTarefas,
  _dados: FormData,
): Promise<EstadoTarefas> {
  const ator = await atorAtual();
  try {
    const r = await sincronizarTarefas({ ator });
    revalidatePath("/");
    if (r.bases === 0) {
      return {
        erro: "Nenhuma base do Notion configurada. Em Configuracoes, cole o link da base de tarefas.",
      };
    }
    const falhas = r.falhas.length ? ` ${r.falhas.length} base(s) nao puderam ser lidas: ${r.falhas.map((f) => f.base).join(", ")}.` : "";
    return {
      sucesso: `${r.lidas} tarefa(s) lidas de ${r.bases} base(s): ${r.novas} nova(s), ${r.atualizadas} atualizada(s).${falhas}`,
    };
  } catch (erro) {
    if (erro instanceof NotionNaoConfigurado) return { erro: erro.message };
    return { erro: erro instanceof Error ? erro.message : "Nao foi possivel sincronizar." };
  }
}

export async function acaoAdicionarBase(
  _estado: EstadoTarefas,
  dados: FormData,
): Promise<EstadoTarefas> {
  await exigirAdmin();
  const ator = await atorAtual();
  try {
    const base = await adicionarBase({
      entrada: String(dados.get("link") ?? ""),
      nome: String(dados.get("nome") ?? "") || null,
      ator,
    });
    // Ja le na hora, para o dashboard nao ficar vazio.
    await sincronizarTarefas({ ator }).catch(() => undefined);
    revalidatePath("/configuracoes");
    revalidatePath("/");
    return { sucesso: `Base "${base.nome}" adicionada e lida.` };
  } catch (erro) {
    return { erro: erro instanceof ErroDeRegra ? erro.message : "Nao foi possivel adicionar a base." };
  }
}

export async function acaoRemoverBase(dados: FormData) {
  await exigirAdmin();
  const ator = await atorAtual();
  await removerBase({ id: String(dados.get("id") ?? ""), ator });
  revalidatePath("/configuracoes");
  revalidatePath("/");
}
