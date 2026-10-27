"use server";

import { revalidatePath } from "next/cache";
import {
  contextoDaRequisicao,
  exigirAdmin,
  exigirUsuario,
  hashDaSessaoAtual,
} from "@/lib/auth.ts";
import { prisma } from "@/lib/db.ts";
import { salvarConfiguracoes, type CanalInterno } from "@/services/configuracoes.ts";
import { ErroDeRegra } from "@/services/erros.ts";
import {
  atualizarFuncao,
  criarEquipeInicial,
  criarUsuario,
  normalizarFuncao,
  redefinirSenha,
  trocarSenha,
} from "@/services/equipe.ts";
import type { Ator } from "@/services/transicoes.ts";
import type { EstadoSimples } from "./clientes.ts";

export type EstadoConfig = { erro?: string; sucesso?: string } | null;

async function atorAtual(): Promise<Ator> {
  const usuario = await exigirUsuario({ permitirSenhaPendente: true });
  const contexto = await contextoDaRequisicao();
  return {
    tipo: "USUARIO",
    usuarioId: usuario.id,
    nome: usuario.name,
    ipAddress: contexto.ipAddress,
    userAgent: contexto.userAgent,
  };
}

export async function acaoSalvarConfiguracoes(
  _estado: EstadoConfig,
  dados: FormData,
): Promise<EstadoConfig> {
  const ator = await atorAtual();
  const horas = String(dados.get("lembretes") ?? "")
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));

  try {
    await salvarConfiguracoes({
      lembretesHoras: horas,
      canalInterno: String(dados.get("canal") ?? "log") as CanalInterno,
      ator,
    });
  } catch (erro) {
    return { erro: erro instanceof ErroDeRegra ? erro.message : "Nao foi possivel salvar." };
  }

  revalidatePath("/configuracoes");
  return { sucesso: "Configuracoes salvas. Valem para os proximos agendamentos." };
}

export async function acaoCriarUsuario(
  _estado: EstadoConfig,
  dados: FormData,
): Promise<EstadoConfig> {
  await exigirAdmin();
  const ator = await atorAtual();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  try {
    await criarUsuario({
      nome: String(dados.get("nome") ?? ""),
      email,
      senha: String(dados.get("senha") ?? ""),
      funcao: normalizarFuncao(String(dados.get("funcao") ?? "")),
      trocarSenhaNoPrimeiroAcesso: true,
      ator,
    });
  } catch (erro) {
    return { erro: erro instanceof ErroDeRegra ? erro.message : "Nao foi possivel criar." };
  }

  revalidatePath("/configuracoes");
  return { sucesso: `Usuario ${email} criado. Na primeira entrada ele troca a senha.` };
}

export async function acaoCriarEquipe(
  _estado: EstadoConfig,
  _dados: FormData,
): Promise<EstadoConfig> {
  await exigirAdmin();
  const ator = await atorAtual();
  const r = await criarEquipeInicial({ sufixo: String(new Date().getFullYear()), ator });
  revalidatePath("/configuracoes");
  if (r.criados.length === 0) return { sucesso: "A equipe ja esta cadastrada." };
  return {
    sucesso:
      "Contas criadas (senha inicial, trocar na primeira entrada): " +
      r.criados.map((p) => `${p.email} = ${p.senha}`).join(" · "),
  };
}

export async function acaoAlterarFuncao(dados: FormData) {
  await exigirAdmin();
  const ator = await atorAtual();
  await atualizarFuncao({
    usuarioId: String(dados.get("usuarioId") ?? ""),
    funcao: normalizarFuncao(String(dados.get("funcao") ?? "")),
    ator,
  });
  revalidatePath("/configuracoes");
}

