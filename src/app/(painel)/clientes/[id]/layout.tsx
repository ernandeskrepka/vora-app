import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { MenuCliente } from "@/components/menu-cliente.tsx";
import { BotaoLink } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function LayoutCliente({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await exigirUsuario();
  const { id } = await params;

  const cliente = await prisma.client.findUnique({
    where: { id },
    include: {
      metaConnections: true,
      _count: { select: { posts: true } },
    },
  });
  if (!cliente) notFound();

  const [aguardando, pautas, conexoesRuins] = await Promise.all([
    prisma.post.count({ where: { clientId: id, status: "AGUARDANDO_APROVACAO" } }),
    prisma.planningItem.count({ where: { clientId: id, status: { in: ["IDEIA", "EM_PRODUCAO", "PRONTO"] } } }),
    prisma.metaConnection.count({ where: { clientId: id, status: { not: "CONECTADO" } } }),
  ]);

  const instagram = cliente.metaConnections.find((c) => c.assetType === "INSTAGRAM");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/clientes" className="text-sm text-tinta-3 hover:underline">
              Clientes
            </Link>
            <span className="text-zinc-300">/</span>
            <h1 className="titulo text-xl text-tinta">{cliente.name}</h1>
            {!cliente.active && <span className="text-xs text-tinta-4">(inativo)</span>}
          </div>
          <p className="text-sm text-tinta-3">
            {instagram?.assetName ?? cliente.slug} · {cliente._count.posts} post(s) no total
          </p>
        </div>
        <BotaoLink href={`/posts/novo?cliente=${cliente.id}`} variante="primario">
          Novo post
        </BotaoLink>
      </header>

      <MenuCliente
        clienteId={cliente.id}
        pendencias={{
          "Visao geral": aguardando,
          Planejamento: pautas,
          Conexoes: conexoesRuins,
        }}
      />

      {children}
    </div>
  );
}
