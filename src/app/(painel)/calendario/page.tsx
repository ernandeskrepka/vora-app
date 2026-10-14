import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { FUSO_PADRAO, formatarHora, intervaloDoMes } from "@/lib/datetime.ts";
import { formatInTimeZone } from "date-fns-tz";
import { Cartao, Etiqueta, Vazio, classeInput } from "@/components/ui.tsx";
import { ROTULO_STATUS, type PostStatus } from "@/domain/post-status.ts";

export const dynamic = "force-dynamic";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export default async function Calendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cliente?: string }>;
}) {
  await exigirUsuario();
  const params = await searchParams;

  const hoje = new Date();
  const [anoStr, mesStr] = (params.mes ?? formatInTimeZone(hoje, FUSO_PADRAO, "yyyy-MM")).split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const { inicio, fim } = intervaloDoMes(ano, mes);

  const [clientes, posts] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.post.findMany({
      where: {
        scheduledAt: { gte: inicio, lt: fim },
        ...(params.cliente ? { clientId: params.cliente } : {}),
      },
      include: { client: true },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  // Monta a grade do mes no fuso local.
  const diasDoMes = new Date(ano, mes, 0).getDate();
  const primeiroDiaSemana = new Date(`${ano}-${String(mes).padStart(2, "0")}-01T12:00:00`).getDay();
  const celulas: Array<{ dia: number | null; posts: typeof posts }> = [];

  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push({ dia: null, posts: [] });
  for (let dia = 1; dia <= diasDoMes; dia++) {
    const chave = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    celulas.push({
      dia,
      posts: posts.filter((p) => formatInTimeZone(p.scheduledAt, FUSO_PADRAO, "yyyy-MM-dd") === chave),
    });
  }

  const mesAnterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const mesSeguinte = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const qs = (m: string) => `?mes=${m}${params.cliente ? `&cliente=${params.cliente}` : ""}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Calendario</h1>
          <p className="text-sm text-zinc-500">
            {formatInTimeZone(inicio, FUSO_PADRAO, "MMMM yyyy")} - {posts.length} post(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={qs(mesAnterior)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
            Anterior
          </Link>
          <Link href={qs(mesSeguinte)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
            Proximo
          </Link>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="mes" value={`${ano}-${String(mes).padStart(2, "0")}`} />
            <select name="cliente" defaultValue={params.cliente ?? ""} className={classeInput}>
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
              Filtrar
            </button>
          </form>
        </div>
      </header>

      <Cartao>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-zinc-200 text-xs">
          {DIAS.map((d) => (
            <div key={d} className="bg-zinc-50 px-2 py-1.5 text-center font-semibold text-zinc-600">
              {d}
            </div>
          ))}
          {celulas.map((celula, i) => (
            <div key={i} className="min-h-[92px] bg-white p-1.5">
              {celula.dia && <p className="mb-1 text-[11px] font-semibold text-zinc-400">{celula.dia}</p>}
              <ul className="space-y-1">
                {celula.posts.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/posts/${p.id}`}
                      className={`block truncate rounded border px-1.5 py-1 text-[11px] status-${p.status}`}
                      title={`${p.client.name} - ${ROTULO_STATUS[p.status as PostStatus]}`}
                    >
                      {formatarHora(p.scheduledAt)} {p.client.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Lista do mes">
        {posts.length === 0 ? (
          <Vazio>Nenhum post nesse mes.</Vazio>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/posts/${p.id}`} className="text-sm hover:underline">
                  {formatInTimeZone(p.scheduledAt, p.client.timezone, "dd/MM 'as' HH:mm")} - {p.client.name}
                </Link>
                <Etiqueta status={p.status as PostStatus} />
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
