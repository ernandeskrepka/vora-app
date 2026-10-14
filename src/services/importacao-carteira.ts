import { prisma } from "@/lib/db.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { gerarSlug } from "./clientes.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";
import type { MetaAssetType } from "@/lib/tipos.ts";

export type AtivoDaCarteira = {
  tipo: MetaAssetType;
  id: string;
  nome?: string;
};

export type ClienteDaCarteira = {
  nome: string;
  slug?: string;
  ativos: AtivoDaCarteira[];
  pendencia?: string;
};

export type ResultadoImportacao = {
  clientesCriados: number;
  clientesExistentes: number;
  ativosCriados: number;
  ativosAtualizados: number;
  linhas: Array<{ cliente: string; situacao: string }>;
};

/**
 * Carrega a carteira da agencia (clientes e ativos da Meta) para dentro do
 * sistema.
 *
 * Idempotente de proposito: pode rodar quantas vezes quiser. Cria o que falta,
 * corrige o nome do ativo e **nunca** apaga nem troca um ativo ja conectado -
 * trocar o ID de um ativo que ja publicou quebraria o historico, entao isso
 * continua sendo decisao manual na tela de Conexoes.
 *
 * O token nao entra aqui: as conexoes nascem com authMode SYSTEM_USER e status
 * NAO_CONFIGURADO, e so viram CONECTADO depois do teste contra a Meta.
 */
export async function importarCarteira(
  clientes: ClienteDaCarteira[],
  ator: Ator,
): Promise<ResultadoImportacao> {
  if (!Array.isArray(clientes) || clientes.length === 0) {
    throw new ErroDeRegra("Nenhum cliente na carteira para importar.");
  }

  const r: ResultadoImportacao = {
    clientesCriados: 0,
    clientesExistentes: 0,
    ativosCriados: 0,
    ativosAtualizados: 0,
    linhas: [],
  };

  for (const entrada of clientes) {
    const nome = entrada.nome?.trim();
    if (!nome) continue;
    const slug = (entrada.slug?.trim() || gerarSlug(nome)).slice(0, 50);
    if (!slug) continue;

    let cliente = await prisma.client.findUnique({ where: { slug } });
    if (cliente) {
      r.clientesExistentes += 1;
    } else {
      cliente = await prisma.client.create({ data: { name: nome, slug } });
      r.clientesCriados += 1;
      await registrarAuditoria({
        entityType: "client",
        entityId: cliente.id,
        action: "cliente_criado",
        actorType: ator.tipo,
        actorUserId: ator.usuarioId ?? null,
        actorName: ator.nome ?? null,
        metadata: { nome, origem: "importacao_carteira" },
      });
    }

    const partes: string[] = [];
    for (const ativo of entrada.ativos ?? []) {
      const assetId = ativo.id?.trim();
      if (!assetId) continue;

      const existente = await prisma.metaConnection.findUnique({
        where: { clientId_assetType: { clientId: cliente.id, assetType: ativo.tipo } },
      });

      if (!existente) {
        await prisma.metaConnection.create({
          data: {
            clientId: cliente.id,
            assetType: ativo.tipo,
            assetId,
            assetName: ativo.nome?.trim() || null,
            authMode: "SYSTEM_USER",
            status: "NAO_CONFIGURADO",
          },
        });
        r.ativosCriados += 1;
        partes.push(`${ativo.tipo} cadastrado`);
        await registrarAuditoria({
          entityType: "meta_connection",
          entityId: cliente.id,
          action: "conexao_importada",
          actorType: ator.tipo,
          actorUserId: ator.usuarioId ?? null,
          actorName: ator.nome ?? null,
          metadata: { assetType: ativo.tipo, assetId },
        });
        continue;
      }

      if (existente.assetId !== assetId) {
        partes.push(`${ativo.tipo} ja conectado com outro ID (mantido ${existente.assetId})`);
        continue;
      }

      const nomeNovo = ativo.nome?.trim() || null;
      if (nomeNovo && nomeNovo !== existente.assetName) {
        await prisma.metaConnection.update({
          where: { id: existente.id },
          data: { assetName: nomeNovo },
        });
        r.ativosAtualizados += 1;
        partes.push(`${ativo.tipo} com nome atualizado`);
      }
    }

    if (entrada.pendencia) partes.push(`pendencia: ${entrada.pendencia}`);
    r.linhas.push({ cliente: nome, situacao: partes.length ? partes.join("; ") : "nada a fazer" });
  }

  return r;
}
