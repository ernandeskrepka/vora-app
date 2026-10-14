import type { Metadata } from "next";
import { formatarDataHora, formatarDiaExtenso } from "@/lib/datetime.ts";
import { carregarPorToken } from "@/services/aprovacao.ts";
import { ROTULO_STATUS } from "@/domain/post-status.ts";
import { CarrosselCriativo, FormularioDecisao } from "@/components/aprovacao-cliente.tsx";

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

export default async function PaginaAprovacao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const visao = await carregarPorToken(token);

  if (!visao) {
    return (
      <Moldura>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-center">
          <h1 className="text-lg font-semibold text-white">Link invalido</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Esse link nao existe ou foi substituido. Fale com a equipe da VORA.
          </p>
        </div>
      </Moldura>
    );
  }

  const redes = visao.networks
    .map((n) => (n === "INSTAGRAM" ? "Instagram" : "Facebook"))
    .join(" e ");

  return (
    <Moldura>
      <header className="mb-5">
        <p className="text-2xl font-bold tracking-tight text-vora-verde">VORA</p>
        <h1 className="mt-3 text-xl font-semibold text-white">
          {visao.estado === "PENDENTE" ? "Post para sua aprovacao" : "Post"}
        </h1>
        <p className="text-sm text-zinc-400">{visao.clienteNome}</p>
      </header>

      <div className="space-y-5">
        <CarrosselCriativo midias={visao.midias} />

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-zinc-500 uppercase">
            Legenda
          </h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-200">
            {visao.caption || <span className="text-zinc-500">Sem legenda.</span>}
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3 text-sm">
          <Info rotulo="Onde vai sair" valor={redes} />
          <Info rotulo="Formato" valor={ROTULO_FORMATO[visao.formato] ?? visao.formato} />
          <Info
            rotulo="Previsto para"
            valor={`${formatarDiaExtenso(visao.scheduledAt, visao.timezone)} as ${formatarDataHora(
              visao.scheduledAt,
              visao.timezone,
            ).split(" as ")[1]}`}
            largo
          />
        </section>

        {visao.estado === "PENDENTE" ? (
          <>
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              Sem a sua resposta ate o horario previsto, o post nao e publicado.
            </p>
            <FormularioDecisao token={token} />
          </>
        ) : (
          <StatusFinal visao={visao} />
        )}
      </div>

      <footer className="mt-8 text-center text-xs text-zinc-600">
        VORA - producao de conteudo. Qualquer duvida, fale com a nossa equipe.
      </footer>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-vora-preto px-4 py-8">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  );
}

function Info({ rotulo, valor, largo }: { rotulo: string; valor: string; largo?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 ${largo ? "col-span-2" : ""}`}
    >
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{rotulo}</p>
      <p className="text-sm font-medium text-white">{valor}</p>
    </div>
  );
}

function StatusFinal({ visao }: { visao: NonNullable<Awaited<ReturnType<typeof carregarPorToken>>> }) {
  const { decisao, statusDoPost } = visao;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-center">
      {decisao ? (
        <>
          <p className="text-lg font-semibold text-white">
            {decisao.tipo === "APROVADO" ? "Aprovado" : "Reprovado"} por {decisao.nome}
          </p>
          <p className="text-sm text-zinc-400">
            em {formatarDataHora(decisao.quando, visao.timezone)}
          </p>
          {decisao.comentario && (
            <p className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
              "{decisao.comentario}"
            </p>
          )}
        </>
      ) : statusDoPost === "POST_SEM_RESPOSTA" ? (
        <>
          <p className="text-lg font-semibold text-orange-300">POST SEM RESPOSTA</p>
          <p className="text-sm text-zinc-400">
            O horario previsto passou sem aprovacao, por isso esse post nao foi publicado.
          </p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-white">{ROTULO_STATUS[statusDoPost]}</p>
          <p className="text-sm text-zinc-400">Esse link nao esta mais aberto para resposta.</p>
        </>
      )}

      {statusDoPost === "PUBLICADO" && (
        <div className="space-y-1 pt-2">
          <p className="text-sm text-zinc-300">
            Publicado {visao.publicadoEm ? `em ${formatarDataHora(visao.publicadoEm, visao.timezone)}` : ""}
          </p>
          {visao.links
            .filter((l) => l.permalink)
            .map((l) => (
              <a
                key={l.network}
                href={l.permalink!}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-semibold text-vora-verde underline"
              >
                Ver no {l.network === "INSTAGRAM" ? "Instagram" : "Facebook"}
              </a>
            ))}
        </div>
      )}
    </div>
  );
}
