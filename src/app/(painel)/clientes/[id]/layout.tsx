import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { MenuCliente } from "@/components/menu-cliente.tsx";
import { Avatar, BotaoLink } from "@/components/ui.tsx";
import { IconeNovo } from "@/components/icones.tsx";

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
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar nome={cliente.name} tamanho={48} />
          <div className="min-w-0">
            <p className="sobre mb-1">
              <Link href="/clientes" className="hover:text-tinta-2">
                Clientes
              </Link>
              {!cliente.active && " · inativo"}
            </p>
            <h1 className="truncate">{cliente.name}</h1>
            <p className="mt-1 text-sm text-tinta-3">
              {instagram?.assetName ?? cliente.slug} · {cliente._count.posts} post(s) no total
            </p>
          </div>
        </div>
        <BotaoLink href={`/posts/novo?cliente=${cliente.id}`} variante="primario">
          <IconeNovo tamanho={15} />
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
