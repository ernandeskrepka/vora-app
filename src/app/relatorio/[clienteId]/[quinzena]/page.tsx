import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { relatorioDaQuinzena } from "@/services/relatorios.ts";
import { assinaturaDoRelatorioValida } from "@/services/relatorio-link.ts";
import { quinzenaPorChave, rotuloDaQuinzena } from "@/domain/quinzena.ts";
import { RelatorioConteudo } from "@/components/relatorio-conteudo.tsx";
import { BotaoImprimir } from "@/components/botao-imprimir.tsx";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Relatorio | VORA",
  robots: { index: false, follow: false },
};

/**
 * Relatorio que o cliente abre pelo link, sem login.
 *
 * O conteudo e o mesmo do painel; o que muda e a moldura: sem menu, sem
 * numeros internos e com o papel preparado para virar PDF na impressao.
 */
export default async function RelatorioDoCliente({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string; quinzena: string }>;
  searchParams: Promise<{ a?: string }>;
}) {
  const { clienteId, quinzena: chave } = await params;
  const { a } = await searchParams;

  const quinzena = quinzenaPorChave(chave);
  if (!quinzena || !a || !assinaturaDoRelatorioValida(clienteId, chave, a)) notFound();

  const r = await relatorioDaQuinzena({ clientId: clienteId, quinzena });

  return (
    <main className="min-h-screen bg-vora-claro px-4 py-8 print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <img src="/marca/vora-logo.svg" alt="VORA" className="h-6 w-auto" />
            <h1 className="mt-3 text-2xl font-semibold text-zinc-900">{r.cliente.name}</h1>
            <p className="text-sm text-zinc-600">
              Resultados de {rotuloDaQuinzena(quinzena)}
            </p>
          </div>
          <div className="nao-imprimir">
            <BotaoImprimir />
          </div>
        </header>

        <p className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-600">
          Este e o resumo dos ultimos quinze dias. Cada numero vem com a explicacao do que ele
          significa, e a comparacao e sempre com a quinzena anterior - olhar um dia isolado nao diz
          muita coisa, o que conta e o movimento do periodo.
        </p>

        <RelatorioConteudo
          quinzena={quinzena}
          totais={r.anuncios.totais}
          temDados={r.anuncios.temDados}
          campanhas={r.anuncios.campanhas}
          serie={r.anuncios.serie}
          comparativo={r.comparativo}
          publicados={r.posts.publicados}
          semResposta={r.posts.semResposta.length}
          paraCliente
        />

        <footer className="mt-10 border-t border-zinc-200 pt-5 text-center text-xs text-zinc-500">
          <img src="/marca/vora-simbolo.svg" alt="" className="mx-auto h-5 w-auto opacity-50" />
          <p className="mt-2">Relatorio gerado pela VORA · vorabr.com</p>
        </footer>
      </div>
    </main>
  );
}
