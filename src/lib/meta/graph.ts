import { env } from "@/env";
import { logger } from "@/lib/logger.ts";

const log = logger("meta.graph");

export const GRAPH_BASE = "https://graph.facebook.com";

/** Versao fixada por variavel de ambiente (a Meta publica uma nova a cada ~90 dias). */
export const versaoGraph = () => env.META_GRAPH_VERSION;

export type ErroMetaBruto = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly codigo: number | null,
    readonly subcodigo: number | null,
    readonly fbtraceId: string | null,
    readonly retentavel: boolean,
    readonly tipoFalha: "token" | "permissao" | "limite" | "midia" | "temporaria" | "desconhecida",
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

/**
 * Codigos que valem nova tentativa (instabilidade, limite momentaneo) e
 * codigos que nao valem (token morto, permissao faltando, midia invalida).
 * Referencia: Graph API error codes.
 */
function classificar(httpStatus: number, codigo: number | null, subcodigo: number | null) {
  if (codigo === 190) return { retentavel: false, tipoFalha: "token" as const };
  if (codigo === 200 || codigo === 10 || (codigo !== null && codigo >= 300 && codigo < 400)) {
    return { retentavel: false, tipoFalha: "permissao" as const };
  }
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613 || httpStatus === 429) {
    return { retentavel: true, tipoFalha: "limite" as const };
  }
  if (codigo === 2207026 || subcodigo === 2207026) {
    return { retentavel: false, tipoFalha: "midia" as const };
  }
  if (codigo === 1 || codigo === 2 || httpStatus >= 500) {
    return { retentavel: true, tipoFalha: "temporaria" as const };
  }
  return { retentavel: false, tipoFalha: "desconhecida" as const };
}

type Opcoes = {
  token: string;
  metodo?: "GET" | "POST";
  params?: Record<string, string | number | boolean | undefined>;
  /** Descricao curta que vai para o log e para a trilha de tentativas. */
  rotulo: string;
};

/**
 * Chamada crua a Graph API. Nunca registra o token no log.
 */
export async function chamarGraph<T = unknown>(caminho: string, opcoes: Opcoes): Promise<T> {
  const { token, metodo = "GET", params = {}, rotulo } = opcoes;
  const url = new URL(`${GRAPH_BASE}/${versaoGraph()}/${caminho.replace(/^\//, "")}`);

  const corpo = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (metodo === "GET") url.searchParams.set(k, String(v));
    else corpo.set(k, String(v));
  }

  const inicio = Date.now();
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(metodo === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: metodo === "POST" ? corpo : undefined,
    });
  } catch (erro) {
    log.error("falha de rede na Graph API", { rotulo, caminho, erro: String(erro) });
    throw new MetaApiError(
      `Falha de rede ao chamar a Meta (${rotulo}).`,
      0,
      null,
      null,
      null,
      true,
      "temporaria",
    );
  }

  const texto = await resposta.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = { bruto: texto };
  }

  log.info("chamada a Graph API", {
    rotulo,
    metodo,
    caminho,
    status: resposta.status,
    ms: Date.now() - inicio,
    parametros: Object.keys(params),
  });

  if (!resposta.ok) {
    const erro = (json as { error?: ErroMetaBruto })?.error ?? {};
    const { retentavel, tipoFalha } = classificar(
      resposta.status,
      erro.code ?? null,
      erro.error_subcode ?? null,
    );
    const mensagem =
      erro.error_user_msg ||
      erro.message ||
      `Erro HTTP ${resposta.status} ao chamar a Meta (${rotulo}).`;
    log.error("erro da Graph API", {
      rotulo,
      status: resposta.status,
      codigo: erro.code,
      subcodigo: erro.error_subcode,
      fbtrace_id: erro.fbtrace_id,
      mensagem,
    });
    throw new MetaApiError(
      mensagem,
      resposta.status,
      erro.code ?? null,
      erro.error_subcode ?? null,
      erro.fbtrace_id ?? null,
      retentavel,
      tipoFalha,
    );
  }

  return json as T;
}

export function espera(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
