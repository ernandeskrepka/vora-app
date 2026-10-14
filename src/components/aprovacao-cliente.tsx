"use client";

import { useActionState, useState } from "react";
import { acaoDecidir, type EstadoDecisao } from "@/app/aprovar/[token]/actions.ts";

type Midia = { id: string; kind: "IMAGEM" | "VIDEO"; url: string };

export function CarrosselCriativo({ midias }: { midias: Midia[] }) {
  const [indice, setIndice] = useState(0);
  const atual = midias[indice];
  if (!atual) return null;

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-black">
        {atual.kind === "VIDEO" ? (
          <video src={atual.url} controls playsInline className="max-h-[70vh] w-full object-contain" />
        ) : (
          <img src={atual.url} alt="Criativo" className="max-h-[70vh] w-full object-contain" />
        )}

        {midias.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndice((i) => (i === 0 ? midias.length - 1 : i - 1))}
              aria-label="Anterior"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setIndice((i) => (i + 1) % midias.length)}
              aria-label="Proximo"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white"
            >
              ›
            </button>
            <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {indice + 1}/{midias.length}
            </span>
          </>
        )}
      </div>

      {midias.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {midias.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIndice(i)}
              aria-label={`Item ${i + 1}`}
              className={`h-1.5 w-6 rounded-full ${i === indice ? "bg-vora-verde" : "bg-zinc-600"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FormularioDecisao({ token }: { token: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoDecisao, FormData>(acaoDecidir, null);
  const [decisao, setDecisao] = useState<"APROVADO" | "REPROVADO" | null>(null);

  if (estado?.decidido) {
    return (
      <div className="rounded-xl border border-vora-verde/40 bg-vora-verde/10 p-5 text-center">
        <p className="text-lg font-semibold text-vora-verde">
          {estado.decidido === "APROVADO" ? "Post aprovado!" : "Post reprovado."}
        </p>
        <p className="mt-1 text-sm text-zinc-300">
          {estado.decidido === "APROVADO"
            ? "Vamos publicar no horario combinado. Obrigado!"
            : "A equipe da VORA foi avisada e vai ajustar o criativo."}
        </p>
      </div>
    );
  }

  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decisao" value={decisao ?? ""} />

      {estado?.erro && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {estado.erro}
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-200">Seu nome</span>
        <input
          name="nome"
          required
          minLength={2}
          placeholder="Quem esta aprovando?"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-white outline-none focus:border-vora-verde"
        />
        <span className="mt-1 block text-xs text-zinc-500">
          Fica registrado junto da sua decisao, com data e hora.
        </span>
      </label>

      {decisao === "REPROVADO" && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-200">O que precisa ajustar?</span>
          <textarea
            name="comentario"
            required
            rows={4}
            placeholder="Ex.: trocar a foto do segundo item, corrigir o telefone na legenda..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-white outline-none focus:border-vora-verde"
          />
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          disabled={enviando}
          onClick={() => setDecisao("APROVADO")}
          className="rounded-xl bg-vora-verde px-4 py-4 text-base font-bold text-black transition hover:bg-vora-verde-escuro disabled:opacity-50"
        >
          {enviando && decisao === "APROVADO" ? "Registrando..." : "Aprovar"}
        </button>

        {decisao === "REPROVADO" ? (
          <button
            type="submit"
            disabled={enviando}
            className="rounded-xl border border-rose-500 bg-rose-500/10 px-4 py-4 text-base font-bold text-rose-200 disabled:opacity-50"
          >
            {enviando ? "Registrando..." : "Confirmar reprovacao"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setDecisao("REPROVADO")}
            className="rounded-xl border border-zinc-600 px-4 py-4 text-base font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            Reprovar
          </button>
        )}
      </div>
    </form>
  );
}
