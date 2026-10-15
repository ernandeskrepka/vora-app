import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db.ts";
import { hashToken, tokenDoPedido } from "@/lib/crypto.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import { normalizarTelefone } from "@/lib/whatsapp/client.ts";
import { gerarSlug } from "./clientes.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";
import type {
  MediaKind,
  Network,
  PlanningStatus,
  PostFormat,
  PostStatus,
} from "@/lib/tipos.ts";

/* ------------------------------------------------------------------ tipos */

type QuandoRelativo = { dias: number; hora: string };

type PostDemo = {
  ref: string;
  legenda: string;
  formato: PostFormat;
  redes: Network[];
  quando: QuandoRelativo;
  status: PostStatus;
  midias: string[];
  aprovacao?: { nome: string; comentario?: string | null; dias: number };
  publicacao?: Partial<Record<Network, string>>;
  pauta?: { titulo: string; status: PlanningStatus };
};

type CampanhaDemo = {
  id: string;
  nome: string;
  /** Artes que rodaram nessa campanha (chaves no storage). */
  criativos?: string[];
  gasto: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  ctr: number;
  cpm: number;
  resultados: number;
};

type RecargaDemo = { valor: number; dias: number; observacao?: string };

type ClienteDemo = {
  slug: string;
  recargas?: RecargaDemo[];
  contatos: Array<{
    nome: string;
    telefone: string;
    aprovador: boolean;
    lembretes: boolean;
  }>;
  pautas: Array<{
    titulo: string;
    status: PlanningStatus;
    dias: number;
    notas?: string;
  }>;
  posts: PostDemo[];
  anuncios?: { conta: string; campanhas: CampanhaDemo[] };
};

export type ResultadoDemonstracao = {
  postsCriados: number;
  pautasCriadas: number;
  contatosCriados: number;
  diasDeAnuncio: number;
  ignorados: number;
};

/* ------------------------------------------------------------- utilidades */

/**
 * Sorteio estavel: a mesma campanha e o mesmo dia sempre geram o mesmo numero.
 * Sem isso o relatorio mudaria de forma a cada recarga da demonstracao.
 */
function ruido(semente: string): number {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function emDias(quando: QuandoRelativo, base: Date): Date {
  const [hora, minuto] = quando.hora.split(":").map(Number);
  const d = new Date(base);
  d.setDate(d.getDate() + quando.dias);
  d.setHours(hora ?? 9, minuto ?? 0, 0, 0);
  return d;
}

async function tamanhoDaMidia(chave: string): Promise<number> {
  try {
    const conteudo = await readFile(path.join(process.cwd(), "public", chave));
    return conteudo.byteLength;
  } catch {
    return 0;
  }
}

export async function carregarArquivoDeDemonstracao(): Promise<ClienteDemo[]> {
  const bruto = await readFile(
    path.join(process.cwd(), "dados", "demonstracao.json"),
    "utf8",
  );
  return (JSON.parse(bruto) as { clientes?: ClienteDemo[] }).clientes ?? [];
}

/* ---------------------------------------------------------------- carga */

/** Marca `[demo:ref]` no fim da legenda, como era antes. */
const MARCA_ANTIGA = /\n*\[demo:([^\]]+)\]\s*$/;

/**
 * Tira a marca de dentro da legenda dos posts de demonstracao antigos.
 *
 * A marca ficava no fim do texto, e legenda e o que o cliente le no link de
 * aprovacao - com o DRY-RUN desligado, iria junto para o Instagram. Agora ela
 * vive em `demoRef`, fora do texto; isso aqui conserta o que ja foi criado.
 */
async function tirarAMarcaDaLegenda() {
  const antigos = await prisma.post.findMany({
    where: { caption: { contains: "[demo:" } },
    select: { id: true, caption: true },
  });

  for (const post of antigos) {
    const achado = post.caption.match(MARCA_ANTIGA);
    if (!achado) continue;
    await prisma.post.update({
      where: { id: post.id },
      data: {
        caption: post.caption.replace(MARCA_ANTIGA, "").trim(),
        demoRef: achado[1],
      },
    });
  }
}

/**
 * Enche o sistema com uma semana tipica da agencia, usando material real:
 * pauta no planejamento, posts em todos os status, aprovacao registrada com
 * nome, IP e navegador, publicacao em dry-run e numeros de anuncio.
 *
 * Serve para apresentar o sistema funcionando antes de ligar a Meta de
 * verdade. E idempotente: cada post tem uma referencia propria e so e criado
 * uma vez, entao rodar de novo nao duplica nada.
 *
 * Nao burla nenhuma regra de negocio: post publicado aqui tem decisao de
 * aprovacao registrada antes, post sem resposta nao tem publicacao, e tudo
 * passa por auditoria.
 */
