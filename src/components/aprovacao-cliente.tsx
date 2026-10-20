"use client";

import { useActionState, useState } from "react";
import { acaoDecidir, type EstadoDecisao } from "@/app/aprovar/[token]/actions.ts";

export type MidiaCliente = { id: string; kind: "IMAGEM" | "VIDEO"; url: string };

export type ItemPerfil = {
  id: string;
  url: string;
  carrossel: boolean;
  video: boolean;
};

export type DadosAprovacao = {
  token: string;
  estado: "PENDENTE" | "JA_DECIDIDO" | "EXPIRADO" | "SUBSTITUIDO" | "ENCERRADO";
  cliente: string;
  legenda: string;
  formato: string;
  redes: string;
  quando: string;
  diaSemana: string;
  hora: string;
  midias: MidiaCliente[];
  perfil: { handle: string; nome: string; totalPublicados: number; publicados: ItemPerfil[] };
  statusTexto: string;
  decisao: { tipo: "APROVADO" | "REPROVADO"; nome: string; comentario: string | null; quando: string } | null;
  publicadoEm: string | null;
  links: Array<{ rede: string; url: string }>;
};

/* ------------------------------------------------------------ carrossel */

function Carrossel({ midias }: { midias: MidiaCliente[] }) {
  const [indice, setIndice] = useState(0);
  const atual = midias[indice];
  if (!atual) return null;

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
        {atual.kind === "VIDEO" ? (
          <video src={atual.url} controls playsInline className="w-full" />
        ) : (
          <img src={atual.url} alt="" className="w-full" />
        )}

        {midias.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndice((i) => (i === 0 ? midias.length - 1 : i - 1))}
              aria-label="Anterior"
              className="absolute top-1/2 left-3 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-lg text-white backdrop-blur transition hover:bg-black/75"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setIndice((i) => (i + 1) % midias.length)}
              aria-label="Proximo"
              className="absolute top-1/2 right-3 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-lg text-white backdrop-blur transition hover:bg-black/75"
            >
              ›
            </button>
            <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              {indice + 1}/{midias.length}
            </span>
          </>
        )}
      </div>

      {midias.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {midias.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIndice(i)}
              aria-label={`Item ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === indice ? "w-7 bg-vora-verde" : "w-2.5 bg-superficie/25"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- previa perfil */

function PreviaPerfil({ dados }: { dados: DadosAprovacao }) {
  const capa = dados.midias[0];
  const iniciais = dados.cliente
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-superficie/[0.03]">
      <div className="flex items-center gap-4 px-4 pt-5 pb-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-vora-verde to-vora-verde-escuro text-lg font-black text-black">
          {iniciais}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-white">{dados.perfil.handle}</p>
          <p className="truncate text-sm text-tinta-4">{dados.perfil.nome}</p>
          <p className="mt-1 text-xs text-tinta-3">
            {dados.perfil.totalPublicados + 1} publicações com esta
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0.5 bg-superficie/5 p-0.5">
        <div className="relative aspect-4/5 overflow-hidden bg-black ring-2 ring-vora-verde ring-inset">
          {capa?.kind === "VIDEO" ? (
            <video src={capa.url} muted className="h-full w-full object-cover" />
          ) : (
            <img src={capa?.url} alt="" className="h-full w-full object-cover" />
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-vora-verde px-2 py-0.5 text-[10px] font-bold tracking-wide text-black uppercase">
            novo
          </span>
          {dados.midias.length > 1 && (
            <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 text-[10px] text-white">
              1/{dados.midias.length}
            </span>
          )}
        </div>

        {dados.perfil.publicados.map((item) => (
          <div key={item.id} className="relative aspect-4/5 overflow-hidden bg-black">
            <img src={item.url} alt="" className="h-full w-full object-cover opacity-90" />
            {item.carrossel && (
              <span className="absolute top-1.5 right-1.5 rounded bg-black/55 px-1.5 text-[10px] text-white">
                ❏
              </span>
            )}
          </div>
        ))}

        {dados.perfil.publicados.length < 5 &&
          Array.from({ length: 5 - dados.perfil.publicados.length }).map((_, i) => (
            <div key={`vazio-${i}`} className="aspect-4/5 bg-superficie/[0.02]" />
          ))}
      </div>

      <p className="px-4 py-3 text-xs text-tinta-3">
        Prévia da grade com os posts que já publicamos para você. O Instagram recorta a grade
        em 4:5.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- decisao */

function FormularioDecisao({ token }: { token: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoDecisao, FormData>(acaoDecidir, null);
  // Só controla se o campo de comentário aparece. A decisão em si viaja no
  // name/value do botão que enviou o formulário: um estado do React não
  // estaria no DOM a tempo do submit (foi assim que o botão Aprovar falhou).
  const [reprovando, setReprovando] = useState(false);

  if (estado?.decidido) {
    const aprovado = estado.decidido === "APROVADO";
    return (
      <div
        className={`rounded-2xl border p-6 text-center ${
          aprovado ? "border-vora-verde/40 bg-vora-verde/10" : "border-rose-500/40 bg-rose-500/10"
        }`}
      >
        <p className={`titulo text-xl ${aprovado ? "text-vora-verde" : "text-rose-300"}`}>
          {aprovado ? "Post aprovado!" : "Reprovado, obrigado."}
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          {aprovado
            ? "Vamos publicar no horário combinado. Você recebe um aviso quando sair."
            : "A equipe da VORA já foi avisada e vai ajustar o criativo."}
        </p>
      </div>
    );
  }

  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {estado?.erro && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {estado.erro}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-zinc-200">Seu nome</span>
        <input
          name="nome"
          required
          minLength={2}
          placeholder="Quem está aprovando?"
          className="w-full rounded-xl border border-white/15 bg-superficie/[0.04] px-4 py-3.5 text-base text-white placeholder:text-tinta-3 outline-none transition focus:border-vora-verde focus:bg-white/[0.07]"
        />
        <span className="mt-1.5 block text-xs text-tinta-3">
          Fica registrado junto da sua decisão, com data e hora.
        </span>
      </label>

      {reprovando && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-200">
            O que precisa ajustar?
          </span>
          <textarea
            name="comentario"
            required
            rows={4}
            placeholder="Ex.: trocar a foto do segundo card, corrigir o telefone na legenda..."
            className="w-full rounded-xl border border-white/15 bg-superficie/[0.04] px-4 py-3 text-base text-white placeholder:text-tinta-3 outline-none transition focus:border-vora-verde focus:bg-white/[0.07]"
          />
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          name="decisao"
          value="APROVADO"
          disabled={enviando}
          className="titulo rounded-xl bg-vora-verde px-4 py-4 text-base text-black shadow-lg shadow-vora-verde/20 transition hover:bg-vora-verde-escuro disabled:opacity-50"
        >
          {enviando ? "Registrando..." : "Aprovar"}
        </button>

        {reprovando ? (
          <button
            type="submit"
            name="decisao"
            value="REPROVADO"
            disabled={enviando}
            className="titulo rounded-xl border border-rose-500/60 bg-rose-500/10 px-4 py-4 text-base text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            {enviando ? "Registrando..." : "Confirmar reprovação"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setReprovando(true)}
            className="rounded-xl border border-white/15 px-4 py-4 text-base font-medium text-zinc-300 transition hover:bg-white/5"
          >
            Reprovar
          </button>
        )}
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- pagina */

export function PaginaAprovacaoCliente({ dados }: { dados: DadosAprovacao }) {
  const [aba, setAba] = useState<"post" | "perfil">("post");
  const pendente = dados.estado === "PENDENTE";

  return (
    <main className="relative min-h-screen overflow-hidden bg-vora-preto">
      {/* brilho da marca no topo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-vora-verde/20 blur-[100px]"
      />

      <div className="relative mx-auto w-full max-w-lg px-4 pt-8 pb-16">
        <header className="mb-7">
          <img src="/marca/vora-logo.svg" alt="VORA" className="h-5 w-auto" />
          <h1 className="titulo mt-6 text-3xl leading-[1.1] text-white text-balance">
            {pendente ? "Um post novo para você aprovar" : "Post"}
          </h1>
          <p className="mt-2 text-[15px] text-tinta-4">
            {dados.cliente} · {dados.redes}
          </p>
        </header>

        <div className="mb-5 flex gap-1 rounded-full border border-white/10 bg-superficie/[0.04] p-1">
          {([
            ["post", "O post"],
            ["perfil", "No perfil"],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setAba(valor)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                aba === valor ? "bg-superficie text-black" : "text-tinta-4 hover:text-white"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba === "post" ? (
          <div className="space-y-5">
            <Carrossel midias={dados.midias} />

            <section className="rounded-2xl border border-white/10 bg-superficie/[0.03] p-4">
              <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-tinta-3 uppercase">
                Legenda
              </h2>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-200">
                {dados.legenda || <span className="text-tinta-3">Sem legenda.</span>}
              </p>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Dado rotulo="Formato" valor={dados.formato} />
              <Dado rotulo="Onde vai sair" valor={dados.redes} />
              <Dado rotulo="Previsto para" valor={`${dados.diaSemana} as ${dados.hora}`} largo />
            </section>
          </div>
        ) : (
          <PreviaPerfil dados={dados} />
        )}

        <div className="mt-7">
          {pendente ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
                Sem a sua resposta até o horário previsto, o post não é publicado.
              </p>
              <FormularioDecisao token={dados.token} />
            </div>
          ) : (
            <StatusFinal dados={dados} />
          )}
        </div>

        <footer className="mt-12 flex flex-col items-center gap-3 text-center">
          <img src="/marca/vora-simbolo.svg" alt="" className="h-5 w-auto opacity-40" />
          <p className="text-xs text-tinta-2">
            Produção de conteúdo VORA. Qualquer dúvida, fale com a nossa equipe.
          </p>
        </footer>
      </div>
    </main>
  );
}

function Dado({ rotulo, valor, largo }: { rotulo: string; valor: string; largo?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-superficie/[0.03] px-3.5 py-3 ${largo ? "col-span-2" : ""}`}
    >
      <p className="text-[10px] tracking-[0.12em] text-tinta-3 uppercase">{rotulo}</p>
      <p className="mt-0.5 text-[15px] font-medium text-white">{valor}</p>
    </div>
  );
}

