import { logger } from "@/lib/logger.ts";
import { MetaApiError, chamarGraph } from "./graph.ts";
import { modoDryRun, tokenDaConexao } from "./index.ts";
import type { MetaConnection } from "@/lib/tipos.ts";

const log = logger("meta.conexoes");

export type DiagnosticoConexao = {
  status: "CONECTADO" | "EXPIRADO" | "SEM_PERMISSAO" | "REVOGADO" | "NAO_CONFIGURADO";
  assetName: string | null;
  mensagem: string | null;
};

/**
 * Verifica se a conexao de um ativo ainda funciona, lendo o proprio ativo.
 * Roda todo dia pelo job `check-meta-connections` e tambem na tela de
 * Conexoes, quando a equipe clica em "testar".
 */
export async function diagnosticarConexao(conexao: MetaConnection): Promise<DiagnosticoConexao> {
  if (!conexao.assetId) {
    return { status: "NAO_CONFIGURADO", assetName: null, mensagem: "Ativo nao informado." };
  }

  if (modoDryRun()) {
    return {
      status: "CONECTADO",
      assetName: conexao.assetName,
      mensagem: "Dry-run: conexao assumida como valida (nenhuma chamada feita a Meta).",
    };
  }

  try {
    const token = tokenDaConexao(conexao);
    const campos =
      conexao.assetType === "AD_ACCOUNT"
        ? "name,account_status,currency"
        : conexao.assetType === "INSTAGRAM"
          ? "username,name"
          : "name,category";

    const r = await chamarGraph<Record<string, unknown>>(conexao.assetId, {
      token,
      params: { fields: campos },
      rotulo: `conexoes.${conexao.assetType.toLowerCase()}`,
    });

    const nome =
      (r.username as string | undefined) ?? (r.name as string | undefined) ?? conexao.assetName ?? null;

    if (conexao.assetType === "AD_ACCOUNT" && r.account_status !== undefined && r.account_status !== 1) {
      return {
        status: "SEM_PERMISSAO",
        assetName: nome,
        mensagem: `Conta de anuncios com status ${String(r.account_status)} na Meta.`,
      };
    }

    return { status: "CONECTADO", assetName: nome, mensagem: null };
  } catch (erro) {
    if (erro instanceof MetaApiError) {
      log.warn("conexao com problema", {
        conexaoId: conexao.id,
        tipoFalha: erro.tipoFalha,
        mensagem: erro.message,
      });
      const status =
        erro.tipoFalha === "token"
          ? "EXPIRADO"
          : erro.tipoFalha === "permissao"
            ? "SEM_PERMISSAO"
            : "REVOGADO";
      return { status, assetName: conexao.assetName, mensagem: erro.message };
    }
    return {
      status: "REVOGADO",
      assetName: conexao.assetName,
      mensagem: erro instanceof Error ? erro.message : String(erro),
    };
  }
}
