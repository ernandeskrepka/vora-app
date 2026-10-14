import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { ROTULO_STATUS, type PostStatus } from "@/domain/post-status.ts";
import { Cartao, Etiqueta, IconeRede, Vazio, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function PostsDoCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status } = await searchParams;

  const cliente = await prisma.client.findUniqueOrThrow({ where: { id } });
  const posts = await prisma.post.findMany({
    where: { clientId: id, ...(status ? { status: status as PostStatus } : {}) },
    include: { publications: true, decisions: { orderBy: { decidedAt: "desc" }, take: 1 } },
    orderBy: { scheduledAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <form method="get" className="flex items-center gap-2">
        <select name="status" defaultValue={status ?? ""} className={`${classeInput} max-w-xs`}>
          <option value="">Todos os status</option>
          {Object.entries(ROTULO_STATUS).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
          Filtrar
        </button>
      </form>

      <Cartao titulo={`${posts.length} post(s)`}>
        {posts.length === 0 ? (
          <Vazio>Nenhum post com esse filtro.</Vazio>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link href={`/posts/${p.id}`} className="text-sm font-medium hover:underline">
                    {formatarDataHora(p.scheduledAt, cliente.timezone)}
                  </Link>
                  <p className="truncate text-xs text-zinc-500">
                    {p.format.replace("_", " ").toLowerCase()}
                    {p.decisions[0] ? ` · ${p.decisions[0].approverName}` : ""}
                    {p.caption ? ` · ${p.caption.slice(0, 60)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.networks.map((n) => (
                    <IconeRede key={n} network={n} />
                  ))}
                  <Etiqueta status={p.status as PostStatus} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
