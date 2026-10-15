import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { tokenDoPedido } from "@/lib/crypto.ts";
import { storage } from "@/lib/storage/index.ts";
import { formatarDataHora, paraInputLocal } from "@/lib/datetime.ts";
import { carregarPost, linkDeAprovacao } from "@/services/posts.ts";
import {
  eventosDisponiveis,
  ROTULO_STATUS,
  type PostStatus,
} from "@/domain/post-status.ts";
import {
  acaoCancelarPost,
  acaoEnviarAprovacao,
  acaoReagendar,
  acaoReenviarLink,
} from "@/app/actions/posts.ts";
import {
  Aviso,
  Botao,
  BotaoLink,
  Cartao,
  Etiqueta,
  IconeRede,
  Vazio,
  classeInput,
} from "@/components/ui.tsx";
import { legendaVisivel } from "@/domain/legenda.ts";

export const dynamic = "force-dynamic";

const ROTULO_ACAO: Record<string, string> = {
  post_criado: "Post criado",
  post_editado: "Post editado pela agencia",
  pedido_de_aprovacao_enviado: "Pedido de aprovacao enviado",
  link_reenviado: "Link reenviado ao cliente",
  cliente_aprovou: "Cliente aprovou",
  cliente_reprovou: "Cliente reprovou",
  marcado_sem_resposta: "Virou POST SEM RESPOSTA",
  publicacao_iniciada: "Publicacao iniciada",
  post_publicado: "Post publicado",
  publicacao_falhou: "Publicacao falhou",
  publicacao_abortada: "Publicacao abortada na revalidacao",
  post_cancelado: "Post cancelado",
  reagendado_apos_falha: "Reagendado apos falha",
};

