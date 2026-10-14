import { prisma } from "@/lib/db.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { normalizarTelefone } from "@/lib/whatsapp/client.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

export function gerarSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function criarCliente(input: {
  nome: string;
  notas?: string | null;
  contatos: Array<{ nome: string; telefone: string; aprovador: boolean; lembretes: boolean }>;
  ator: Ator;
}) {
  const nome = input.nome.trim();
  if (nome.length < 2) throw new ErroDeRegra("Informe o nome do cliente.");

  let slug = gerarSlug(nome);
  if (!slug) throw new ErroDeRegra("Nome do cliente invalido.");
  if (await prisma.client.findUnique({ where: { slug } })) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const contatos = input.contatos
    .filter((c) => c.nome.trim() && c.telefone.trim())
    .map((c) => ({
      name: c.nome.trim(),
      phoneE164: normalizarTelefone(c.telefone),
      isApprover: c.aprovador,
      receivesReminders: c.lembretes,
    }));

  const cliente = await prisma.client.create({
    data: {
      name: nome,
      slug,
      notes: input.notas?.trim() || null,
      contacts: { create: contatos },
    },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: cliente.id,
    action: "cliente_criado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { nome, contatos: contatos.length },
  });

  return cliente;
}

export async function atualizarCliente(input: {
  clienteId: string;
  nome?: string;
  notas?: string | null;
  ativo?: boolean;
  notionPageId?: string | null;
  ator: Ator;
}) {
  const cliente = await prisma.client.update({
    where: { id: input.clienteId },
    data: {
      ...(input.nome ? { name: input.nome.trim() } : {}),
      ...(input.notas !== undefined ? { notes: input.notas?.trim() || null } : {}),
      ...(input.ativo !== undefined ? { active: input.ativo } : {}),
      ...(input.notionPageId !== undefined
        ? { notionPageId: input.notionPageId?.trim() || null }
        : {}),
    },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: cliente.id,
    action: "cliente_atualizado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
  });

  return cliente;
}

export async function adicionarContato(input: {
  clienteId: string;
  nome: string;
  telefone: string;
  aprovador: boolean;
  lembretes: boolean;
  ator: Ator;
}) {
  const telefone = normalizarTelefone(input.telefone);
  if (telefone.replace(/\D/g, "").length < 12) {
    throw new ErroDeRegra("Telefone invalido. Use DDD + numero, ex.: 49 99999-9999.");
  }
  if (!input.nome.trim()) throw new ErroDeRegra("Informe o nome do contato.");

  const existente = await prisma.clientContact.findUnique({
    where: { clientId_phoneE164: { clientId: input.clienteId, phoneE164: telefone } },
  });
  if (existente) throw new ErroDeRegra("Esse telefone ja esta cadastrado para o cliente.");

  const contato = await prisma.clientContact.create({
    data: {
      clientId: input.clienteId,
      name: input.nome.trim(),
      phoneE164: telefone,
      isApprover: input.aprovador,
      receivesReminders: input.lembretes,
    },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: input.clienteId,
    action: "contato_adicionado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { contato: telefone, aprovador: input.aprovador },
  });

  return contato;
}

export async function removerContato(input: { contatoId: string; ator: Ator }) {
  const contato = await prisma.clientContact.delete({ where: { id: input.contatoId } });
  await registrarAuditoria({
    entityType: "client",
    entityId: contato.clientId,
    action: "contato_removido",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { contato: contato.phoneE164 },
  });
}
