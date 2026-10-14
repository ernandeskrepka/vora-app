"use client";

import { useActionState, useMemo, useState } from "react";
import { Aviso, Botao, Campo, Cartao, classeInput } from "@/components/ui.tsx";
import type { EstadoFormulario } from "@/app/actions/posts.ts";

type Cliente = { id: string; name: string };

type MidiaExistente = { id: string; url: string; kind: "IMAGEM" | "VIDEO" };

/** Itens escolhidos na biblioteca do cliente, ja na ordem do carrossel. */
type MaterialEscolhido = { id: string; url: string; kind: "IMAGEM" | "VIDEO"; nome: string };

const FORMATOS = [
  { valor: "IMAGEM_UNICA", rotulo: "Imagem unica" },
  { valor: "CARROSSEL", rotulo: "Carrossel (2 a 10)" },
  { valor: "VIDEO", rotulo: "Video (feed)" },
  { valor: "REELS", rotulo: "Reels" },
];

export function FormularioPost({
  acao,
  clientes,
  inicial,
  midiaExistente = [],
  materiais = [],
  pautaId,
  modo,
}: {
  acao: (estado: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>;
  clientes: Cliente[];
  inicial?: {
    postId?: string;
    clientId?: string;
    caption?: string;
    formato?: string;
    networks?: string[];
    dataHora?: string;
  };
  midiaExistente?: MidiaExistente[];
  materiais?: MaterialEscolhido[];
  pautaId?: string;
  modo: "criar" | "editar";
}) {
  const [estado, enviar, enviando] = useActionState<EstadoFormulario, FormData>(acao, null);
  const [legenda, setLegenda] = useState(inicial?.caption ?? "");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [formato, setFormato] = useState(inicial?.formato ?? "IMAGEM_UNICA");

  const previas = useMemo(
    () => arquivos.map((a) => ({ nome: a.name, url: URL.createObjectURL(a), tipo: a.type })),
    [arquivos],
  );

  return (
    <form action={enviar} className="grid gap-5 lg:grid-cols-[1fr_340px]">
      {inicial?.postId && <input type="hidden" name="postId" value={inicial.postId} />}
      {pautaId && <input type="hidden" name="pautaId" value={pautaId} />}
      {materiais.map((m) => (
        <input key={m.id} type="hidden" name="materiais" value={m.id} />
      ))}

      <div className="space-y-5">
        {estado?.erro && (
          <Aviso tom="erro" titulo={estado.erro}>
            {estado.problemas && estado.problemas.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {estado.problemas.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Aviso>
        )}

        <Cartao titulo="Criativo">
          <div className="space-y-4">
            {modo === "criar" ? (
              <Campo rotulo="Cliente">
                <select name="clientId" required defaultValue={inicial?.clientId ?? ""} className={classeInput}>
                  <option value="" disabled>
                    Escolha o cliente
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : null}

            <Campo rotulo="Formato">
              <select
                name="formato"
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                className={classeInput}
              >
                {FORMATOS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
            </Campo>

            {materiais.length > 0 && (
              <div className="rounded-lg border border-vora-verde/40 bg-emerald-50 p-3">
                <p className="mb-2 text-sm font-medium text-emerald-900">
                  {materiais.length} arquivo(s) da biblioteca do cliente
                </p>
                <div className="flex flex-wrap gap-2">
                  {materiais.map((m, i) => (
                    <div key={m.id} className="relative">
                      {m.kind === "VIDEO" ? (
                        <video src={m.url} className="h-16 w-16 rounded border border-emerald-200 object-cover" />
                      ) : (
                        <img src={m.url} alt="" className="h-16 w-16 rounded border border-emerald-200 object-cover" />
                      )}
                      <span className="absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full bg-vora-verde text-[10px] font-bold text-black">
                        {i + 1}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-emerald-800">
                  Para trocar, volte em Materiais e selecione de novo. Arquivos enviados abaixo
                  entram depois destes.
                </p>
              </div>
            )}

            <Campo
              rotulo={
                modo === "editar"
                  ? "Trocar arquivos (opcional)"
                  : materiais.length > 0
                    ? "Mais arquivos (opcional)"
                    : "Arquivos"
              }
              dica={
                formato === "CARROSSEL"
                  ? "De 2 a 10 arquivos. A ordem de selecao e a ordem do carrossel."
                  : "Um arquivo. Imagens viram JPEG automaticamente."
              }
            >
              <input
                type="file"
                name="arquivos"
                multiple={formato === "CARROSSEL"}
                accept="image/jpeg,image/png,image/webp,image/bmp,video/mp4,video/quicktime"
                onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
                className="w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-sm"
              />
            </Campo>

            <Campo rotulo="Legenda" dica={`${legenda.length}/2200 caracteres`}>
              <textarea
                name="caption"
                rows={6}
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                className={classeInput}
                placeholder="Escreva a legenda do post..."
              />
            </Campo>

            <fieldset>
              <legend className="mb-1 text-sm font-medium text-zinc-700">Redes</legend>
              <div className="flex gap-4">
                {(["INSTAGRAM", "FACEBOOK"] as const).map((rede) => (
                  <label key={rede} className="flex items-center gap-2 text-sm text-zinc-800">
                    <input
                      type="checkbox"
                      name="networks"
                      value={rede}
                      defaultChecked={(inicial?.networks ?? ["INSTAGRAM"]).includes(rede)}
                      className="h-4 w-4"
                    />
                    {rede === "INSTAGRAM" ? "Instagram" : "Facebook"}
                  </label>
                ))}
              </div>
            </fieldset>

            <Campo rotulo="Data e hora da publicacao" dica="Horario de Brasilia (America/Sao_Paulo).">
              <input
                type="datetime-local"
                name="dataHora"
                required
                defaultValue={inicial?.dataHora}
                className={classeInput}
              />
            </Campo>

            {modo === "criar" && (
              <label className="flex items-start gap-2 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
                <input type="checkbox" name="enviarAprovacao" value="sim" defaultChecked className="mt-0.5 h-4 w-4" />
                <span>
                  Enviar agora o pedido de aprovacao pelo WhatsApp do cliente.
                  <span className="block text-xs text-zinc-500">
                    Sem aprovacao, o post nao e publicado.
                  </span>
                </span>
              </label>
            )}

            {modo === "editar" && (
              <Aviso tom="atencao" titulo="Editar derruba a aprovacao">
                O post volta para rascunho, a versao sobe e, se o cliente ja tinha recebido o link,
                um novo pedido de aprovacao e enviado.
              </Aviso>
            )}

            <Botao type="submit" disabled={enviando} variante="primario">
              {enviando ? "Salvando..." : modo === "criar" ? "Criar post" : "Salvar alteracoes"}
            </Botao>
          </div>
        </Cartao>
      </div>

      <aside className="space-y-4">
        <Cartao titulo="Pre-visualizacao">
          <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-zinc-200">
            <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
              <span className="h-7 w-7 rounded-full bg-zinc-200" />
              <span className="text-xs font-semibold text-zinc-700">
                {clientes.find((c) => c.id === inicial?.clientId)?.name ?? "cliente"}
              </span>
            </div>

            <div className="flex aspect-square items-center justify-center bg-zinc-100">
              {previas.length > 0 ? (
                previas[0].tipo.startsWith("video") ? (
                  <video src={previas[0].url} controls className="h-full w-full object-cover" />
                ) : (
                  <img src={previas[0].url} alt="" className="h-full w-full object-cover" />
                )
              ) : midiaExistente.length > 0 ? (
                midiaExistente[0].kind === "VIDEO" ? (
                  <video src={midiaExistente[0].url} controls className="h-full w-full object-cover" />
                ) : (
                  <img src={midiaExistente[0].url} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <span className="px-4 text-center text-xs text-zinc-400">
                  Suba o criativo para ver a previa
                </span>
              )}
            </div>

            <p className="whitespace-pre-wrap px-3 py-2 text-xs text-zinc-700">
              {legenda || "A legenda aparece aqui."}
            </p>
          </div>

          {(previas.length > 1 || midiaExistente.length > 1) && (
            <p className="mt-3 text-center text-xs text-zinc-500">
              {previas.length > 1 ? previas.length : midiaExistente.length} itens no carrossel
            </p>
          )}
        </Cartao>

        {previas.length > 0 && (
          <Cartao titulo="Arquivos selecionados">
            <ul className="space-y-1 text-xs text-zinc-600">
              {previas.map((p, i) => (
                <li key={p.url} className="truncate">
                  {i + 1}. {p.nome}
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </aside>
    </form>
  );
}
