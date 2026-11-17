import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { formatInTimeZone } from "date-fns-tz";
import {
  FUSO_PADRAO,
  MESES,
  chaveDiaLocal,
  formatarDataHora,
  formatarDiaExtenso,
  formatarHora,
} from "@/lib/datetime.ts";
import {
  Avatar,
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  IconeRede,
  Metrica,
  Vazio,
} from "@/components/ui.tsx";
import {
  IconeAlerta,
  IconeCheck,
  IconeDireita,
  IconeEnviar,
  IconeNovo,
  IconeRelogio,
} from "@/components/icones.tsx";
import type { PostStatus } from "@/domain/post-status.ts";
import { atividadeRecente } from "@/services/historico.ts";
import { quadroDeTarefas } from "@/services/tarefas-notion.ts";
import { aprovadosQueNaoSairam } from "@/services/publicacao-pendente.ts";
import { TarefasDaEquipe } from "@/components/tarefas-equipe.tsx";
import { exigirUsuario } from "@/lib/auth.ts";
import { primeiroNome } from "@/domain/equipe.ts";
import { ListaDeAtividade } from "@/components/atividade.tsx";

export const dynamic = "force-dynamic";

async function buscarDados() {
  const agora = new Date();

  const [
    proximos,
    pendentes,
    reprovados,
    semResposta,
    falhas,
    conexoes,
    totalMes,
    totalPendentes,
    totalNaFila,
  ] = await Promise.all([
      prisma.post.findMany({
        where: { status: { in: ["APROVADO", "PUBLICANDO"] }, scheduledAt: { gte: agora } },
        include: { client: true },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
      prisma.post.findMany({
        where: { status: "AGUARDANDO_APROVACAO" },
        include: { client: true },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
      prisma.post.findMany({
        where: { status: "REPROVADO" },
        include: { client: true, decisions: { orderBy: { decidedAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.post.findMany({
        where: { status: "POST_SEM_RESPOSTA" },
        include: { client: true },
        orderBy: { scheduledAt: "desc" },
        take: 5,
      }),
      prisma.post.findMany({
        where: { status: "FALHOU" },
        include: { client: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.metaConnection.findMany({
        where: { status: { not: "CONECTADO" } },
        include: { client: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.post.count({
        where: {
          scheduledAt: { gte: new Date(agora.getFullYear(), agora.getMonth(), 1) },
        },
      }),
      prisma.post.count({ where: { status: "AGUARDANDO_APROVACAO" } }),
      prisma.post.count({
        where: { status: { in: ["APROVADO", "PUBLICANDO"] }, scheduledAt: { gte: agora } },
      }),
    ]);

  return {
    proximos,
    pendentes,
    reprovados,
    semResposta,
    falhas,
    conexoes,
    totalMes,
    totalPendentes,
    totalNaFila,
  };
}

type PostDaLista = {
  id: string;
  status: string;
  scheduledAt: Date;
  networks: string[];
  client: { name: string; timezone: string };
};

function LinhaPost({ post, extra }: { post: PostDaLista; extra?: string | null }) {
  return (
    <li>
      <Link
        href={`/posts/${post.id}`}
        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-superficie-2"
      >
        <Avatar nome={post.client.name} tamanho={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-tinta">
            {post.client.name}
          </p>
          <p className="truncate text-xs text-tinta-3">
            {formatarDataHora(post.scheduledAt, post.client.timezone)}
            {extra ? ` · ${extra}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {post.networks.map((n) => (
            <IconeRede key={n} network={n as "INSTAGRAM" | "FACEBOOK"} />
          ))}
          <Etiqueta status={post.status as PostStatus} />
        </div>
      </Link>
    </li>
  );
}

type Alerta = {
  chave: string;
  tom: "erro" | "atencao" | "info";
  titulo: string;
  detalhe: string;
  href: string;
  acao: string;
};

const COR_DO_ALERTA: Record<Alerta["tom"], string> = {
  erro: "bg-rose-500",
  atencao: "bg-amber-500",
  info: "bg-tinta-4",
};

function saudacao(agora: Date): string {
  const hora = Number(formatInTimeZone(agora, FUSO_PADRAO, "H"));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

const reais = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export default async function Dashboard() {
  const usuario = await exigirUsuario();
  const agora = new Date();
  const d = await buscarDados();
  const { clientesComSaldoBaixo } = await import("@/services/saldo.ts");
  const [saldoBaixo, atividade, tarefas, naoSairam] = await Promise.all([
    clientesComSaldoBaixo(),
    atividadeRecente({ limite: 8 }),
    quadroDeTarefas({ nomeDaPessoa: usuario.name }),
    aprovadosQueNaoSairam(),
  ]);
  const quebradas = d.conexoes.filter((c) => c.status !== "NAO_CONFIGURADO");
  const aguardando = d.conexoes.filter((c) => c.status === "NAO_CONFIGURADO");

  // Tudo que pede acao vira uma linha so, da mais grave para a menos grave.
  // Um painel cheio de faixa colorida deixa de ser aviso.
  const alertas: Alerta[] = [
    ...naoSairam.map((p) => ({
      chave: `saiu-${p.id}`,
      tom: "erro" as const,
      titulo: `${p.cliente}: aprovado, mas nao saiu no horario`,
      detalhe: `Previsto para ${formatarDataHora(p.scheduledAt, p.fuso)}. ${
        p.motivo ?? "A agenda ainda nao passou por ele"
      }.`,
      href: `/posts/${p.id}`,
      acao: "Abrir post",
    })),
    ...quebradas.map((c) => ({
      chave: `conexao-${c.id}`,
      tom: "erro" as const,
      titulo: `${c.client.name}: conexao com a Meta parou`,
      detalhe: `${c.assetType}: ${c.status}${c.lastError ? ` (${c.lastError})` : ""}.`,
      href: "/conexoes",
      acao: "Abrir conexoes",
    })),
    ...saldoBaixo.map((s) => ({
      chave: `saldo-${s.clienteId}`,
      tom: "atencao" as const,
      titulo: `${s.cliente}: saldo de anuncios no limite`,
      detalhe: `Restam ${reais(s.saldo)}${
        s.diasRestantes !== null ? `, cerca de ${s.diasRestantes} dia(s)` : ""
      }. O PIX de recarga ja esta pronto.`,
      href: `/clientes/${s.clienteId}/saldo`,
      acao: "Gerar PIX",
    })),
    ...(aguardando.length > 0
      ? [
          {
            chave: "meta",
            tom: "info" as const,
            titulo: `${aguardando.length} ativo(s) esperando o acesso da Meta`,
            detalhe:
              "Cadastrados e prontos, mas sem token do System User: por isso nenhum deles publica ainda.",
            href: "/conexoes",
            acao: "Ver a lista",
          },
        ]
      : []),
  ];

  const hoje = chaveDiaLocal(agora);
  const mesAtual = MESES[Number(formatInTimeZone(agora, FUSO_PADRAO, "M")) - 1];
  const pendencias = [d.semResposta, d.reprovados, d.falhas].filter((l) => l.length > 0).length;
  const saemHoje = d.proximos.filter((p) => chaveDiaLocal(p.scheduledAt) === hoje).length;
  const tarefasEmAberto = tarefas.atrasadas.length + tarefas.hoje.length;
  const tudoEmOrdem =
    d.semResposta.length === 0 && d.reprovados.length === 0 && d.falhas.length === 0;

  return (
    <div className="space-y-7">
      <CabecalhoPagina
        sobre={`${formatarDiaExtenso(agora).split(",")[0]}, ${formatInTimeZone(agora, FUSO_PADRAO, "d")} de ${mesAtual}`}
        titulo={`${saudacao(agora)}, ${primeiroNome(usuario.name)}`}
        descricao={`${d.totalMes} post(s) em ${mesAtual} · ${d.totalPendentes} esperando o cliente · ${d.totalNaFila} na fila de publicacao`}
        acoes={
          <>
            <BotaoLink href="/calendario">Calendario</BotaoLink>
            <BotaoLink href="/posts/novo" variante="primario">
              <IconeNovo tamanho={15} />
              Novo post
            </BotaoLink>
          </>
        }
      />

      {/* Numeros de decisao: o que muda o que a pessoa faz agora. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica
          rotulo="Esperando o cliente"
          valor={d.totalPendentes}
          icone={<IconeEnviar tamanho={15} />}
          detalhe={
            d.pendentes[0]
              ? `Proximo vence ${formatarDataHora(d.pendentes[0].scheduledAt, d.pendentes[0].client.timezone)}`
              : "Nenhum link em aberto"
          }
          href="#aguardando"
        />
        <Metrica
          rotulo="Na fila de publicacao"
          valor={d.totalNaFila}
          icone={<IconeCheck tamanho={15} />}
          detalhe={
            d.proximos[0]
              ? `${saemHoje > 0 ? `${saemHoje} sai(em) hoje · proximo ` : "Proximo "}${
                  chaveDiaLocal(d.proximos[0].scheduledAt) === hoje
                    ? `as ${formatarHora(d.proximos[0].scheduledAt, d.proximos[0].client.timezone)}`
                    : formatarDataHora(d.proximos[0].scheduledAt, d.proximos[0].client.timezone)
                }`
              : "Nada aprovado aguardando horario"
          }
          href="#fila"
        />
        <Metrica
          rotulo="Sem resposta"
          valor={d.semResposta.length}
          tom={d.semResposta.length > 0 ? "erro" : "neutro"}
          icone={<IconeRelogio tamanho={15} />}
          detalhe={
            d.semResposta.length > 0
              ? "Perderam o horario: reagende"
              : "Nenhum post perdeu o horario"
          }
          href="#pendencias"
        />
        <Metrica
          rotulo="Tarefas para hoje"
          valor={tarefasEmAberto}
          tom={tarefas.atrasadas.length > 0 ? "erro" : "neutro"}
          icone={<IconeAlerta tamanho={15} />}
          detalhe={
            tarefas.bases.length === 0
              ? "Notion ainda nao conectado"
              : `${tarefas.atrasadas.length} atrasada(s) · ${tarefas.hoje.length} de hoje`
          }
          href="#tarefas"
        />
      </div>

      {alertas.length > 0 && (
        <Cartao titulo="Precisa de atencao" contador={alertas.length}>
          <ul className="divide-y divide-linha-suave">
            {alertas.map((a) => (
              <li key={a.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_ALERTA[a.tom]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-tinta">{a.titulo}</p>
                  <p className="text-xs text-tinta-3">{a.detalhe}</p>
                </div>
                <Link
                  href={a.href}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-tinta-2 hover:text-tinta"
                >
                  {a.acao}
                  <IconeDireita tamanho={13} />
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div id="tarefas" className="min-w-0 scroll-mt-6">
          <TarefasDaEquipe quadro={tarefas} nomeDaPessoa={primeiroNome(usuario.name)} />
        </div>

        <div className="min-w-0 space-y-5">
          <div id="aguardando" className="scroll-mt-6">
            <Cartao titulo="Aguardando o cliente" contador={d.totalPendentes}>
              {d.pendentes.length === 0 ? (
                <Vazio>Nenhum post esperando resposta.</Vazio>
              ) : (
                <ul>
                  {d.pendentes.map((p) => (
                    <LinhaPost key={p.id} post={p} />
                  ))}
                </ul>
              )}
            </Cartao>
          </div>

          <div id="fila" className="scroll-mt-6">
            <Cartao titulo="Proximas publicacoes" contador={d.totalNaFila}>
              {d.proximos.length === 0 ? (
                <Vazio
                  acao={
                    <Link href="/posts/novo" className="text-xs font-semibold text-destaque">
                      Criar um post
                    </Link>
                  }
                >
                  Nada aprovado na fila. Post so entra aqui depois que o cliente aprova.
                </Vazio>
              ) : (
                <ul>
                  {d.proximos.map((p) => (
                    <LinhaPost key={p.id} post={p} />
                  ))}
                </ul>
              )}
            </Cartao>
          </div>
        </div>
      </div>

      <div id="pendencias" className="scroll-mt-6">
        {tudoEmOrdem ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-linha px-5 py-3.5 text-sm text-tinta-3">
            <IconeCheck tamanho={16} className="text-destaque" />
            Nenhum post sem resposta, nenhuma reprovacao em aberto e nenhuma falha de publicacao.
          </p>
        ) : (
          <div
            className={`grid items-start gap-5 ${pendencias >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
          >
            {d.semResposta.length > 0 && (
              <Cartao titulo="Sem resposta" contador={d.semResposta.length}>
                <ul>
                  {d.semResposta.map((p) => (
                    <LinhaPost key={p.id} post={p} extra="nao publicado" />
                  ))}
                </ul>
              </Cartao>
            )}
            {d.reprovados.length > 0 && (
              <Cartao titulo="Reprovados" contador={d.reprovados.length}>
                <ul>
                  {d.reprovados.map((p) => (
                    <LinhaPost
                      key={p.id}
                      post={p}
                      extra={p.decisions[0]?.comment?.slice(0, 60) ?? null}
                    />
                  ))}
                </ul>
              </Cartao>
            )}
            {d.falhas.length > 0 && (
              <Cartao titulo="Falhas de publicacao" contador={d.falhas.length}>
                <ul>
                  {d.falhas.map((p) => (
                    <LinhaPost key={p.id} post={p} extra={p.lastError?.slice(0, 80) ?? null} />
                  ))}
                </ul>
              </Cartao>
            )}
          </div>
        )}
      </div>

      <Cartao
        titulo="Atividade da equipe"
        acao={
          <span className="hidden text-xs text-tinta-4 sm:inline">
            o historico completo fica na aba Historico de cada cliente
          </span>
        }
      >
        <ListaDeAtividade eventos={atividade} />
      </Cartao>
    </div>
  );
}
