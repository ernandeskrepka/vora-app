import { prisma } from "@/lib/db.ts";
import {
  acaoAdicionarContato,
  acaoAtualizarCliente,
  acaoRemoverContato,
} from "@/app/actions/clientes.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Botao, Campo, Cartao, Vazio, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function AjustesDoCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await prisma.client.findUniqueOrThrow({
    where: { id },
    include: { contacts: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Cartao titulo="Dados do cliente">
        <form action={acaoAtualizarCliente} className="space-y-3">
          <input type="hidden" name="clienteId" value={cliente.id} />
          <Campo rotulo="Nome">
            <input name="nome" defaultValue={cliente.name} className={classeInput} />
          </Campo>
          <Campo
            rotulo="Planejamento no Notion"
            dica="Cole o link da pagina de cronograma desse cliente. E dela que o botao Sincronizar le as pautas."
          >
            <input
              name="notionPageId"
              defaultValue={cliente.notionPageId ?? ""}
              className={classeInput}
              placeholder="https://app.notion.com/p/..."
            />
          </Campo>
          <Campo rotulo="Observacoes">
            <textarea name="notas" rows={4} defaultValue={cliente.notes ?? ""} className={classeInput} />
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ativo" value="sim" defaultChecked={cliente.active} />
            Cliente ativo
          </label>
          <Botao type="submit">Salvar</Botao>
        </form>
      </Cartao>

      <Cartao titulo="Contatos aprovadores (WhatsApp)">
        <ul className="mb-4 divide-y divide-linha-suave">
          {cliente.contacts.length === 0 && <Vazio>Nenhum contato.</Vazio>}
          {cliente.contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="text-sm font-medium text-tinta">{c.name}</p>
                <p className="text-xs text-tinta-3">
                  {c.phoneE164}
                  {c.isApprover ? " · aprovador" : ""}
                  {c.receivesReminders ? " · recebe lembrete" : ""}
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
          className="border-t border-linha-suave pt-4"
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
    </div>
  );
}
