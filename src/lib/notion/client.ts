import { env } from "@/env";
import { logger } from "@/lib/logger.ts";

const log = logger("notion");
const BASE = "https://api.notion.com/v1";
const VERSAO = "2022-06-28";

export class NotionNaoConfigurado extends Error {
  constructor() {
    super("NOTION_TOKEN nao configurado: crie a integracao interna no Notion e compartilhe as paginas com ela.");
  }
}

export class NotionErro extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

/** Aceita link completo do Notion ou o ID solto, com ou sem hifen. */
export function idDaPagina(entrada: string): string | null {
  const limpo = entrada.trim();
  if (!limpo) return null;
  const achado = limpo.match(/[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (!achado) return null;
  const so = achado[0].replace(/-/g, "").toLowerCase();
  return `${so.slice(0, 8)}-${so.slice(8, 12)}-${so.slice(12, 16)}-${so.slice(16, 20)}-${so.slice(20)}`;
}

async function chamar<T>(caminho: string): Promise<T> {
  if (!env.NOTION_TOKEN) throw new NotionNaoConfigurado();

  const r = await fetch(`${BASE}${caminho}`, {
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": VERSAO,
    },
  });

  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    log.warn("chamada ao Notion falhou", { caminho, status: r.status });
    const dica =
      r.status === 404
        ? " Confira se a pagina foi compartilhada com a integracao (Notion: ... > Conexoes)."
        : r.status === 401
          ? " Token invalido ou revogado."
          : "";
    throw new NotionErro(`Notion respondeu ${r.status}.${dica} ${corpo.slice(0, 200)}`, r.status);
  }
  return (await r.json()) as T;
}

type BlocoNotion = {
  id: string;
  type: string;
  has_children?: boolean;
  [chave: string]: unknown;
};

function textoDoBloco(bloco: BlocoNotion): string {
  const corpo = bloco[bloco.type] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  if (!corpo?.rich_text) return "";
  return corpo.rich_text.map((p) => p.plain_text ?? "").join("");
}

export type LinhaDaPagina = { tipo: string; texto: string };

/**
 * Le a pagina do Notion como uma lista de linhas (tipo + texto puro).
 *
 * Nao tentamos reconstruir a formatacao: o planejamento da VORA e texto com
 * titulo por dia, e e isso que interessa. Pagina com mais de 300 blocos e
 * cortada - planejamento de mes nao chega perto disso.
 */
export async function lerPagina(pageId: string): Promise<LinhaDaPagina[]> {
  const linhas: LinhaDaPagina[] = [];
  let cursor: string | undefined;

  for (let pagina = 0; pagina < 3; pagina++) {
    const qs = new URLSearchParams({ page_size: "100" });
    if (cursor) qs.set("start_cursor", cursor);
    const r = await chamar<{ results: BlocoNotion[]; next_cursor: string | null; has_more: boolean }>(
      `/blocks/${pageId}/children?${qs}`,
    );

    for (const bloco of r.results) {
      const texto = textoDoBloco(bloco).trim();
      if (texto) linhas.push({ tipo: bloco.type, texto });
    }

    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }

  return linhas;
}

export async function tituloDaPagina(pageId: string): Promise<string | null> {
  const r = await chamar<{ properties?: Record<string, { type: string; title?: Array<{ plain_text?: string }> }> }>(
    `/pages/${pageId}`,
  );
  for (const prop of Object.values(r.properties ?? {})) {
    if (prop.type === "title" && prop.title) {
      return prop.title.map((p) => p.plain_text ?? "").join("") || null;
    }
  }
  return null;
}
