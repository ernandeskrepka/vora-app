import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { storage } from "@/lib/storage/index.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { processarArquivo, type ArquivoRecebido } from "@/lib/media/processar.ts";
import { MIME_IMAGEM_ACEITOS, MIME_VIDEO_ACEITOS } from "@/domain/formatos.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

const log = logger("materiais");

const MIME_DOCUMENTO = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const TAMANHO_MAXIMO = 200 * 1024 * 1024;

/** Chave do arquivo na biblioteca do cliente (separada das chaves dos posts). */
function chaveDeMaterial(slug: string, id: string, extensao: string) {
  return `clientes/${slug}/materiais/${id}.${extensao}`;
}

/**
 * Biblioteca do cliente: tudo que a equipe vai juntando ao longo do mes
 * (fotos do fotografo, artes prontas, briefing em PDF) antes de montar o post.
 */
export async function adicionarMateriais(input: {
  clientId: string;
  arquivos: ArquivoRecebido[];
  label?: string | null;
  ator: Ator;
}) {
  const cliente = await prisma.client.findUniqueOrThrow({ where: { id: input.clientId } });
  if (input.arquivos.length === 0) throw new ErroDeRegra("Escolha ao menos um arquivo.");

  const criados = [];

  for (const arquivo of input.arquivos) {
    if (arquivo.conteudo.byteLength > TAMANHO_MAXIMO) {
      throw new ErroDeRegra(`"${arquivo.nome}" passa de 200 MB.`);
    }

    const mime = arquivo.mimeType.toLowerCase();
    const ehMidia = MIME_IMAGEM_ACEITOS.includes(mime) || MIME_VIDEO_ACEITOS.includes(mime);

    if (!ehMidia && !MIME_DOCUMENTO.includes(mime)) {
      throw new ErroDeRegra(
        `"${arquivo.nome}": tipo nao aceito (${arquivo.mimeType}). Aceitos: imagem, video, PDF e documento de texto.`,
      );
    }

    const id = crypto.randomUUID();

    if (ehMidia) {
      // Mesma esteira do post: imagem vira JPEG, video tem duracao medida.
      const midia = await processarArquivo(arquivo);
      const key = chaveDeMaterial(cliente.slug, id, midia.extensao);
      await storage.salvar(key, midia.conteudo, midia.mimeType);
      criados.push(
        await prisma.clientAsset.create({
          data: {
            id,
            clientId: cliente.id,
            kind: midia.kind,
            storageKey: key,
            mimeType: midia.mimeType,
            sizeBytes: midia.sizeBytes,
            width: midia.width,
            height: midia.height,
            durationSeconds: midia.durationSeconds,
            originalFilename: midia.originalFilename,
            label: input.label ?? null,
            uploadedById: input.ator.usuarioId ?? null,
          },
        }),
      );
    } else {
      const extensao = arquivo.nome.split(".").pop()?.toLowerCase() || "bin";
      const key = chaveDeMaterial(cliente.slug, id, extensao);
      await storage.salvar(key, arquivo.conteudo, arquivo.mimeType);
      criados.push(
        await prisma.clientAsset.create({
          data: {
            id,
            clientId: cliente.id,
            kind: "DOCUMENTO",
            storageKey: key,
            mimeType: arquivo.mimeType,
            sizeBytes: arquivo.conteudo.byteLength,
            originalFilename: arquivo.nome,
            label: input.label ?? null,
            uploadedById: input.ator.usuarioId ?? null,
          },
        }),
      );
    }
  }

  await registrarAuditoria({
    entityType: "client",
    entityId: cliente.id,
    action: "materiais_adicionados",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { arquivos: criados.length },
  });

  log.info("materiais adicionados", { clientId: cliente.id, arquivos: criados.length });
  return criados;
}

export async function listarMateriais(clientId: string) {
  const itens = await prisma.clientAsset.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    itens.map(async (item) => ({
      ...item,
      url: item.kind === "DOCUMENTO" ? null : await storage.urlTemporaria(item.storageKey),
    })),
  );
}

export async function removerMaterial(input: { assetId: string; ator: Ator }) {
  const item = await prisma.clientAsset.findUniqueOrThrow({ where: { id: input.assetId } });
  await prisma.clientAsset.delete({ where: { id: item.id } });
  await storage.remover(item.storageKey).catch(() => undefined);

  await registrarAuditoria({
    entityType: "client",
    entityId: item.clientId,
    action: "material_removido",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { arquivo: item.originalFilename },
  });
}
