import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import {
  Avatar,
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Vazio,
} from "@/components/ui.tsx";
import { IconeNovo } from "@/components/icones.tsx";

export const dynamic = "force-dynamic";

export default async function Clientes() {
  await exigirUsuario();
  const clientes = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: {
      contacts: true,
      metaConnections: true,
      _count: { select: { posts: true } },
    },
  });

  const ativos = clientes.filter((c) => c.active).length;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        sobre="Carteira"
        titulo="Clientes"
        descricao={`${clientes.length} cadastrado(s) · ${ativos} ativo(s)`}
        acoes={
          <BotaoLink href="/clientes/novo" variante="primario">
            <IconeNovo tamanho={15} />
            Novo cliente
          </BotaoLink>
        }
      />

      {clientes.length === 0 ? (
        <Cartao>
          <Vazio
            acao={
              <Link href="/clientes/novo" className="text-xs font-semibold text-destaque">
                Cadastrar o primeiro cliente
              </Link>
            }
          >
            Nenhum cliente cadastrado ainda.
          </Vazio>
        </Cartao>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clientes.map((c) => {
            const conexoesOk = c.metaConnections.filter((x) => x.status === "CONECTADO").length;
            const total = c.metaConnections.length;
            const aprovadores = c.contacts.filter((x) => x.isApprover).length;
            const pronto = total > 0 && conexoesOk === total;
            return (
              <li key={c.id}>
                <Link
                  href={`/clientes/${c.id}`}
                  className={`vidro flex h-full items-center gap-3 rounded-2xl border border-linha bg-superficie p-4 shadow-cartao transition-colors hover:border-linha-forte ${
                    c.active ? "" : "opacity-60"
                  }`}
                >
                  <Avatar nome={c.name} tamanho={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tinta">
                      {c.name}
                      {!c.active && (
                        <span className="ml-1.5 text-xs font-normal text-tinta-4">inativo</span>
                      )}
                    </p>
                    <p className="num truncate text-xs text-tinta-3">
                      {c._count.posts} post(s) · {aprovadores} aprovador(es)
                    </p>
                  </div>
                  <span
                    title={
                      total === 0
                        ? "Nenhum ativo da Meta cadastrado"
                        : `${conexoesOk} de ${total} conexao(oes) com a Meta funcionando`
                    }
                    className="num inline-flex shrink-0 items-center gap-1.5 rounded-full bg-superficie-3 px-2 py-0.5 text-[11px] font-medium text-tinta-3"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        pronto ? "bg-destaque" : total === 0 ? "bg-tinta-4" : "bg-amber-500"
                      }`}
                    />
                    Meta {conexoesOk}/{total}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
