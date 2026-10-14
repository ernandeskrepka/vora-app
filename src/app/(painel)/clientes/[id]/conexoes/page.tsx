import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { acaoSalvarConexao, acaoTestarConexao } from "@/app/actions/clientes.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Aviso, Botao, Campo, Cartao, Vazio, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

const ATIVOS = [
  { valor: "INSTAGRAM", rotulo: "Instagram (conta profissional)" },
  { valor: "FACEBOOK_PAGE", rotulo: "Pagina do Facebook" },
  { valor: "AD_ACCOUNT", rotulo: "Conta de anuncios (fase 2)" },
];

export default async function ConexoesDoCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conexoes = await prisma.metaConnection.findMany({ where: { clientId: id } });

  return (
    <div className="space-y-5">
      {env.META_DRY_RUN && (
        <Aviso tom="atencao" titulo="Modo dry-run">
          Com META_DRY_RUN=true o teste de conexao e a publicacao sao simulados. Desligue so depois
          do App Review aprovado.
        </Aviso>
      )}

      <Cartao titulo="Ativos conectados">
        {conexoes.length === 0 ? (
          <Vazio>Nenhum ativo conectado. Esse cliente ainda nao pode publicar.</Vazio>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {conexoes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    {ATIVOS.find((a) => a.valor === c.assetType)?.rotulo ?? c.assetType}
                    {c.assetName ? ` · ${c.assetName}` : ""}
                  </p>
                  <p className="text-xs text-zinc-500">
                    id {c.assetId} · {c.authMode === "SYSTEM_USER" ? "System User" : "OAuth"}
                    {c.lastCheckedAt ? ` · testado em ${formatarDataHora(c.lastCheckedAt)}` : ""}
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
                    <Botao type="submit">Testar</Botao>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Conectar um ativo">
        <FormAcao acao={acaoSalvarConexao} textoBotao="Salvar e testar" variante="primario">
          <input type="hidden" name="clienteId" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Ativo">
              <select name="assetType" className={classeInput}>
                {ATIVOS.map((a) => (
                  <option key={a.valor} value={a.valor}>
                    {a.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="ID do ativo" dica="IG User ID, Page ID ou act_<id>.">
              <input name="assetId" required className={classeInput} />
            </Campo>
            <Campo rotulo="Nome (opcional)">
              <input name="assetName" className={classeInput} placeholder="@cliente" />
            </Campo>
            <Campo rotulo="Forma de acesso">
              <select name="authMode" className={classeInput}>
                <option value="SYSTEM_USER">System User da agencia (recomendado)</option>
                <option value="OAUTH">Login Meta do cliente (OAuth)</option>
              </select>
            </Campo>
            <Campo rotulo="Token (opcional)" dica="Em branco usa o System User. Guardado cifrado.">
              <input name="token" type="password" className={classeInput} />
            </Campo>
          </div>
        </FormAcao>
      </Cartao>
    </div>
  );
}
