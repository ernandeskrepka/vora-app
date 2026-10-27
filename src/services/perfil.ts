import { prisma } from "@/lib/db.ts";
import { storage } from "@/lib/storage/index.ts";
import { legendaVisivel } from "@/domain/legenda.ts";
import { primeiroNome } from "@/domain/equipe.ts";

/** Status que ainda vao para o feed: entram na previa como "a caminho". */
export const STATUS_A_CAMINHO = [
  "RASCUNHO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "PUBLICANDO",
] as const;

export type ItemDaPrevia = {
  id: string;
  url: string | null;
  video: boolean;
  carrossel: boolean;
  legenda: string;
  quando: Date;
  status: string;
  publicado: boolean;
  /** So na visao interna: quem subiu a arte e quando. */
  arte?: { por: string | null; em: Date } | null;
};

export type PreviaDoPerfil = {
  cliente: { id: string; nome: string; fuso: string };
  handle: string;
  iniciais: string;
  /** Grade na ordem do feed: o que entra depois aparece primeiro. */
  grade: ItemDaPrevia[];
  publicados: number;
  aCaminho: ItemDaPrevia[];
  /** Ultima vez que alguem subiu arte para esse cliente. */
  atualizadoEm: Date | null;
};

/** Monta um @ a partir do nome enquanto o Instagram nao estiver conectado. */
export function handleDoCliente(nome: string, assetName?: string | null): string {
  if (assetName?.startsWith("@")) return assetName;
  const base = (assetName ?? nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return `@${base}`;
}

export function iniciaisDoNome(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * A previa do perfil: publicados + o que esta a caminho, na ordem do feed.
 *
 * Na visao do cliente (interno=false) so entra post a caminho que ja tem
 * arte, e nada de status, versao ou quem subiu: ele ve o perfil tomando
 * forma conforme a equipe sobe o planejamento, e so isso.
 */
export async function montarPrevia(input: {
  clienteId: string;
  interno: boolean;
}): Promise<PreviaDoPerfil | null> {
  const cliente = await prisma.client.findUnique({
    where: { id: input.clienteId },
    include: { metaConnections: true },
  });
  if (!cliente) return null;

  const incluirMidia = {
    media: {
      orderBy: { position: "asc" as const },
      include: { uploadedBy: { select: { name: true } } },
    },
  };

  const [publicados, planejados] = await Promise.all([
    prisma.post.findMany({
      where: { clientId: cliente.id, status: "PUBLICADO" },
      include: incluirMidia,
      orderBy: { publishedAt: "desc" },
      take: 12,
    }),
    prisma.post.findMany({
      where: { clientId: cliente.id, status: { in: [...STATUS_A_CAMINHO] } },
      include: incluirMidia,
      orderBy: { scheduledAt: "asc" },
      take: 12,
    }),
  ]);

  const paraItem = async (p: (typeof publicados)[number], publicado: boolean): Promise<ItemDaPrevia> => {
    const capa = p.media[0];
    return {
      id: p.id,
      url: capa ? await storage.urlTemporaria(capa.storageKey) : null,
      video: capa?.kind === "VIDEO",
      carrossel: p.media.length > 1,
      legenda: legendaVisivel(p.caption),
      quando: publicado ? (p.publishedAt ?? p.scheduledAt) : p.scheduledAt,
      status: p.status,
      publicado,
      arte: input.interno
        ? capa
          ? { por: capa.uploadedBy ? primeiroNome(capa.uploadedBy.name) : null, em: capa.createdAt }
          : null
        : undefined,
    };
  };

  const aCaminhoTodos = await Promise.all(planejados.map((p) => paraItem(p, false)));
  // O cliente so ve o que ja tem arte.
  const aCaminho = input.interno ? aCaminhoTodos : aCaminhoTodos.filter((i) => i.url);
  const gradePublicados = await Promise.all(publicados.map((p) => paraItem(p, true)));

  const instagram = cliente.metaConnections.find((c) => c.assetType === "INSTAGRAM");
  const ultimaArte = [...publicados, ...planejados]
    .flatMap((p) => p.media.map((m) => m.createdAt.getTime()))
    .reduce((maior, t) => Math.max(maior, t), 0);

  return {
    cliente: { id: cliente.id, nome: cliente.name, fuso: cliente.timezone },
    handle: handleDoCliente(cliente.name, instagram?.assetName),
    iniciais: iniciaisDoNome(cliente.name),
    grade: [...[...aCaminho].reverse(), ...gradePublicados],
    publicados: gradePublicados.length,
    aCaminho,
    atualizadoEm: ultimaArte ? new Date(ultimaArte) : null,
  };
}
