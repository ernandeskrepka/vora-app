import { env } from "@/env";
import { logger } from "@/lib/logger.ts";

const log = logger("notion");
const BASE = "https://api.notion.com/v1";
const VERSAO = "2022-06-28";

export class NotionNaoConfigurado extends Error {
  constructor() {
    super(
      "NOTION_TOKEN nao configurado: crie a integracao interna no Notion e compartilhe as paginas com ela.",
    );
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
  const achado = limpo.match(
    /[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  if (!achado) return null;
  const so = achado[0].replace(/-/g, "").toLowerCase();
  return `${so.slice(0, 8)}-${so.slice(8, 12)}-${so.slice(12, 16)}-${so.slice(16, 20)}-${so.slice(20)}`;
}

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: "GET" | "POST"; corpo?: unknown } = {},
): Promise<T> {
  if (!env.NOTION_TOKEN) throw new NotionNaoConfigurado();

  const r = await fetch(`${BASE}${caminho}`, {
    method: opcoes.metodo ?? "GET",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": VERSAO,
      ...(opcoes.corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
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
    throw new NotionErro(
      `Notion respondeu ${r.status}.${dica} ${corpo.slice(0, 200)}`,
      r.status,
    );
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
  const corpo = bloco[bloco.type] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  if (!corpo?.rich_text) return "";
  return corpo.rich_text.map((p) => p.plain_text ?? "").join("");
}

/** Caixa de marcar do bloco "to_do": vem em to_do.checked, nao no texto. */
function marcaDoBloco(bloco: BlocoNotion): boolean {
  const corpo = bloco.to_do as { checked?: boolean } | undefined;
  return corpo?.checked === true;
}

export type LinhaDaPagina = {
  tipo: string;
  texto: string;
  /**
   * Estado da caixa de marcar, nos blocos "to_do". O Notion entrega isso fora
   * do texto (o texto vem sem o "- [x]"), entao a marca viaja aqui.
   */
  marcado?: boolean;
};

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
    const r = await chamar<{
      results: BlocoNotion[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/blocks/${pageId}/children?${qs}`);

    for (const bloco of r.results) {
      const texto = textoDoBloco(bloco).trim();
      if (!texto) continue;
      const linha: LinhaDaPagina = { tipo: bloco.type, texto };
      if (bloco.type === "to_do") linha.marcado = marcaDoBloco(bloco);
      linhas.push(linha);
    }

    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }

  return linhas;
}

export async function tituloDaPagina(pageId: string): Promise<string | null> {
  const r = await chamar<{
    properties?: Record<
      string,
      { type: string; title?: Array<{ plain_text?: string }> }
    >;
  }>(`/pages/${pageId}`);
  for (const prop of Object.values(r.properties ?? {})) {
    if (prop.type === "title" && prop.title) {
      return prop.title.map((p) => p.plain_text ?? "").join("") || null;
    }
  }
  return null;
}

/* --------------------------------------------------------------- bases */

/** Pagina de uma base (linha), como a API devolve em /databases/{id}/query. */
export type PaginaDaBase = {
  id: string;
  url: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, PropriedadeNotion>;
};

export type PropriedadeNotion = {
  id?: string;
  type: string;
  [chave: string]: unknown;
};

export type EsquemaDaBase = {
  titulo: string;
  /** Nomes das opcoes de status que o Notion agrupa como "concluido". */
  statusConcluidos: string[];
};

/** Titulo e grupos de status da base: diz quais status contam como feito. */
export async function esquemaDaBase(databaseId: string): Promise<EsquemaDaBase> {
  const r = await chamar<{
    title?: Array<{ plain_text?: string }>;
    properties?: Record<
      string,
      {
        type: string;
        status?: {
          options?: Array<{ id: string; name: string }>;
          groups?: Array<{ name: string; option_ids?: string[] }>;
        };
      }
    >;
  }>(`/databases/${databaseId}`);

  const concluidos: string[] = [];
  for (const prop of Object.values(r.properties ?? {})) {
    if (prop.type !== "status" || !prop.status) continue;
    const nomePorId = new Map((prop.status.options ?? []).map((o) => [o.id, o.name]));
    for (const grupo of prop.status.groups ?? []) {
      if (grupo.name.toLowerCase() !== "complete") continue;
      for (const id of grupo.option_ids ?? []) {
        const nome = nomePorId.get(id);
        if (nome) concluidos.push(nome);
      }
    }
  }
  return {
    titulo: (r.title ?? []).map((t) => t.plain_text ?? "").join("") || "Base do Notion",
    statusConcluidos: concluidos,
  };
}

/** Todas as linhas da base (ate 500), da mais recente editada para a mais antiga. */
export async function linhasDaBase(databaseId: string): Promise<PaginaDaBase[]> {
  const paginas: PaginaDaBase[] = [];
  let cursor: string | undefined;

  for (let i = 0; i < 5; i++) {
    const r = await chamar<{
      results: PaginaDaBase[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/databases/${databaseId}/query`, {
      metodo: "POST",
      corpo: {
        page_size: 100,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        ...(cursor ? { start_cursor: cursor } : {}),
      },
    });
    paginas.push(...r.results);
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return paginas;
}
