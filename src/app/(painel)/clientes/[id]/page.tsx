import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { storage } from "@/lib/storage/index.ts";
import { FUSO_PADRAO, formatarDataHora, intervaloDoMes } from "@/lib/datetime.ts";
import { formatInTimeZone } from "date-fns-tz";
import { ROTULO_PAUTA, type StatusPauta } from "@/domain/planejamento.ts";
import { Aviso, BotaoLink, Cartao, Etiqueta, Vazio } from "@/components/ui.tsx";
import type { PostStatus } from "@/domain/post-status.ts";

export const dynamic = "force-dynamic";

export default async function VisaoGeralCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agora = new Date();
  const { inicio, fim } = intervaloDoMes(agora.getUTCFullYear(), agora.getUTCMonth() + 1);

  const [cliente, doMes, proximos, pendentes, pautas, materiais, conexoes] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id }, include: { contacts: true } }),
    prisma.post.groupBy({
      by: ["status"],
      where: { clientId: id, scheduledAt: { gte: inicio, lt: fim } },
      _count: true,
    }),
    prisma.post.findMany({
      where: { clientId: id, scheduledAt: { gte: agora }, status: { notIn: ["CANCELADO", "PUBLICADO"] } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.post.findMany({
      where: { clientId: id, status: { in: ["AGUARDANDO_APROVACAO", "REPROVADO", "POST_SEM_RESPOSTA", "FALHOU"] } },
      orderBy: { scheduledAt: "desc" },
      take: 5,
    }),
    prisma.planningItem.findMany({
      where: { clientId: id, status: { in: ["IDEIA", "EM_PRODUCAO", "PRONTO"] } },
      orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
      take: 6,
    }),
    prisma.clientAsset.findMany({
      where: { clientId: id, kind: { not: "DOCUMENTO" } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.metaConnection.findMany({ where: { clientId: id } }),
  ]);

  const miniaturas = await Promise.all(
    materiais.map(async (m) => ({ id: m.id, url: await storage.urlTemporaria(m.storageKey) })),
  );

  const totalMes = doMes.reduce((t, l) => t + l._count, 0);
  const contagem = (s: PostStatus) => doMes.find((l) => l.status === s)?._count ?? 0;
  const problemas = conexoes.filter((c) => c.status !== "CONECTADO");

  return (
    <div className="space-y-5">
      {problemas.length > 0 && (
        <Aviso tom="erro" titulo="Conexao com a Meta precisando de atencao">
          {problemas.map((c) => `${c.assetType}: ${c.status}`).join(" · ")}{" "}
          <Link href={`/clientes/${id}/conexoes`} className="font-semibold underline">
            abrir conexoes
          </Link>
        </Aviso>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Posts no mes", String(totalMes)],
          ["Aguardando o cliente", String(contagem("AGUARDANDO_APROVACAO"))],
          ["Publicados no mes", String(contagem("PUBLICADO"))],
          ["Sem resposta no mes", String(contagem("POST_SEM_RESPOSTA"))],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl border border-linha bg-superficie p-4">
            <p className="text-xs text-tinta-3">{rotulo}</p>
            <p className="titulo mt-1 text-2xl text-tinta">{valor}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao
          titulo={`Precisa de atencao (${pendentes.length})`}
          acao={
            <Link href={`/clientes/${id}/posts`} className="text-xs underline">
              ver todos
            </Link>
          }
        >
          {pendentes.length === 0 ? (
            <Vazio>Nada pendente por aqui.</Vazio>
          ) : (
            <ul className="divide-y divide-linha-suave">
              {pendentes.map((p) => (
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

        <Cartao titulo="Proximos posts">
          {proximos.length === 0 ? (
            <Vazio>Nenhum post agendado.</Vazio>
          ) : (
            <ul className="divide-y divide-linha-suave">
              {proximos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/posts/${p.id}`} className="text-sm hover:underline">
                    {formatInTimeZone(p.scheduledAt, cliente.timezone, "dd/MM 'as' HH:mm")}
                  </Link>
                  <Etiqueta status={p.status as PostStatus} />
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao
          titulo={`Planejamento (${pautas.length})`}
          acao={
            <Link href={`/clientes/${id}/planejamento`} className="text-xs underline">
              abrir quadro
            </Link>
          }
        >
          {pautas.length === 0 ? (
            <Vazio>Nenhuma pauta em producao. Comece pelo planejamento.</Vazio>
          ) : (
            <ul className="divide-y divide-linha-suave">
              {pautas.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-tinta">{p.title}</p>
                    {p.targetDate && (
                      <p className="text-xs text-tinta-3">
                        {formatInTimeZone(p.targetDate, FUSO_PADRAO, "dd/MM")}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-linha-forte px-2 py-0.5 text-[11px] text-tinta-2">
                    {ROTULO_PAUTA[p.status as StatusPauta]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao
          titulo="Material recente"
          acao={
            <Link href={`/clientes/${id}/materiais`} className="text-xs underline">
              abrir biblioteca
            </Link>
          }
        >
          {miniaturas.length === 0 ? (
            <Vazio>Nenhum arquivo na biblioteca ainda.</Vazio>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {miniaturas.map((m) => (
                <img
                  key={m.id}
                  src={m.url}
                  alt=""
                  className="aspect-square w-full rounded-lg border border-linha object-cover"
                />
              ))}
            </div>
          )}
        </Cartao>
      </div>

      <Cartao titulo="Contatos aprovadores">
        {cliente.contacts.length === 0 ? (
          <Vazio>
            Nenhum contato. Sem um WhatsApp aprovador, o post nao pode ser enviado para aprovacao.
          </Vazio>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {cliente.contacts.map((c) => (
              <li key={c.id} className="rounded-full border border-linha px-3 py-1 text-sm">
                {c.name} · {c.phoneE164}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <BotaoLink href={`/clientes/${id}/ajustes`}>Editar cliente e contatos</BotaoLink>
        </div>
      </Cartao>
    </div>
  );
}
