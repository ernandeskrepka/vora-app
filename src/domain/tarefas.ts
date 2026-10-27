import type { PaginaDaBase, PropriedadeNotion } from "@/lib/notion/client.ts";

/**
 * Leitura generica de uma linha de base do Notion como tarefa da equipe.
 *
 * As bases da VORA mudam de nome de coluna (Proprietario, Responsavel,
 * Data de publicacao, Prazo...), entao a leitura vai pelo tipo da
 * propriedade e, em caso de empate, pelo nome.
 */
export type TarefaLida = {
  notionPageId: string;
  url: string;
  title: string;
  status: string | null;
  ownerNames: string[];
  kind: string | null;
  platforms: string[];
  dueAt: Date | null;
  filmingAt: Date | null;
  arteUrl: string | null;
  linkUrl: string | null;
  notionEditedAt: Date;
  archived: boolean;
};

type Texto = { plain_text?: string };

function texto(valor: unknown): string {
  return Array.isArray(valor)
    ? (valor as Texto[]).map((t) => t.plain_text ?? "").join("")
    : "";
}

/** O Notion as vezes devolve "<p>\\nTexto\\n</p>" no titulo: limpa. */
export function limparTitulo(bruto: string): string {
  return bruto
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dataDe(prop: PropriedadeNotion | undefined): Date | null {
  const d = prop?.date as { start?: string | null } | null | undefined;
  if (!d?.start) return null;
  // Data sem hora vem como "2026-10-27": tratamos como meio-dia local para
  // nao escorregar de dia ao converter fuso.
  const iso = d.start.length === 10 ? `${d.start}T12:00:00-03:00` : d.start;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

const NOME_DATA_PRINCIPAL = /public|postag|entreg|prazo|due|deadline|data$|quando|agend/i;
const NOME_FILMAGEM = /film|grav|capta|sessao|sess[aã]o|foto/i;
const NOME_ARTE = /arte|figma|drive|canva|criativo/i;
const NOME_LINK = /link|url|post|referen/i;
const NOME_STATUS = /status|situa|etapa|fase/i;
const NOME_TIPO = /tipo|formato|categoria/i;
const NOME_PLATAFORMA = /plataforma|rede|canal/i;
const NOME_RESPONSAVEL = /propriet|respons|dono|quem|designer|editor|pessoa|atribu/i;

export function tarefaDaPagina(pagina: PaginaDaBase): TarefaLida {
  const props = Object.entries(pagina.properties ?? {});
  const porTipo = (tipo: string) => props.filter(([, p]) => p.type === tipo);
  const escolher = (tipo: string, nome: RegExp) => {
    const candidatos = porTipo(tipo);
    return candidatos.find(([n]) => nome.test(n)) ?? candidatos[0];
  };

  const titulo = porTipo("title")[0]?.[1];
  const status = escolher("status", NOME_STATUS) ?? escolher("select", NOME_STATUS);
  const statusEhSelectDeStatus = status?.[1].type === "select" && NOME_STATUS.test(status[0]);

  const pessoas =
    escolher("people", NOME_RESPONSAVEL)?.[1] ??
    (escolher("created_by", /./)?.[1] as PropriedadeNotion | undefined);
  const ownerNames: string[] = [];
  const lista = (pessoas?.people ?? (pessoas?.created_by ? [pessoas.created_by] : [])) as Array<{
    name?: string;
  }>;
  for (const p of lista) if (p?.name) ownerNames.push(p.name);

  const datas = porTipo("date");
  const principal =
    datas.find(([n]) => NOME_DATA_PRINCIPAL.test(n)) ??
    datas.find(([n]) => !NOME_FILMAGEM.test(n)) ??
    datas[0];
  const filmagem = datas.find(([n]) => NOME_FILMAGEM.test(n) && n !== principal?.[0]);

  const urls = porTipo("url");
  const arte = urls.find(([n]) => NOME_ARTE.test(n));
  const link = urls.find(([n]) => NOME_LINK.test(n) && n !== arte?.[0]) ?? urls.find(([n]) => n !== arte?.[0]);

  const tipo = porTipo("select").find(([n]) => NOME_TIPO.test(n) && !NOME_STATUS.test(n));
  const plataforma = porTipo("multi_select").find(([n]) => NOME_PLATAFORMA.test(n));

  const statusNome =
    (status?.[1][status[1].type] as { name?: string } | null | undefined)?.name ?? null;

  return {
    notionPageId: pagina.id,
    url: pagina.url,
    title: limparTitulo(texto(titulo?.title)) || "(sem titulo)",
    status: status && (status[1].type === "status" || statusEhSelectDeStatus) ? statusNome : null,
    ownerNames,
    kind: (tipo?.[1].select as { name?: string } | null | undefined)?.name ?? null,
    platforms: ((plataforma?.[1].multi_select ?? []) as Array<{ name?: string }>)
      .map((o) => o.name ?? "")
      .filter(Boolean),
    dueAt: dataDe(principal?.[1]),
    filmingAt: dataDe(filmagem?.[1]),
    arteUrl: (arte?.[1].url as string | null | undefined) ?? null,
    linkUrl: (link?.[1].url as string | null | undefined) ?? null,
    notionEditedAt: new Date(pagina.last_edited_time),
    archived: Boolean(pagina.archived || pagina.in_trash),
  };
}

const STATUS_FEITO = /publicad|enviad|conclu|feit|pronto|done|finaliz|entregue|agendad|aprovad/i;

/**
 * Tarefa concluida: pelo grupo "complete" da base (quando a API entrega) ou,
 * sem isso, pelo nome do status.
 */
export function tarefaConcluida(status: string | null, statusConcluidos: string[]): boolean {
  if (!status) return false;
  if (statusConcluidos.length > 0) return statusConcluidos.includes(status);
  return STATUS_FEITO.test(status);
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Reconhece o cliente pelo titulo ("Artes do Santa Rita" -> Santa Rita).
 * Compara sem acento e ignora "Laboratorio", "Dr." etc. do nome cadastrado.
 */
export function clienteDoTitulo(titulo: string, clientes: Array<{ name: string }>): string | null {
  const t = normalizar(titulo);
  let melhor: { nome: string; tamanho: number } | null = null;
  for (const c of clientes) {
    const nome = normalizar(c.name);
    const apelido = nome.replace(/^(laboratorio|laboratorios|dr\.?|dra\.?|colegio|clinica|grupo)\s+/i, "");
    for (const chave of [nome, apelido]) {
      if (chave.length < 4) continue;
      if (t.includes(chave) && (!melhor || chave.length > melhor.tamanho)) {
        melhor = { nome: c.name, tamanho: chave.length };
      }
    }
  }
  return melhor?.nome ?? null;
}

/** Primeiro nome de quem esta com a tarefa, para "minhas tarefas". */
export function ehDaPessoa(ownerNames: string[], nomeDaPessoa: string): boolean {
  const alvo = normalizar(nomeDaPessoa).split(/\s+/)[0] ?? "";
  if (!alvo) return false;
  return ownerNames.some((n) => normalizar(n).split(/\s+/)[0] === alvo);
}
