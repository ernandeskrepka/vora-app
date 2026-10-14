import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { env } from "@/env";
import { formatarDataHora } from "@/lib/datetime.ts";
import { acaoTestarConexao } from "@/app/actions/clientes.ts";
import { Aviso, Botao, Cartao, Vazio } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

const ROTULO_ATIVO: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK_PAGE: "Pagina do Facebook",
  AD_ACCOUNT: "Conta de anuncios",
};

export default async function Conexoes() {
  await exigirUsuario();

  const clientes = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { metaConnections: true },
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">Conexoes Meta</h1>
        <p className="text-sm text-zinc-500">
          Graph API fixada na versao {env.META_GRAPH_VERSION}.
          {env.META_DRY_RUN ? " Dry-run ligado: nenhuma chamada real e feita." : ""}
        </p>
      </header>

      {env.META_DRY_RUN && (
        <Aviso tom="atencao" titulo="Modo dry-run">
          Com META_DRY_RUN=true o sistema simula publicacao e teste de conexao. Desligue somente
          depois do App Review aprovado e do System User configurado.
        </Aviso>
      )}

      <div className="space-y-4">
        {clientes.map((cliente) => (
          <Cartao
            key={cliente.id}
            titulo={cliente.name}
            acao={
              <Link href={`/clientes/${cliente.id}`} className="text-xs underline">
                cadastrar ativo
              </Link>
            }
          >
            {cliente.metaConnections.length === 0 ? (
              <Vazio>Nenhum ativo conectado. Esse cliente ainda nao pode publicar.</Vazio>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {cliente.metaConnections.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-zinc-800">
                        {ROTULO_ATIVO[c.assetType] ?? c.assetType}
                        {c.assetName ? ` - ${c.assetName}` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        id {c.assetId} -{" "}
                        {c.authMode === "SYSTEM_USER" ? "System User da agencia" : "OAuth do cliente"}
                        {c.tokenExpiresAt ? ` - token expira em ${formatarDataHora(c.tokenExpiresAt)}` : ""}
                        {c.lastCheckedAt ? ` - ultimo teste ${formatarDataHora(c.lastCheckedAt)}` : ""}
                      </p>
                      {c.lastError && <p className="text-xs text-rose-700">{c.lastError}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          c.status === "CONECTADO"
                            ? "rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                            : "rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs text-rose-800"
                        }
                      >
                        {c.status}
                      </span>
                      <form action={acaoTestarConexao}>
                        <input type="hidden" name="conexaoId" value={c.id} />
                        <Botao type="submit" variante="secundario">
                          Testar
                        </Botao>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        ))}
        {clientes.length === 0 && <Vazio>Nenhum cliente ativo.</Vazio>}
      </div>
    </div>
  );
}
