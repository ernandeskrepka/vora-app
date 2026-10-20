import Link from "next/link";
import { exigirUsuario } from "@/lib/auth.ts";
import { relatorioDaQuinzena } from "@/services/relatorios.ts";
import {
  quinzenaDe,
  quinzenaAnterior,
  quinzenaPorChave,
  quinzenaSeguinte,
  rotuloDaQuinzena,
} from "@/domain/quinzena.ts";
import { linkDoRelatorio } from "@/services/relatorio-link.ts";
import { Cartao } from "@/components/ui.tsx";
import { BotaoImprimir } from "@/components/botao-imprimir.tsx";
import { CopiarLink } from "@/components/copiar-link.tsx";
import { RelatorioConteudo } from "@/components/relatorio-conteudo.tsx";

export const dynamic = "force-dynamic";

export default async function RelatorioCliente({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirUsuario();
  const { clienteId } = await params;
  const { periodo } = await searchParams;

  const quinzena = (periodo ? quinzenaPorChave(periodo) : null) ?? quinzenaDe(new Date());
  const r = await relatorioDaQuinzena({ clientId: clienteId, quinzena });

  const anterior = quinzenaAnterior(quinzena);
  const seguinte = quinzenaSeguinte(quinzena);
  const link = await linkDoRelatorio(clienteId, quinzena.chave);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-tinta">{r.cliente.name}</h1>
          <p className="text-sm text-tinta-3">
            Relatorio da quinzena · {rotuloDaQuinzena(quinzena)}
          </p>
        </div>
        <div className="nao-imprimir flex items-center gap-2">
          <Link
            href={`/relatorios/${clienteId}?periodo=${anterior.chave}`}
            className="rounded-lg border border-linha-forte bg-superficie px-3 py-2 text-sm"
          >
            Quinzena anterior
          </Link>
          <Link
            href={`/relatorios/${clienteId}?periodo=${seguinte.chave}`}
            className="rounded-lg border border-linha-forte bg-superficie px-3 py-2 text-sm"
          >
            Proxima
          </Link>
          <BotaoImprimir />
        </div>
      </header>

      <Cartao titulo="Enviar para o cliente">
        <p className="text-sm text-tinta-2">
          Mesmo relatorio, sem login e sem o painel: o cliente abre no celular. O link vale so para
          essa quinzena e para esse cliente - e assinado, entao trocar a data na barra de enderecos
          nao abre outro periodo.
        </p>
        <div className="mt-3">
          <CopiarLink url={link} />
        </div>
      </Cartao>

      <RelatorioConteudo
        quinzena={quinzena}
        totais={r.anuncios.totais}
        temDados={r.anuncios.temDados}
        campanhas={r.anuncios.campanhas}
        serie={r.anuncios.serie}
        comparativo={r.comparativo}
        publicados={r.posts.publicados}
        semResposta={r.posts.semResposta.length}
      />

      <p className="nao-imprimir text-xs text-tinta-3">
        Para PDF, use Imprimir e salve como PDF. O layout de impressao esconde a navegacao.
      </p>
    </div>
  );
}
