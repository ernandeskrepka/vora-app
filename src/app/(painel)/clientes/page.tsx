import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { BotaoLink, Cartao, Vazio } from "@/components/ui.tsx";

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

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-tinta">Clientes</h1>
          <p className="text-sm text-tinta-3">{clientes.length} cadastrado(s)</p>
        </div>
        <BotaoLink href="/clientes/novo" variante="primario">
          Novo cliente
        </BotaoLink>
      </header>

      <Cartao>
        {clientes.length === 0 ? (
          <Vazio>Nenhum cliente cadastrado ainda.</Vazio>
        ) : (
          <ul className="divide-y divide-linha-suave">
            {clientes.map((c) => {
              const conexoesOk = c.metaConnections.filter((x) => x.status === "CONECTADO").length;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <Link href={`/clientes/${c.id}`} className="font-medium text-tinta hover:underline">
                      {c.name}
                    </Link>
                    {!c.active && <span className="ml-2 text-xs text-tinta-4">(inativo)</span>}
                    <p className="text-xs text-tinta-3">
                      {c.contacts.filter((x) => x.isApprover).length} aprovador(es) -{" "}
                      {c._count.posts} post(s)
                    </p>
                  </div>
                  <p className="text-xs text-tinta-3">
                    {conexoesOk}/{c.metaConnections.length} conexao(oes) ok
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
