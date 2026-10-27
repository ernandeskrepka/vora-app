import type { Metadata } from "next";
import {
  formatarDataHora,
  formatarDiaExtenso,
  formatarHora,
} from "@/lib/datetime.ts";
import { carregarPorToken } from "@/services/aprovacao.ts";
import { ROTULO_STATUS } from "@/domain/post-status.ts";
import {
  PaginaAprovacaoCliente,
  type DadosAprovacao,
} from "@/components/aprovacao-cliente.tsx";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aprovacao de post | VORA",
  robots: { index: false, follow: false },
};

const ROTULO_FORMATO: Record<string, string> = {
  IMAGEM_UNICA: "Imagem",
  CARROSSEL: "Carrossel",
  VIDEO: "Video",
  REELS: "Reels",
};

export default async function PaginaAprovacao({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const visao = await carregarPorToken(token);

  if (!visao) {
    return (
      <main className="grid min-h-screen place-items-center bg-vora-preto px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <img
            src="/marca/vora-logo.svg"
            alt="VORA"
            className="mx-auto h-5 w-auto opacity-80"
          />
          <h1 className="titulo mt-6 text-xl text-white">Link invalido</h1>
          <p className="mt-2 text-sm text-tinta-4">
            Esse link nao existe ou foi substituido por uma versao mais nova do
            post. Fale com a equipe da VORA.
          </p>
        </div>
      </main>
    );
  }

  const fuso = visao.timezone;

  const dados: DadosAprovacao = {
    token,
    estado: visao.estado,
    cliente: visao.clienteNome,
    legenda: visao.caption,
    formato: ROTULO_FORMATO[visao.formato] ?? visao.formato,
    redes: visao.networks
      .map((n) => (n === "INSTAGRAM" ? "Instagram" : "Facebook"))
      .join(" e "),
    quando: formatarDataHora(visao.scheduledAt, fuso),
    diaSemana: formatarDiaExtenso(visao.scheduledAt, fuso),
    hora: formatarHora(visao.scheduledAt, fuso),
    midias: visao.midias.map((m) => ({ id: m.id, kind: m.kind, url: m.url })),
    perfil: {
      handle: `@${visao.perfil.handle}`,
      nome: visao.perfil.nome,
      totalPublicados: visao.perfil.totalPublicados,
      publicados: visao.perfil.publicados.map((p) => ({
        id: p.id,
        url: p.url,
        carrossel: p.carrossel,
        video: p.video,
      })),
    },
    statusTexto: ROTULO_STATUS[visao.statusDoPost],
    decisao: visao.decisao
      ? {
          tipo: visao.decisao.tipo,
          nome: visao.decisao.nome,
          comentario: visao.decisao.comentario,
          quando: formatarDataHora(visao.decisao.quando, fuso),
        }
      : null,
    publicadoEm: visao.publicadoEm
      ? formatarDataHora(visao.publicadoEm, fuso)
      : null,
    links: visao.links
      .filter((l) => l.permalink)
      .map((l) => ({
        rede: l.network === "INSTAGRAM" ? "Instagram" : "Facebook",
        url: l.permalink!,
      })),
  };

  return <PaginaAprovacaoCliente dados={dados} />;
}
