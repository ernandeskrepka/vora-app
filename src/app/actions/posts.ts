"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contextoDaRequisicao, exigirUsuario } from "@/lib/auth.ts";
import { doFusoParaUtc } from "@/lib/datetime.ts";
import type { ArquivoRecebido } from "@/lib/media/processar.ts";
import {
  atualizarPost,
  cancelarPost,
  criarPost,
  enviarParaAprovacao,
  reagendarPost,
  reenviarLinkDeAprovacao,
} from "@/services/posts.ts";
import { marcarPautaComoPost } from "@/services/planejamento.ts";
import { ErroDeRegra } from "@/services/erros.ts";
import type { Ator } from "@/services/transicoes.ts";

export type EstadoFormulario = {
  erro?: string;
  problemas?: string[];
  avisos?: string[];
  sucesso?: string;
} | null;

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

const esquemaPost = z.object({
  clientId: z.string().min(1, "Escolha o cliente."),
  caption: z.string().max(2200, "A legenda passou de 2200 caracteres."),
  formato: z.enum(["IMAGEM_UNICA", "CARROSSEL", "VIDEO", "REELS"]),
  networks: z.array(z.enum(["INSTAGRAM", "FACEBOOK"])).min(1, "Escolha ao menos uma rede."),
  dataHora: z.string().min(1, "Informe a data e a hora."),
});

async function lerArquivos(dados: FormData): Promise<ArquivoRecebido[]> {
  const brutos = dados.getAll("arquivos").filter((a): a is File => a instanceof File && a.size > 0);
  const arquivos: ArquivoRecebido[] = [];
  for (const arquivo of brutos) {
    arquivos.push({
      nome: arquivo.name,
      mimeType: arquivo.type || "application/octet-stream",
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
  }
  return arquivos;
}

function traduzirErro(erro: unknown): EstadoFormulario {
  if (erro instanceof ErroDeRegra) {
    return { erro: erro.message, problemas: erro.problemas.map((p) => p.mensagem) };
  }
  if (erro instanceof Error) return { erro: erro.message };
  return { erro: "Nao foi possivel concluir a acao." };
}

export async function acaoCriarPost(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorAtual();

  const analise = esquemaPost.safeParse({
    clientId: dados.get("clientId"),
    caption: String(dados.get("caption") ?? ""),
    formato: dados.get("formato"),
    networks: dados.getAll("networks"),
    dataHora: dados.get("dataHora"),
  });
  if (!analise.success) {
    return { erro: "Revise o formulario.", problemas: analise.error.issues.map((i) => i.message) };
  }

  const arquivos = await lerArquivos(dados);
  const materiaisIds = dados.getAll("materiais").map(String).filter(Boolean);
  if (arquivos.length === 0 && materiaisIds.length === 0) {
    return { erro: "Suba um arquivo ou escolha um material da biblioteca do cliente." };
  }

  const pautaId = String(dados.get("pautaId") ?? "");
  const enviarAgora = dados.get("enviarAprovacao") === "sim";

  let postId: string;
  try {
    const r = await criarPost({
      dados: {
        clientId: analise.data.clientId,
        caption: analise.data.caption,
        formato: analise.data.formato,
        networks: analise.data.networks,
        scheduledAt: doFusoParaUtc(analise.data.dataHora),
      },
      arquivos,
      materiaisIds,
      ator,
    });
    postId = r.postId;

    if (pautaId) {
      await marcarPautaComoPost({ pautaId, postId, ator });
    }

    if (enviarAgora) {
      await enviarParaAprovacao({ postId, ator, motivo: "primeiro_envio" });
    }
  } catch (erro) {
    return traduzirErro(erro);
  }

  revalidatePath("/");
  revalidatePath("/calendario");
  redirect(`/posts/${postId}`);
}

export async function acaoAtualizarPost(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorAtual();
  const postId = String(dados.get("postId") ?? "");
  if (!postId) return { erro: "Post nao informado." };

  const analise = esquemaPost.omit({ clientId: true }).safeParse({
    caption: String(dados.get("caption") ?? ""),
    formato: dados.get("formato"),
    networks: dados.getAll("networks"),
    dataHora: dados.get("dataHora"),
  });
  if (!analise.success) {
    return { erro: "Revise o formulario.", problemas: analise.error.issues.map((i) => i.message) };
  }

  const arquivos = await lerArquivos(dados);

  try {
    await atualizarPost({
      postId,
      dados: {
        caption: analise.data.caption,
        formato: analise.data.formato,
        networks: analise.data.networks,
        scheduledAt: doFusoParaUtc(analise.data.dataHora),
      },
      arquivos: arquivos.length > 0 ? arquivos : undefined,
      ator,
    });
  } catch (erro) {
    return traduzirErro(erro);
  }

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/");
  redirect(`/posts/${postId}`);
}

export async function acaoEnviarAprovacao(dados: FormData) {
  const ator = await atorAtual();
  const postId = String(dados.get("postId") ?? "");
  await enviarParaAprovacao({ postId, ator, motivo: "primeiro_envio" });
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/");
}

export async function acaoReenviarLink(dados: FormData) {
  const ator = await atorAtual();
  const postId = String(dados.get("postId") ?? "");
  await reenviarLinkDeAprovacao({ postId, ator });
  revalidatePath(`/posts/${postId}`);
}

export async function acaoReagendar(dados: FormData) {
  const ator = await atorAtual();
  const postId = String(dados.get("postId") ?? "");
  const dataHora = String(dados.get("dataHora") ?? "");
  await reagendarPost({ postId, novaData: doFusoParaUtc(dataHora), ator });
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/calendario");
}

export async function acaoCancelarPost(dados: FormData) {
  const ator = await atorAtual();
  const postId = String(dados.get("postId") ?? "");
  await cancelarPost({ postId, ator, motivo: String(dados.get("motivo") ?? "") || undefined });
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/");
}
