import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { Cartao, BotaoLink, Etiqueta, IconeRede, Vazio, Aviso } from "@/components/ui.tsx";
import type { PostStatus } from "@/domain/post-status.ts";

export const dynamic = "force-dynamic";

async function buscarDados() {
  const agora = new Date();

  const [proximos, pendentes, reprovados, semResposta, falhas, conexoes, totalMes] =
    await Promise.all([
      prisma.post.findMany({
        where: { status: { in: ["APROVADO", "PUBLICANDO"] }, scheduledAt: { gte: agora } },
        include: { client: true },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
      prisma.post.findMany({
        where: { status: "AGUARDANDO_APROVACAO" },
        include: { client: true },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
      prisma.post.findMany({
        where: { status: "REPROVADO" },
        include: { client: true, decisions: { orderBy: { decidedAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.post.findMany({
        where: { status: "POST_SEM_RESPOSTA" },
        include: { client: true },
        orderBy: { scheduledAt: "desc" },
        take: 5,
      }),
      prisma.post.findMany({
        where: { status: "FALHOU" },
        include: { client: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.metaConnection.findMany({
        where: { status: { not: "CONECTADO" } },
        include: { client: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.post.count({
        where: {
          scheduledAt: { gte: new Date(agora.getFullYear(), agora.getMonth(), 1) },
        },
      }),
    ]);

  return { proximos, pendentes, reprovados, semResposta, falhas, conexoes, totalMes };
}

function LinhaPost({
  post,
  extra,
}: {
  post: { id: string; status: string; scheduledAt: Date; networks: string[]; client: { name: string; timezone: string } };
  extra?: string | null;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-2.5 last:border-0">
      <div className="min-w-0">
        <Link href={`/posts/${post.id}`} className="text-sm font-medium text-zinc-900 hover:underline">
          {post.client.name}
        </Link>
        <p className="text-xs text-zinc-500">
          {formatarDataHora(post.scheduledAt, post.client.timezone)}
          {extra ? ` - ${extra}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {post.networks.map((n) => (
          <IconeRede key={n} network={n as "INSTAGRAM" | "FACEBOOK"} />
        ))}
        <Etiqueta status={post.status as PostStatus} />
      </div>
    </li>
  );
}

export default async function Dashboard() {
  const d = await buscarDados();
  const { clientesComSaldoBaixo } = await import("@/services/saldo.ts");
  const saldoBaixo = await clientesComSaldoBaixo();
  const quebradas = d.conexoes.filter((c) => c.status !== "NAO_CONFIGURADO");
  const aguardando = d.conexoes.filter((c) => c.status === "NAO_CONFIGURADO");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {d.totalMes} post(s) no mes - {d.pendentes.length} aguardando o cliente
          </p>
        </div>
        <div className="flex gap-2">
          <BotaoLink href="/calendario">Calendario</BotaoLink>
          <BotaoLink href="/posts/novo" variante="primario">
            Novo post
          </BotaoLink>
        </div>
      </header>

{/*
        Duas coisas bem diferentes moravam no mesmo alerta vermelho: ativo que
        nunca foi configurado (normal enquanto o token do System User nao
        existe) e conexao que quebrou (urgente). Separado, porque um painel
        vermelho o tempo todo deixa de ser aviso.
      */}
      {saldoBaixo.length > 0 && (
        <Aviso
          tom="atencao"
          titulo={`${saldoBaixo.length} cliente(s) com o saldo de anuncios no limite`}
        >
          <ul className="mt-1 space-y-0.5">
            {saldoBaixo.map((s) => (
              <li key={s.clienteId}>
                <Link href={`/clientes/${s.clienteId}/saldo`} className="underline">
                  {s.cliente}
                </Link>{" "}
                - restam{" "}
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  s.saldo,
                )}
                {s.diasRestantes !== null ? ` (cerca de ${s.diasRestantes} dia(s))` : ""}
              </li>
            ))}
          </ul>
          <span className="mt-1 block text-xs">
            O PIX de recarga ja esta pronto na aba Saldo de cada um.
          </span>
        </Aviso>
      )}

      {quebradas.length > 0 && (
        <Aviso tom="erro" titulo={`${quebradas.length} conexao(oes) com a Meta pararam de responder`}>
          <ul className="mt-1 space-y-0.5">
            {quebradas.map((c) => (
              <li key={c.id}>
                {c.client.name} - {c.assetType}: {c.status}
                {c.lastError ? ` (${c.lastError})` : ""}
              </li>
            ))}
          </ul>
          <Link href="/conexoes" className="mt-2 inline-block font-semibold underline">
            Abrir conexoes
          </Link>
        </Aviso>
      )}

      {aguardando.length > 0 && (
        <Aviso tom="atencao" titulo={`${aguardando.length} ativo(s) esperando o acesso da Meta`}>
          Cadastrados e prontos, mas ainda sem token do System User - por isso nenhum deles publica.{" "}
          <Link href="/conexoes" className="font-semibold underline">
            Ver a lista
          </Link>
        </Aviso>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Aguardando aprovacao do cliente">
          {d.pendentes.length === 0 ? (
            <Vazio>Nenhum post esperando resposta.</Vazio>
          ) : (
            <ul>
              {d.pendentes.map((p) => (
                <LinhaPost key={p.id} post={p} />
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Proximas publicacoes (aprovadas)">
          {d.proximos.length === 0 ? (
            <Vazio>Nada aprovado na fila.</Vazio>
          ) : (
            <ul>
              {d.proximos.map((p) => (
                <LinhaPost key={p.id} post={p} />
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="POST SEM RESPOSTA">
          {d.semResposta.length === 0 ? (
            <Vazio>Nenhum post perdeu a data por falta de resposta.</Vazio>
          ) : (
            <ul>
              {d.semResposta.map((p) => (
                <LinhaPost key={p.id} post={p} extra="nao publicado" />
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Reprovados">
          {d.reprovados.length === 0 ? (
            <Vazio>Nenhuma reprovacao em aberto.</Vazio>
          ) : (
            <ul>
              {d.reprovados.map((p) => (
                <LinhaPost
                  key={p.id}
                  post={p}
                  extra={p.decisions[0]?.comment?.slice(0, 60) ?? null}
                />
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Falhas de publicacao" className="lg:col-span-2">
          {d.falhas.length === 0 ? (
            <Vazio>Nenhuma falha pendente.</Vazio>
          ) : (
            <ul>
              {d.falhas.map((p) => (
                <LinhaPost key={p.id} post={p} extra={p.lastError?.slice(0, 80) ?? null} />
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}
