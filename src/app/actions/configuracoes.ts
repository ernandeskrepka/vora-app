"use server";

import { revalidatePath } from "next/cache";
import { contextoDaRequisicao, exigirAdmin, exigirUsuario } from "@/lib/auth.ts";
import { prisma } from "@/lib/db.ts";
import { hashSenha } from "@/lib/crypto.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { salvarConfiguracoes, type CanalInterno } from "@/services/configuracoes.ts";
import { ErroDeRegra } from "@/services/erros.ts";
import type { Ator } from "@/services/transicoes.ts";
import type { EstadoSimples } from "./clientes.ts";

export type EstadoConfig = { erro?: string; sucesso?: string } | null;

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
  const admin = await exigirAdmin();
  const nome = String(dados.get("nome") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const senha = String(dados.get("senha") ?? "");
  const papel = String(dados.get("papel") ?? "EDITOR") === "ADMIN" ? "ADMIN" : "EDITOR";

  if (nome.length < 2) return { erro: "Informe o nome." };
  if (!email.includes("@")) return { erro: "E-mail invalido." };
  if (senha.length < 10) return { erro: "A senha precisa ter pelo menos 10 caracteres." };
  if (await prisma.user.findUnique({ where: { email } })) {
    return { erro: "Ja existe usuario com esse e-mail." };
  }

  const usuario = await prisma.user.create({
    data: { name: nome, email, passwordHash: hashSenha(senha), role: papel },
  });

  await registrarAuditoria({
    entityType: "user",
    entityId: usuario.id,
    action: "usuario_criado",
    actorType: "USUARIO",
    actorUserId: admin.id,
    actorName: admin.name,
    metadata: { email, papel },
  });

  revalidatePath("/configuracoes");
  return { sucesso: `Usuario ${email} criado.` };
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