export async function carregarDemonstracao(
  ator: Ator,
): Promise<ResultadoDemonstracao> {
  const clientes = await carregarArquivoDeDemonstracao();
  if (clientes.length === 0)
    throw new ErroDeRegra("Arquivo de demonstracao vazio.");

  await tirarAMarcaDaLegenda();

  const agora = new Date();
  const r: ResultadoDemonstracao = {
    postsCriados: 0,
    pautasCriadas: 0,
    contatosCriados: 0,
    diasDeAnuncio: 0,
    ignorados: 0,
  };

  for (const entrada of clientes) {
    const cliente =
      (await prisma.client.findUnique({ where: { slug: entrada.slug } })) ??
      (await prisma.client.create({
        data: {
          name: entrada.slug.replace(/-/g, " "),
          slug: gerarSlug(entrada.slug),
        },
      }));

    // Contatos: quem aprova e quem recebe lembrete.
    for (const contato of entrada.contatos ?? []) {
      const telefone = normalizarTelefone(contato.telefone);
      const existe = await prisma.clientContact.findUnique({
        where: {
          clientId_phoneE164: { clientId: cliente.id, phoneE164: telefone },
        },
      });
      if (existe) continue;
      await prisma.clientContact.create({
        data: {
          clientId: cliente.id,
          name: contato.nome,
          phoneE164: telefone,
          isApprover: contato.aprovador,
          receivesReminders: contato.lembretes,
        },
      });
      r.contatosCriados += 1;
    }

    // Pauta solta no planejamento (as que ainda nao viraram post).
    for (const pauta of entrada.pautas ?? []) {
      const existe = await prisma.planningItem.findFirst({
        where: { clientId: cliente.id, title: pauta.titulo },
      });
      if (existe) continue;
      await prisma.planningItem.create({
        data: {
          clientId: cliente.id,
          title: pauta.titulo,
          notes: pauta.notas ?? null,
          status: pauta.status,
          targetDate: emDias({ dias: pauta.dias, hora: "09:00" }, agora),
        },
      });
      r.pautasCriadas += 1;
    }

    for (const demo of entrada.posts ?? []) {
      const jaExiste = await prisma.post.findFirst({
        where: { clientId: cliente.id, demoRef: demo.ref },
        select: { id: true },
      });
      if (jaExiste) {
        r.ignorados += 1;
        continue;
      }

      const quando = emDias(demo.quando, agora);
      const aprovadoEm = demo.aprovacao
        ? emDias({ dias: demo.aprovacao.dias, hora: "14:20" }, agora)
        : null;

      const post = await prisma.post.create({
        data: {
          clientId: cliente.id,
          createdById: ator.usuarioId ?? null,
          caption: demo.legenda,
          demoRef: demo.ref,
          format: demo.formato,
          networks: demo.redes,
          scheduledAt: quando,
          status: demo.status,
          approvedAt:
            demo.status === "PUBLICADO" || demo.status === "APROVADO"
              ? aprovadoEm
              : null,
          publishedAt: demo.status === "PUBLICADO" ? quando : null,
        },
      });
      r.postsCriados += 1;

      for (const [posicao, chave] of (demo.midias ?? []).entries()) {
        await prisma.postMedia.create({
          data: {
            postId: post.id,
            position: posicao,
            kind: (chave.endsWith(".mp4") ? "VIDEO" : "IMAGEM") as MediaKind,
            storageKey: chave,
            mimeType: chave.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
            sizeBytes: await tamanhoDaMidia(chave),
            originalFilename: chave.split("/").pop() ?? null,
          },
        });
      }

      // Pedido de aprovacao: existe sempre que o post saiu do rascunho.
      const precisaPedido =
        demo.status !== "RASCUNHO" && demo.status !== "CANCELADO";
      if (precisaPedido) {
        const pedidoId = randomUUID();
        const decidido = Boolean(demo.aprovacao);
        await prisma.approvalRequest.create({
          data: {
            id: pedidoId,
            postId: post.id,
            postVersion: 1,
            tokenHash: hashToken(tokenDoPedido(pedidoId)),
            status: decidido
              ? "DECIDIDO"
              : demo.status === "POST_SEM_RESPOSTA"
                ? "EXPIRADO"
                : "PENDENTE",
            channel: "WHATSAPP",
            sentAt: emDias(
              { dias: demo.quando.dias - 2, hora: "10:00" },
              agora,
            ),
            expiresAt: emDias(
              { dias: demo.quando.dias + 12, hora: "10:00" },
              agora,
            ),
            decidedAt: decidido ? aprovadoEm : null,
          },
        });

        if (demo.aprovacao && aprovadoEm) {
          await prisma.approvalDecision.create({
            data: {
              approvalRequestId: pedidoId,
              postId: post.id,
              postVersion: 1,
              decision: "APROVADO",
              approverName: demo.aprovacao.nome,
              comment: demo.aprovacao.comentario ?? null,
              ipAddress: "189.120.44.17",
              userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
              decidedAt: aprovadoEm,
            },
          });
          await registrarAuditoria({
            entityType: "post",
            entityId: post.id,
            action: "aprovacao_registrada",
            actorType: "CLIENTE",
            actorName: demo.aprovacao.nome,
            metadata: { origem: "demonstracao", decisao: "APROVADO" },
          });
        }
      }

      // Publicacao: so para o que realmente foi publicado.
      for (const [rede, externalId] of Object.entries(demo.publicacao ?? {})) {
        await prisma.postPublication.create({
          data: {
            postId: post.id,
            network: rede as Network,
            externalId,
            permalink:
              rede === "INSTAGRAM"
                ? `https://www.instagram.com/p/${externalId.slice(-11)}/`
                : null,
            dryRun: true,
            publishedAt: quando,
          },
        });
      }

      if (demo.pauta) {
        await prisma.planningItem.create({
          data: {
            clientId: cliente.id,
            title: demo.pauta.titulo,
            status: demo.pauta.status,
            targetDate: quando,
            postId: post.id,
          },
        });
        r.pautasCriadas += 1;
      }

      await registrarAuditoria({
        entityType: "post",
        entityId: post.id,
        action: "post_criado",
        actorType: ator.tipo,
        actorUserId: ator.usuarioId ?? null,
        actorName: ator.nome ?? null,
        metadata: { origem: "demonstracao", ref: demo.ref },
      });
    }

    // Recarga de saldo: e ela que faz o painel saber quanto sobrou.
    for (const recarga of entrada.recargas ?? []) {
      const quando = emDias({ dias: recarga.dias, hora: "10:00" }, agora);
      const existe = await prisma.adAccountTopUp.findFirst({
        where: { clientId: cliente.id, occurredAt: quando },
      });
      if (existe) continue;
      await prisma.adAccountTopUp.create({
        data: {
          clientId: cliente.id,
          amount: recarga.valor,
          occurredAt: quando,
          note: recarga.observacao ?? null,
        },
      });
    }

    // Numeros de anuncio: o total real de 30 dias distribuido dia a dia.
    const anuncios = entrada.anuncios;
    if (anuncios && anuncios.campanhas.length > 0) {
      const DIAS = 30;
      for (const campanha of anuncios.campanhas) {
        // O criativo que rodou: e ele que faz o cliente entender o numero.
        for (const chave of campanha.criativos ?? []) {
          await prisma.adCampaignCreative.upsert({
            where: {
              clientId_campaignId_storageKey: {
                clientId: cliente.id,
                campaignId: campanha.id,
                storageKey: chave,
              },
            },
            update: {},
            create: {
              clientId: cliente.id,
              campaignId: campanha.id,
              storageKey: chave,
              adName: campanha.nome.slice(0, 120),
            },
          });
        }

        const pesos = Array.from(
          { length: DIAS },
          (_, i) => 0.6 + ruido(`${campanha.id}:${i}`) * 0.8,
        );
        const soma = pesos.reduce((a, b) => a + b, 0);

        for (let i = 0; i < DIAS; i++) {
          const data = new Date(agora);
          data.setDate(data.getDate() - (DIAS - i));
          data.setHours(0, 0, 0, 0);

          const fatia = pesos[i] / soma;
          const gasto = Number((campanha.gasto * fatia).toFixed(2));
          const impressoes = Math.round(campanha.impressoes * fatia);
          const cliques = Math.round(campanha.cliques * fatia);
          const resultados = Math.round(campanha.resultados * fatia);

          await prisma.adInsightDaily.upsert({
            where: {
              clientId_campaignId_date: {
                clientId: cliente.id,
                campaignId: campanha.id,
                date: data,
              },
            },
            update: {},
            create: {
              clientId: cliente.id,
              adAccountId: anuncios.conta,
              date: data,
              campaignId: campanha.id,
              campaignName: campanha.nome,
              spend: gasto,
              reach: Math.round(campanha.alcance * fatia),
              impressions: impressoes,
              clicks: cliques,
              ctr:
                impressoes > 0
                  ? Number(((cliques / impressoes) * 100).toFixed(2))
                  : 0,
              cpc: cliques > 0 ? Number((gasto / cliques).toFixed(4)) : 0,
              cpm:
                impressoes > 0
                  ? Number(((gasto / impressoes) * 1000).toFixed(4))
                  : 0,
              conversions: resultados,
              costPerResult:
                resultados > 0 ? Number((gasto / resultados).toFixed(4)) : null,
              currency: "BRL",
            },
          });
          r.diasDeAnuncio += 1;
        }
      }
    }
  }

  return r;
}
