import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import {
  acaoAdicionarContato,
  acaoAtualizarCliente,
  acaoRemoverContato,
  acaoSalvarConexao,
} from "@/app/actions/clientes.ts";
import { Botao, Cartao, Campo, Etiqueta, Vazio, classeInput } from "@/components/ui.tsx";
import { FormAcao } from "@/components/form-acao.tsx";
import type { PostStatus } from "@/domain/post-status.ts";

export const dynamic = "force-dynamic";

const ATIVOS = [
  { valor: "INSTAGRAM", rotulo: "Instagram (conta profissional)" },
  { valor: "FACEBOOK_PAGE", rotulo: "Pagina do Facebook" },
  { valor: "AD_ACCOUNT", rotulo: "Conta de anuncios (fase 2)" },
];

export default async function DetalheCliente({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario();
  const { id } = await params;

  const cliente = await prisma.client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      metaConnections: true,
      posts: { orderBy: { scheduledAt: "desc" }, take: 10 },
    },
  });
  if (!cliente) notFound();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{cliente.name}</h1>
          <p className="text-sm text-zinc-500">
            {cliente.slug} - fuso {cliente.timezone}
          </p>
        </div>
        <Link href="/clientes" className="text-sm underline">
          Voltar
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Dados do cliente">
          <form action={acaoAtualizarCliente} className="space-y-3">
            <input type="hidden" name="clienteId" value={cliente.id} />
            <Campo rotulo="Nome">
              <input name="nome" defaultValue={cliente.name} className={classeInput} />
            </Campo>
            <Campo rotulo="Observacoes">
              <textarea name="notas" rows={3} defaultValue={cliente.notes ?? ""} className={classeInput} />
            </Campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ativo" value="sim" defaultChecked={cliente.active} />
              Cliente ativo
            </label>
            <Botao type="submit">Salvar</Botao>
          </form>
        </Cartao>

        <Cartao titulo="Contatos aprovadores (WhatsApp)">
          <ul className="mb-4 divide-y divide-zinc-100">
            {cliente.contacts.length === 0 && <Vazio>Nenhum contato.</Vazio>}
            {cliente.contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    {c.phoneE164}
                    {c.isApprover ? " - aprovador" : ""}
                    {c.receivesReminders ? " - recebe lembrete" : ""}
                  </p>
                </div>
                <form action={acaoRemoverContato}>
                  <input type="hidden" name="contatoId" value={c.id} />
                  <input type="hidden" name="clienteId" value={cliente.id} />
                  <button type="submit" className="text-xs text-rose-700 underline">
                    remover
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <FormAcao
            acao={acaoAdicionarContato}
            textoBotao="Adicionar contato"
            className="border-t border-zinc-100 pt-4"
          >
            <input type="hidden" name="clienteId" value={cliente.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome">
                <input name="nome" required className={classeInput} />
              </Campo>
              <Campo rotulo="WhatsApp">
                <input name="telefone" required className={classeInput} placeholder="49 99999-9999" />
              </Campo>
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="aprovador" value="sim" defaultChecked /> Aprovador
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="lembretes" value="sim" defaultChecked /> Recebe lembretes
              </label>
            </div>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Conexoes da Meta" className="lg:col-span-2">
          <ul className="mb-4 divide-y divide-zinc-100">
            {cliente.metaConnections.length === 0 && <Vazio>Nenhum ativo conectado.</Vazio>}
            {cliente.metaConnections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-zinc-800">
                    {c.assetType} - {c.assetName ?? c.assetId}
                  </p>
                  <p className="text-xs text-zinc-500">
                    id {c.assetId} - {c.authMode === "SYSTEM_USER" ? "System User" : "OAuth"}
                    {c.lastCheckedAt ? ` - testado em ${formatarDataHora(c.lastCheckedAt)}` : ""}
                    {c.lastError ? ` - ${c.lastError}` : ""}
                  </p>
                </div>
                <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs">
                  {c.status}
                </span>
              </li>
            ))}
          </ul>

          <FormAcao
            acao={acaoSalvarConexao}
            textoBotao="Salvar e testar"
            variante="primario"
            className="border-t border-zinc-100 pt-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="clienteId" value={cliente.id} />
            <Campo rotulo="Ativo">
              <select name="assetType" className={classeInput}>
                {ATIVOS.map((a) => (
                  <option key={a.valor} value={a.valor}>
                    {a.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="ID do ativo" dica="IG User ID, Page ID ou act_<id> da conta de anuncios.">
              <input name="assetId" required className={classeInput} />
            </Campo>
            <Campo rotulo="Nome (opcional)">
              <input name="assetName" className={classeInput} placeholder="@danielimoveis" />
            </Campo>
            <Campo rotulo="Forma de acesso">
              <select name="authMode" className={classeInput}>
                <option value="SYSTEM_USER">System User da agencia (recomendado)</option>
                <option value="OAUTH">Login Meta do cliente (OAuth)</option>
              </select>
            </Campo>
            <Campo
              rotulo="Token (opcional)"
              dica="Em branco usa o META_SYSTEM_USER_TOKEN. O token e guardado cifrado."
            >
              <input name="token" type="password" className={classeInput} />
            </Campo>
            </div>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Ultimos posts" className="lg:col-span-2">
          {cliente.posts.length === 0 ? (
            <Vazio>Nenhum post.</Vazio>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {cliente.posts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/posts/${p.id}`} className="text-sm hover:underline">
                    {formatarDataHora(p.scheduledAt, cliente.timezone)}
                  </Link>
                  <Etiqueta status={p.status as PostStatus} />
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}
