import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ClienteDaCarteira } from "./importacao-carteira.ts";

/**
 * Le a carteira versionada em dados/clientes-meta.json.
 *
 * Fica em arquivo, e nao no banco, de proposito: o levantamento dos ativos da
 * Meta e revisado em code review antes de virar dado de producao, e a mesma
 * lista serve para subir um ambiente novo do zero.
 */
export async function carregarCarteira(): Promise<ClienteDaCarteira[]> {
  const caminho = path.join(process.cwd(), "dados", "clientes-meta.json");
  const bruto = await readFile(caminho, "utf8");
  const json = JSON.parse(bruto) as { clientes?: ClienteDaCarteira[] };
  return json.clientes ?? [];
}