export async function acaoRedefinirSenha(
  _estado: EstadoConfig,
  dados: FormData,
): Promise<EstadoConfig> {
  await exigirAdmin();
  const ator = await atorAtual();
  try {
    await redefinirSenha({
      usuarioId: String(dados.get("usuarioId") ?? ""),
      novaSenha: String(dados.get("senha") ?? ""),
      ator,
    });
  } catch (erro) {
    return { erro: erro instanceof ErroDeRegra ? erro.message : "Nao foi possivel redefinir." };
  }
  revalidatePath("/configuracoes");
  return { sucesso: "Senha redefinida. A pessoa troca na proxima entrada." };
}

export async function acaoTrocarSenha(
  _estado: EstadoConfig,
  dados: FormData,
): Promise<EstadoConfig> {
  const usuario = await exigirUsuario({ permitirSenhaPendente: true });
  const ator = await atorAtual();
  try {
    await trocarSenha({
      usuarioId: usuario.id,
      senhaAtual: String(dados.get("senhaAtual") ?? ""),
      novaSenha: String(dados.get("novaSenha") ?? ""),
      manterSessaoTokenHash: await hashDaSessaoAtual(),
      ator,
    });
  } catch (erro) {
    return { erro: erro instanceof ErroDeRegra ? erro.message : "Nao foi possivel trocar." };
  }
  revalidatePath("/", "layout");
  return { sucesso: "Senha trocada." };
}

export async function acaoAlternarUsuario(dados: FormData) {
  const admin = await exigirAdmin();
  const id = String(dados.get("usuarioId") ?? "");
  if (id === admin.id) return;

  const usuario = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { active: !usuario.active } });
  if (usuario.active) {
    // Desativar encerra as sessoes abertas.
    await prisma.session.deleteMany({ where: { userId: id } });
  }
  revalidatePath("/configuracoes");
}

/**
 * Carrega a carteira de clientes da agencia (dados/clientes-meta.json) para
 * dentro do banco. Idempotente: pode rodar de novo a cada cliente novo no
 * arquivo, sem duplicar nem mexer no que ja esta conectado.
 */
export async function acaoImportarCarteira(
  _estado: EstadoSimples,
  _dados: FormData,
): Promise<EstadoSimples> {
  const admin = await exigirAdmin();
  try {
    const { carregarCarteira } = await import("@/services/carteira-arquivo.ts");
    const { importarCarteira } = await import("@/services/importacao-carteira.ts");
    const carteira = await carregarCarteira();
    const r = await importarCarteira(carteira, {
      tipo: "USUARIO",
      usuarioId: admin.id,
      nome: admin.name,
    });
    revalidatePath("/configuracoes");
    revalidatePath("/clientes");
    return {
      sucesso:
        `Carteira importada: ${r.clientesCriados} cliente(s) novo(s), ` +
        `${r.clientesExistentes} ja existiam, ${r.ativosCriados} ativo(s) cadastrado(s) e ` +
        `${r.ativosAtualizados} atualizado(s).`,
    };
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

/**
 * Carrega a demonstracao: clientes, pauta, posts com material real, aprovacoes
 * registradas e numeros de anuncio. Para apresentar o sistema funcionando
 * antes da Meta estar ligada. Idempotente.
 */
export async function acaoCarregarDemonstracao(
  _estado: EstadoSimples,
  _dados: FormData,
): Promise<EstadoSimples> {
  const admin = await exigirAdmin();
  try {
    const { carregarDemonstracao } = await import("@/services/demonstracao.ts");
    const r = await carregarDemonstracao({
      tipo: "USUARIO",
      usuarioId: admin.id,
      nome: admin.name,
    });
    revalidatePath("/");
    revalidatePath("/clientes");
    revalidatePath("/calendario");
    revalidatePath("/configuracoes");
    return {
      sucesso:
        `Demonstracao carregada: ${r.postsCriados} post(s), ${r.pautasCriadas} pauta(s), ` +
        `${r.contatosCriados} contato(s) e ${r.diasDeAnuncio} dia(s) de metrica. ` +
        (r.ignorados > 0 ? `${r.ignorados} post(s) ja existiam e foram mantidos.` : ""),
    };
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
