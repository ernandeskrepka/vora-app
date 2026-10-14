import { prisma } from "@/lib/db.ts";
import { hashSenha } from "@/lib/crypto.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { gerarSlug } from "./clientes.ts";

/**
 * Primeira configuracao de uma instalacao nova (hospedagem).
 *
 * Cria o primeiro usuario e os clientes do piloto, e so roda enquanto nao
 * existir nenhum usuario: depois disso a rota recusa. Nao cria posts nem
 * material de exemplo - isso a equipe faz pela interface.
 */
export async function semearPrimeiroAcesso(input: { email: string; senha: string; nome?: string }) {
  const jaTemUsuario = await prisma.user.count();
  if (jaTemUsuario > 0) {
    return { criado: false, motivo: "Ja existe usuario: a configuracao inicial ja foi feita." };
  }
  if (!input.email.includes("@") || input.senha.length < 10) {
    return { criado: false, motivo: "Informe um e-mail valido e uma senha de 10 caracteres ou mais." };
  }

  const usuario = await prisma.user.create({
    data: {
      name: input.nome?.trim() || "Equipe VORA",
      email: input.email.trim().toLowerCase(),
      passwordHash: hashSenha(input.senha),
      role: "ADMIN",
    },
  });

  const pilotos = ["Danieli Moveis", "Dental Care", "Laboratorio Fleming"];
  for (const nome of pilotos) {
    await prisma.client.create({
      data: { name: nome, slug: gerarSlug(nome), notes: "Cliente do piloto." },
    });
  }

  await registrarAuditoria({
    entityType: "user",
    entityId: usuario.id,
    action: "primeiro_acesso",
    actorType: "SISTEMA",
    actorName: "configuracao inicial",
    metadata: { clientes: pilotos.length },
  });

  return { criado: true, usuario: usuario.email, clientes: pilotos.length };
}