function StatusFinal({ dados }: { dados: DadosAprovacao }) {
  const { decisao } = dados;
  const semResposta = dados.statusTexto === "POST SEM RESPOSTA";

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-superficie/[0.03] p-6 text-center">
      {decisao ? (
        <>
          <p className="titulo text-xl text-white">
            {decisao.tipo === "APROVADO" ? "Aprovado" : "Reprovado"} por {decisao.nome}
          </p>
          <p className="text-sm text-tinta-4">em {decisao.quando}</p>
          {decisao.comentario && (
            <p className="rounded-xl bg-superficie/5 px-4 py-3 text-sm text-zinc-300">
              “{decisao.comentario}”
            </p>
          )}
        </>
      ) : semResposta ? (
        <>
          <p className="titulo text-xl text-orange-300">POST SEM RESPOSTA</p>
          <p className="text-sm text-tinta-4">
            O horário previsto passou sem aprovação, por isso esse post não foi publicado.
          </p>
        </>
      ) : (
        <>
          <p className="titulo text-xl text-white">{dados.statusTexto}</p>
          <p className="text-sm text-tinta-4">Esse link não está mais aberto para resposta.</p>
        </>
      )}

      {dados.publicadoEm && (
        <div className="space-y-1 pt-2">
          <p className="text-sm text-zinc-300">Publicado em {dados.publicadoEm}</p>
          {dados.links.map((l) => (
            <a
              key={l.rede}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="block text-sm font-medium text-vora-verde underline"
            >
              Ver no {l.rede}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
