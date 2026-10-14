import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { FUSO_PADRAO } from "@/lib/datetime.ts";
import { formatInTimeZone } from "date-fns-tz";
import { Aviso, Cartao, Vazio } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function Relatorios() {
  await exigirUsuario();
  const mesAtual = formatInTimeZone(new Date(), FUSO_PADRAO, "yyyy-MM");

  const clientes = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      metaConnections: { where: { assetType: "AD_ACCOUNT" } },
      _count: { select: { adInsights: true } },
    },
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">Relatorios</h1>
        <p className="text-sm text-zinc-500">
          Resultados de anuncios e historico de posts, por cliente e por mes.
        </p>
      </header>

      <Aviso tom="info" titulo="Fase 2">
        Os resultados de anuncios dependem da conta de anuncios conectada e da coleta diaria. Os
        posts (publicados, reprovados e POST SEM RESPOSTA) aparecem desde o primeiro mes de uso.
      </Aviso>

      <Cartao>
        {clientes.length === 0 ? (
          <Vazio>Nenhum cliente ativo.</Vazio>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {clientes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link
                    href={`/relatorios/${c.id}?mes=${mesAtual}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {c.metaConnections.length > 0
                      ? `conta de anuncios conectada - ${c._count.adInsights} dia(s) coletado(s)`
                      : "sem conta de anuncios conectada"}
                  </p>
                </div>
                <Link href={`/relatorios/${c.id}?mes=${mesAtual}`} className="text-sm underline">
                  abrir relatorio
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
