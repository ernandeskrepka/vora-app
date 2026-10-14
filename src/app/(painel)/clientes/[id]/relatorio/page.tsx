import { redirect } from "next/navigation";
import { FUSO_PADRAO } from "@/lib/datetime.ts";
import { formatInTimeZone } from "date-fns-tz";

/** O relatorio mensal vive em /relatorios/[clienteId]; aqui so encaminhamos. */
export default async function RelatorioDoCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mes = formatInTimeZone(new Date(), FUSO_PADRAO, "yyyy-MM");
  redirect(`/relatorios/${id}?mes=${mes}`);
}