export default async function DetalhePost({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirUsuario();
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) notFound();

  const completo = await carregarPost(id);
  const auditoria = await prisma.auditLog.findMany({
    where: { entityType: "post", entityId: id },
    orderBy: { createdAt: "desc" },
  });

  const midias = await Promise.all(
    completo.media.map(async (m) => ({
      ...m,
      url: await storage.urlTemporaria(m.storageKey),
    })),
  );

  const pendente = completo.approvalRequests.find(
    (r) => r.status === "PENDENTE",
  );
  const link = pendente ? linkDeAprovacao(tokenDoPedido(pendente.id)) : null;
  const status = completo.status as PostStatus;
  const eventos = eventosDisponiveis(status);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-900">
              {completo.client.name}
            </h1>
            <Etiqueta status={status} />
            <span className="text-xs text-zinc-400">
              versao {completo.version}
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            {formatarDataHora(completo.scheduledAt, completo.client.timezone)} -{" "}
            {completo.format.replace("_", " ").toLowerCase()}
            {completo.createdBy
              ? ` - criado por ${completo.createdBy.name}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {eventos.includes("AGENCIA_EDITOU") && (
            <BotaoLink href={`/posts/${id}/editar`}>Editar</BotaoLink>
          )}
          {eventos.includes("ENVIAR_PARA_APROVACAO") && (
            <form action={acaoEnviarAprovacao}>
              <input type="hidden" name="postId" value={id} />
              <Botao type="submit" variante="primario">
                Enviar para aprovacao
              </Botao>
            </form>
          )}
          {status === "AGUARDANDO_APROVACAO" && (
            <form action={acaoReenviarLink}>
              <input type="hidden" name="postId" value={id} />
              <Botao type="submit">Reenviar link</Botao>
            </form>
          )}
        </div>
      </header>

      {status === "POST_SEM_RESPOSTA" && (
        <Aviso tom="atencao" titulo="POST SEM RESPOSTA">
          O cliente nao respondeu ate o horario previsto, por isso o post nao
          foi publicado. Ele aparece assim no historico e no relatorio do
          cliente. Para tentar de novo, reagende abaixo.
        </Aviso>
      )}
      {status === "FALHOU" && (
        <Aviso tom="erro" titulo="A publicacao falhou">
          {completo.lastError ?? "Erro desconhecido."} A aprovacao do cliente
          continua valendo: reagende para tentar novamente.
        </Aviso>
      )}
      {status === "REPROVADO" && completo.decisions[0] && (
        <Aviso
          tom="erro"
          titulo={`Reprovado por ${completo.decisions[0].approverName}`}
        >
          {completo.decisions[0].comment}
        </Aviso>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Cartao titulo="Criativo e legenda">
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              <div className="space-y-2">
                {midias.map((m) =>
                  m.kind === "VIDEO" ? (
                    <video
                      key={m.id}
                      src={m.url}
                      controls
                      className="w-full rounded-lg border border-zinc-200"
                    />
                  ) : (
                    <img
                      key={m.id}
                      src={m.url}
                      alt=""
                      className="w-full rounded-lg border border-zinc-200"
                    />
                  ),
                )}
                {midias.length === 0 && <Vazio>Sem criativo.</Vazio>}
              </div>
              <div>
                <p className="whitespace-pre-wrap text-sm text-zinc-800">
                  {legendaVisivel(completo.caption) || (
                    <span className="text-zinc-400">Sem legenda.</span>
                  )}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  {completo.networks.map((n) => (
                    <IconeRede key={n} network={n} />
                  ))}
                </div>
              </div>
            </div>
          </Cartao>

          <Cartao titulo="Historico completo (auditoria)">
            {auditoria.length === 0 ? (
              <Vazio>Sem registros.</Vazio>
            ) : (
              <ol className="space-y-3">
                {auditoria.map((a) => (
                  <li key={a.id} className="border-l-2 border-zinc-200 pl-3">
                    <p className="text-sm font-medium text-zinc-800">
                      {ROTULO_ACAO[a.action] ?? a.action}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatarDataHora(a.createdAt)} -{" "}
                      {a.actorType === "CLIENTE"
                        ? `cliente: ${a.actorName ?? "sem nome"}`
                        : a.actorType === "SISTEMA"
                          ? "sistema"
                          : `equipe: ${a.actorName ?? "-"}`}
                      {a.fromStatus && a.toStatus && a.fromStatus !== a.toStatus
                        ? ` - ${ROTULO_STATUS[a.fromStatus as PostStatus] ?? a.fromStatus} para ${
                            ROTULO_STATUS[a.toStatus as PostStatus] ??
                            a.toStatus
                          }`
                        : ""}
                      {a.ipAddress ? ` - IP ${a.ipAddress}` : ""}
                    </p>
                    {a.metadata ? (
                      <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 text-[11px] text-zinc-600">
                        {JSON.stringify(a.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Cartao>

          {completo.publishAttempts.length > 0 && (
            <Cartao titulo="Tentativas de publicacao">
              <ul className="space-y-2 text-sm">
                {completo.publishAttempts.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 pb-2"
                  >
                    <span>
                      {t.network} - tentativa {t.attempt} -{" "}
                      <span
                        className={
                          t.status === "SUCESSO"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }
                      >
                        {t.status}
                      </span>
                      {t.dryRun ? " (dry-run)" : ""}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatarDataHora(t.startedAt)}
                      {t.errorMessage ? ` - ${t.errorMessage}` : ""}
                      {t.permalink ? (
                        <>
                          {" - "}
                          <a
                            href={t.permalink}
                            className="underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            ver post
                          </a>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>

        <aside className="space-y-5">
          {link && (
            <Cartao titulo="Link de aprovacao ativo">
              <p className="break-all rounded bg-zinc-50 p-2 text-xs text-zinc-700">
                {link}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Expira em{" "}
                {formatarDataHora(
                  pendente!.expiresAt,
                  completo.client.timezone,
                )}
                . O cliente abre, digita o nome e decide.
              </p>
            </Cartao>
          )}

          {completo.decisions.length > 0 && (
            <Cartao titulo="Decisoes do cliente">
              <ul className="space-y-2 text-sm">
                {completo.decisions.map((d) => (
                  <li key={d.id}>
                    <p className="font-medium text-zinc-800">
                      {d.decision === "APROVADO" ? "Aprovado" : "Reprovado"} por{" "}
                      {d.approverName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatarDataHora(d.decidedAt)} - versao {d.postVersion}
                      {d.ipAddress ? ` - IP ${d.ipAddress}` : ""}
                    </p>
                    {d.comment && (
                      <p className="mt-1 text-xs text-zinc-700">
                        "{d.comment}"
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          {completo.publications.length > 0 && (
            <Cartao titulo="Publicado">
              <ul className="space-y-1 text-sm">
                {completo.publications.map((p) => (
                  <li key={p.id}>
                    {p.network}:{" "}
                    {p.permalink ? (
                      <a
                        href={p.permalink}
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        abrir post
                      </a>
                    ) : (
                      p.externalId
                    )}
                    {p.dryRun ? " (dry-run)" : ""}
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          {(eventos.includes("REAGENDAR_APOS_FALHA") ||
            eventos.includes("AGENCIA_EDITOU")) && (
            <Cartao titulo="Reagendar">
              <form action={acaoReagendar} className="space-y-3">
                <input type="hidden" name="postId" value={id} />
                <input
                  type="datetime-local"
                  name="dataHora"
                  required
                  defaultValue={paraInputLocal(
                    completo.scheduledAt,
                    completo.client.timezone,
                  )}
                  className={classeInput}
                />
                <Botao type="submit">Reagendar</Botao>
                {status !== "FALHOU" && (
                  <p className="text-xs text-zinc-500">
                    Mudar o horario derruba a aprovacao e pede uma nova.
                  </p>
                )}
              </form>
            </Cartao>
          )}

          {eventos.includes("CANCELAR") && (
            <Cartao titulo="Cancelar post">
              <form action={acaoCancelarPost} className="space-y-3">
                <input type="hidden" name="postId" value={id} />
                <input
                  name="motivo"
                  placeholder="Motivo (opcional)"
                  className={classeInput}
                />
                <Botao type="submit" variante="perigo">
                  Cancelar post
                </Botao>
              </form>
            </Cartao>
          )}

          <Cartao titulo="Cliente">
            <Link
              href={`/clientes/${completo.clientId}`}
              className="text-sm font-medium underline"
            >
              {completo.client.name}
            </Link>
            <ul className="mt-2 space-y-1 text-xs text-zinc-600">
              {completo.client.contacts
                .filter((c) => c.isApprover)
                .map((c) => (
                  <li key={c.id}>
                    {c.name} - {c.phoneE164}
                  </li>
                ))}
            </ul>
          </Cartao>
        </aside>
      </div>
    </div>
  );
}
