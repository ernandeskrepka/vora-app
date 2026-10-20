import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db.ts";
import { storage } from "@/lib/storage/index.ts";
import { formatarData, formatarDataHora } from "@/lib/datetime.ts";
import { ROTULO_STATUS } from "@/domain/post-status.ts";
import { Cartao, Vazio } from "@/components/ui.tsx";
import { legendaVisivel } from "@/domain/legenda.ts";

export const dynamic = "force-dynamic";

/** Status que ainda vao para o feed - entram na previa como "planejado". */
const PLANEJADOS = [
  "RASCUNHO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "PUBLICANDO",
] as const;

/** Completa a grade ate fechar as linhas de tres, como o Instagram faz. */
function vazias(quantidade: number): Array<{ id: string; vazia: true }> {
  const faltam = quantidade >= 9 ? (3 - (quantidade % 3)) % 3 : 9 - quantidade;
  return Array.from({ length: faltam }, (_, i) => ({
    id: `vazia-${i}`,
    vazia: true as const,
  }));
}

export default async function PerfilDoCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.client.findUnique({
    where: { id },
    include: { metaConnections: true },
  });
  if (!cliente) notFound();

  const [publicados, planejados] = await Promise.all([
    prisma.post.findMany({
      where: { clientId: id, status: "PUBLICADO" },
      include: { media: { orderBy: { position: "asc" } } },
      orderBy: { publishedAt: "desc" },
      take: 12,
    }),
    prisma.post.findMany({
      where: { clientId: id, status: { in: [...PLANEJADOS] } },
      include: { media: { orderBy: { position: "asc" } } },
      orderBy: { scheduledAt: "asc" },
      take: 9,
    }),
  ]);

  async function paraGrade(
    posts: typeof publicados,
    futuro: boolean,
  ): Promise<
    Array<{
      id: string;
      url: string | null;
      video: boolean;
      carrossel: boolean;
      legenda: string;
      quando: Date;
      status: string;
    }>
  > {
    return Promise.all(
      posts.map(async (p) => {
        const capa = p.media[0];
        return {
          id: p.id,
          url: capa ? await storage.urlTemporaria(capa.storageKey) : null,
          video: capa?.kind === "VIDEO",
          carrossel: p.media.length > 1,
          legenda: legendaVisivel(p.caption),
          quando: futuro ? p.scheduledAt : (p.publishedAt ?? p.scheduledAt),
          status: p.status,
        };
      }),
    );
  }

  const [gradePublicados, gradePlanejados] = await Promise.all([
    paraGrade(publicados, false),
    paraGrade(planejados, true),
  ]);

  // O feed e lido de cima para baixo: o que entra depois aparece primeiro.
  const grade = [...[...gradePlanejados].reverse(), ...gradePublicados];

  const instagram = cliente.metaConnections.find(
    (c) => c.assetType === "INSTAGRAM",
  );
  // Enquanto o Instagram nao estiver conectado, monta um @ a partir do nome
  // so para a previa nao ficar com cara de campo vazio.
  const handle = instagram?.assetName?.startsWith("@")
    ? instagram.assetName
    : `@${(instagram?.assetName ?? cliente.name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase()}`;
  const iniciais = cliente.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-5">
      <Cartao titulo="Como o perfil vai ficar">
        <p className="text-sm text-tinta-2">
          A grade abaixo junta o que ja foi publicado com o que esta agendado,
          na ordem em que o feed vai mostrar. O que ainda nao saiu aparece
          destacado, com a data prevista - serve para conferir ritmo, cor e
          repeticao antes de mandar para o cliente.
        </p>

        <div className="mt-5 grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Celular */}
          <div className="mx-auto w-full max-w-[320px]">
            <div className="overflow-hidden rounded-[28px] border-8 border-zinc-900 bg-zinc-900 shadow-xl">
              <div className="bg-superficie">
                <div className="flex items-center gap-4 px-4 pt-5 pb-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-800 to-zinc-600 text-lg font-black text-white">
                    {iniciais}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-tinta">
                      {handle}
                    </p>
                    <p className="truncate text-sm text-tinta-3">
                      {cliente.name}
                    </p>
                    <p className="mt-1 text-xs text-tinta-4">
                      {gradePublicados.length} publicados ·{" "}
                      {gradePlanejados.length} na fila
                    </p>
                  </div>
                </div>

                {grade.length === 0 ? (
                  <div className="px-4 pb-6">
                    <Vazio>Sem post nenhum ainda para esse cliente.</Vazio>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-0.5 bg-superficie-3 p-0.5">
                    {[...grade.slice(0, 18), ...vazias(grade.length)].map(
                      (item) => {
                        if ("vazia" in item) {
                          return (
                            <div
                              key={item.id}
                              className="aspect-4/5 bg-superficie"
                            />
                          );
                        }
                        const futuro = item.status !== "PUBLICADO";
                        return (
                          <Link
                            key={item.id}
                            href={`/posts/${item.id}`}
                            className="relative aspect-4/5 overflow-hidden bg-linha-forte"
                            title={`${ROTULO_STATUS[item.status as keyof typeof ROTULO_STATUS] ?? item.status} · ${formatarData(item.quando)}`}
                          >
                            {item.url ? (
                              item.video ? (
                                <video
                                  src={item.url}
                                  muted
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <img
                                  src={item.url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              )
                            ) : (
                              <div className="grid h-full w-full place-items-center bg-superficie-3 text-[10px] text-tinta-4">
                                sem arte
                              </div>
                            )}
                            {futuro && (
                              <>
                                <span className="pointer-events-none absolute inset-0 ring-2 ring-amber-400 ring-inset" />
                                <span className="absolute bottom-1 left-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 uppercase">
                                  {formatarData(item.quando).slice(0, 5)}
                                </span>
                              </>
                            )}
                            {item.carrossel && (
                              <span className="absolute top-1 right-1 rounded bg-black/55 px-1 text-[10px] text-white">
                                ❏
                              </span>
                            )}
                          </Link>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fila */}
          <div>
            <h3 className="text-sm font-semibold text-tinta">
              Proximos a entrar
            </h3>
            {gradePlanejados.length === 0 ? (
              <div className="mt-2">
                <Vazio>Nada agendado. O feed desse cliente vai parar.</Vazio>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-linha-suave">
                {gradePlanejados.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3">
                    <div className="h-16 w-14 shrink-0 overflow-hidden rounded-md bg-superficie-3">
                      {item.url && !item.video && (
                        <img
                          src={item.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-tinta">
                        {item.legenda.split("\n")[0] || "(sem legenda)"}
                      </p>
                      <p className="mt-0.5 text-xs text-tinta-3">
                        {formatarDataHora(item.quando)} ·{" "}
                        {ROTULO_STATUS[
                          item.status as keyof typeof ROTULO_STATUS
                        ] ?? item.status}
                      </p>
                    </div>
                    <Link
                      href={`/posts/${item.id}`}
                      className="self-center text-xs font-medium text-tinta-2 underline-offset-2 hover:underline"
                    >
                      abrir
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Cartao>
    </div>
  );
}
