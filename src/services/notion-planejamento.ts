import { prisma } from "@/lib/db.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import {
  NotionNaoConfigurado,
  idDaPagina,
  lerPagina,
  type LinhaDaPagina,
} from "@/lib/notion/client.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

export type ItemDoCalendario = {
  /**
   * Dia previsto, ja resolvido para um ano. Nulo quando o cronograma lista o
   * post sem data - metade dos clientes da VORA escreve assim.
   */
  data: Date | null;
  titulo: string;
  formato: string | null;
  notas: string;
  /** Caixa marcada no Notion: a equipe ja tocou nesse item. */
  concluido: boolean;
};

const DIAS_DA_SEMANA =
  "segunda-feira|terca-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sabado|sábado|domingo|segunda|terca|terça|quarta|quinta|sexta";

/**
 * Linha de dia no planejamento da VORA, nos formatos que aparecem de verdade:
 *
 *   ## Sexta-feira — 09/10 | Um passeio pela loja
 *   Segunda-feira — 26/10 \| O cantinho do descanso
 *   09/10 - Tour pela loja
 *
 * O travessao pode ser "—" ou "-", a barra pode vir escapada, e o dia da
 * semana e opcional (as vezes a pessoa so escreve a data).
 */
const LINHA_DE_DIA = new RegExp(
  String.raw`^\s*(?:#+\s*)?(?:(?:${DIAS_DA_SEMANA})\s*[—–-]\s*)?` +
    String.raw`(\d{1,2})[/\.](\d{1,2})(?:[/\.](\d{2,4}))?\s*` +
    String.raw`(?:\\?\||[—–-])\s*(.+?)\s*$`,
  "i",
);

const LINHA_DE_FORMATO = /^\s*\**\s*formato\s*:?\**\s*:?\s*(.+?)\s*$/i;

/**
 * O outro jeito que a VORA escreve o planejamento: lista numerada de posts ou
 * de roteiros, com ou sem data, com ou sem caixa de marcar.
 *
 *   - [x] **Post 04 REELS 12/10 Dia das Criancas**
 *   - [x] Post 07 CARROSSEL (OUTUBRO ROSA)
 *   POST 12 REELS (Nov Azul - Prevencao)
 *   Video 01: REELS - OUTUBRO ROSA
 *   ROTEIRO 01 - INSTITUCIONAL
 *   Video 02 - Seu Franca e Fabricio
 *
 * Aqui o que identifica o item e "post/video/roteiro/card + numero", nao a
 * data. O separador pode ser ":", "-", "." ou o ponto medio que o Notion
 * sugere no menu de titulo.
 */
const LINHA_DE_POST = new RegExp(
  String.raw`^\s*(?:#+\s*)?(?:[-*]\s*\[(?<marca>[ xX])\]\s*)?\**\s*` +
    String.raw`(?<tipo>posts?|v[ií]deos?|roteiros?|cards?|reels?|stories)\s*0*(?<numero>\d{1,2})\b` +
    String.raw`\s*[:.\-–—·•]?\s*(?<resto>.*?)\s*\**\s*$`,
  "i",
);

/**
 * Formato implicito no proprio tipo da linha. "Roteiro" e sempre roteiro de
 * video na VORA - as paginas de roteiro abrem com a referencia estetica do
 * video.
 */
const FORMATO_DO_TIPO: Record<string, string> = {
  post: "",
  video: "VIDEO",
  roteiro: "VIDEO",
  card: "CARD UNICO",
  reel: "REELS",
  storie: "STORIES",
  story: "STORIES",
};

/** Formatos que a equipe escreve dentro do titulo do item. */
const FORMATOS_CONHECIDOS = [
  "CARROSSEL",
  "REELS",
  "CARD UNICO",
  "CARD ÚNICO",
  "STORIES",
  "VIDEO",
  "VÍDEO",
  "FOTO",
];

/** Data solta dentro do titulo: "Post 04 REELS 12/10 Dia das Criancas". */
const DATA_NO_TITULO = /(?<![\d/])(\d{1,2})[/\.](\d{1,2})(?![\d/])/;

/**
 * Resolve o ano de um dia/mes sem ano: usa o ano de referencia e, se a data
 * cair muito para tras, assume que o planejamento e do ano seguinte. Sem isso,
 * um cronograma de janeiro lido em dezembro entraria com 11 meses de atraso.
 */
function resolverData(
  dia: number,
  mes: number,
  ano: number | null,
  referencia: Date,
): Date | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  if (ano !== null) {
    const completo = ano < 100 ? 2000 + ano : ano;
    const d = new Date(completo, mes - 1, dia, 9, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let candidato = new Date(referencia.getFullYear(), mes - 1, dia, 9, 0, 0, 0);
  const seisMesesAtras = new Date(referencia);
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);
  if (candidato < seisMesesAtras) {
    candidato = new Date(
      referencia.getFullYear() + 1,
      mes - 1,
      dia,
      9,
      0,
      0,
      0,
    );
  }
  return Number.isNaN(candidato.getTime()) ? null : candidato;
}

/**
 * Transforma as linhas da pagina do Notion na lista de itens de pauta.
 *
 * Funcao pura de proposito: da para testar o jeito que a equipe escreve sem
 * tocar na rede nem no banco.
 */
export function interpretarCalendario(
  linhas: LinhaDaPagina[],
  referencia: Date = new Date(),
): ItemDoCalendario[] {
  const itens: ItemDoCalendario[] = [];
  let atual: ItemDoCalendario | null = null;

  for (const linha of linhas) {
    const porDia = lerLinhaDeDia(linha.texto, referencia);
    if (porDia) {
      atual = porDia;
      itens.push(atual);
      continue;
    }

    const porPost = lerLinhaDePost(linha, referencia);
    if (porPost) {
      atual = porPost;
      itens.push(atual);
      continue;
    }

    if (!atual) continue;

    const formato = linha.texto.match(LINHA_DE_FORMATO);
    if (formato && !atual.formato) {
      atual.formato = formato[1].replace(/\*/g, "").trim();
      continue;
    }

    atual.notas = atual.notas ? `${atual.notas}\n${linha.texto}` : linha.texto;
  }

  return itens.map((i) => ({ ...i, notas: i.notas.slice(0, 1800) }));
}

/** "## Sexta-feira - 09/10 | Um passeio pela loja" */
function lerLinhaDeDia(
  texto: string,
  referencia: Date,
): ItemDoCalendario | null {
  const achado = texto.match(LINHA_DE_DIA);
  if (!achado) return null;

  const data = resolverData(
    Number(achado[1]),
    Number(achado[2]),
    achado[3] ? Number(achado[3]) : null,
    referencia,
  );
  const titulo = achado[4].replace(/\\\|/g, "|").trim();
  if (!data || !titulo) return null;

  return { data, titulo, formato: null, notas: "", concluido: false };
}

/** "- [x] **Post 04 REELS 12/10 Dia das Criancas**" */
function lerLinhaDePost(
  linha: LinhaDaPagina,
  referencia: Date,
): ItemDoCalendario | null {
  const achado = linha.texto.match(LINHA_DE_POST);
  if (!achado?.groups) return null;

  const { marca, tipo, numero } = achado.groups;

  // A caixa de marcar pode vir de dois lugares: do bloco "to_do" do Notion
  // (que entrega o estado fora do texto) ou escrita a mao como "- [x]", que e
  // como ela aparece quando alguem cola a pagina de outro lugar.
  const temCaixa = linha.tipo === "to_do" || Boolean(marca);
  const marcado = linha.marcado === true || (marca ?? "").toLowerCase() === "x";

  // "CARD 1", "CARD 3" sao marcacao de slide dentro do roteiro, nao item do
  // cronograma. So contam como item quando vem com caixa de marcar.
  if (/^cards?$/i.test(tipo) && !temCaixa) return null;
  let resto = (achado.groups.resto ?? "").replace(/\*/g, "").trim();

  // Formato escrito dentro do titulo (REELS, CARROSSEL, CARD UNICO...).
  let formato: string | null = null;
  for (const candidato of FORMATOS_CONHECIDOS) {
    const regex = new RegExp(`\\b${candidato.replace(/ /g, "\\s+")}\\b`, "i");
    if (regex.test(resto)) {
      formato = candidato;
      resto = resto.replace(regex, " ").trim();
      break;
    }
  }
  if (!formato) {
    const chave = tipo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/s$/, "");
    formato = FORMATO_DO_TIPO[chave] || null;
  }

  // Data solta no titulo, quando a equipe escreveu uma.
  let data: Date | null = null;
  const comData = resto.match(DATA_NO_TITULO);
  if (comData) {
    data = resolverData(
      Number(comData[1]),
      Number(comData[2]),
      null,
      referencia,
    );
    resto = resto.replace(DATA_NO_TITULO, " ").trim();
  }

  // Sobras de pontuacao de quem escreveu "Post 07 CARROSSEL (OUTUBRO ROSA)".
  const titulo =
    limparTitulo(resto) ||
    `${tipo.replace(/s$/i, "").toUpperCase()} ${Number(numero)}`;

  return {
    data,
    titulo,
    formato,
    notas: "",
    concluido: marcado,
  };
}

function limparTitulo(texto: string): string {
  return texto
    .replace(/^[\s:.\-–—·•]+/, "")
    .replace(/[\s:.\-–—·•]+$/, "")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type ResultadoSincronizacao = {
  cliente: string;
  lidos: number;
  criados: number;
  atualizados: number;
  jaEramPost: number;
  /** Pautas que viraram rascunho no calendario nesta sincronizacao. */
  postosNoCalendario: number;
  /** Dias do cronograma que ja passaram: viram pauta, nunca post. */
  noPassado: number;
};

/**
 * Traz o calendario do cliente no Notion para o planejamento do sistema.
 *
 * Idempotente e conservador: casa pelo titulo dentro do mesmo cliente,
 * atualiza data/notas do que ainda e pauta e **nao mexe** no que ja virou post
 * - mudar a data de um post agendado tem que passar pelo reagendamento, que
 * invalida a aprovacao do cliente.
 */
export async function sincronizarCalendarioDoNotion(input: {
  clienteId: string;
  ator: Ator;
  referencia?: Date;
  /**
   * Alem da pauta, criar o rascunho do post no calendario, na data do
   * cronograma. Fica desligado por padrao: a equipe decide quando o
   * calendario passa a existir.
   */
  criarPostos?: boolean;
  /** Hora do dia dos rascunhos criados (o Notion so da o dia). */
  hora?: number;
}): Promise<ResultadoSincronizacao> {
  const cliente = await prisma.client.findUniqueOrThrow({
    where: { id: input.clienteId },
  });
  const pageId = cliente.notionPageId ? idDaPagina(cliente.notionPageId) : null;
  if (!pageId) {
    throw new ErroDeRegra(
      "Esse cliente nao tem pagina do Notion configurada. Cole o link do planejamento em Ajustes.",
    );
  }

  const linhas = await lerPagina(pageId);
  const itens = interpretarCalendario(linhas, input.referencia ?? new Date());

  const r: ResultadoSincronizacao = {
    cliente: cliente.name,
    lidos: itens.length,
    criados: 0,
    atualizados: 0,
    jaEramPost: 0,
    postosNoCalendario: 0,
    noPassado: 0,
  };

  const agora = input.referencia ?? new Date();
  const hora = input.hora ?? 9;

  for (const item of itens) {
    const existente = await prisma.planningItem.findFirst({
      where: { clientId: cliente.id, title: item.titulo },
    });

    const notas = [item.formato ? `Formato: ${item.formato}` : null, item.notas]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    let pauta = existente;

    if (!pauta) {
      pauta = await prisma.planningItem.create({
        data: {
          clientId: cliente.id,
          title: item.titulo,
          notes: notas || null,
          targetDate: item.data,
          // Item marcado no Notion ja teve roteiro escrito; sem marca, e ideia.
          status: item.concluido ? "EM_PRODUCAO" : "IDEIA",
          source: "notion",
        },
      });
      r.criados += 1;
    } else if (pauta.postId) {
      r.jaEramPost += 1;
      continue;
    }

    // Calendario: a pauta vira rascunho de post na data do cronograma.
    // Item sem data (metade dos cronogramas e lista de posts, nao agenda)
    // continua so como pauta - inventar data seria agendar publicacao no
    // escuro.
    if (input.criarPostos && !pauta.postId && item.data) {
      const quando = new Date(item.data);
      quando.setHours(hora, 0, 0, 0);

      if (quando.getTime() <= agora.getTime()) {
        // Dia que ja passou nao vira post: o sistema agenda publicacao, e
        // agendar para tras nao significa nada. Fica como pauta.
        r.noPassado += 1;
      } else {
        const { criarPost } = await import("./posts.ts");
        const { marcarPautaComoPost } = await import("./planejamento.ts");

        const { postId } = await criarPost({
          dados: {
            clientId: cliente.id,
            caption: [
              item.titulo,
              item.formato ? `Formato: ${item.formato}` : null,
              item.notas,
            ]
              .filter(Boolean)
              .join("\n\n"),
            formato: "IMAGEM_UNICA",
            networks: ["INSTAGRAM"],
            scheduledAt: quando,
          },
          arquivos: [],
          ator: input.ator,
        });

        // A pauta precisa estar em producao para virar post: o cronograma do
        // Notion e justamente o combinado de producao daquele dia.
        await prisma.planningItem.update({
          where: { id: pauta.id },
          data: { status: "EM_PRODUCAO" },
        });
        await marcarPautaComoPost({
          pautaId: pauta.id,
          postId,
          ator: input.ator,
        });
        r.postosNoCalendario += 1;
        continue;
      }
    }

    if (!existente) continue;

    const mudou =
      existente.notes !== (notas || null) ||
      (existente.targetDate?.getTime() ?? null) !==
        (item.data?.getTime() ?? null);
    if (mudou) {
      await prisma.planningItem.update({
        where: { id: existente.id },
        data: { notes: notas || null, targetDate: item.data },
      });
      r.atualizados += 1;
    }
  }

  await prisma.client.update({
    where: { id: cliente.id },
    data: { notionSyncedAt: new Date() },
  });

  await registrarAuditoria({
    entityType: "client",
    entityId: cliente.id,
    action: "notion_sincronizado",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: {
      lidos: r.lidos,
      criados: r.criados,
      atualizados: r.atualizados,
    },
  });

  return r;
}

export type ResultadoSincronizacaoGeral = {
  /** Clientes ativos com pagina do Notion configurada. */
  comPagina: number;
  /** Quantos foram lidos nesta rodada. */
  lidos: ResultadoSincronizacao[];
  /** Quem deu erro, e por que - um cliente com pagina nao compartilhada nao
   *  pode travar o resto da carteira. */
  falhas: Array<{ clienteId: string; cliente: string; erro: string }>;
  /** Pulados por terem sido lidos ha pouco ou por passarem do maximo. */
  pulados: number;
};

/**
 * Le o cronograma de todos os clientes com pagina no Notion, de uma vez.
 *
 * E o que alimenta o calendario geral: cada cliente ganha a pauta (e, se
 * pedido, o rascunho) do seu cronograma, e a equipe ve tudo numa tela so.
 *
 * Serve tanto para o botao da tela quanto para a agenda automatica - por
 * isso aceita um limite de clientes por rodada e um "nao releia quem foi
 * lido ha pouco": a funcao agendada tem poucos segundos, e ler 18 paginas
 * do Notion de minuto em minuto seria desperdicio.
 */
export async function sincronizarTodosOsCalendarios(input: {
  ator: Ator;
  criarPostos?: boolean;
  hora?: number;
  referencia?: Date;
  /** Pula quem foi lido ha menos horas que isso. Sem valor, le todo mundo. */
  lidoHaMenosDeHoras?: number;
  /** Maximo de clientes nesta rodada. Sem valor, todos. */
  maximo?: number;
}): Promise<ResultadoSincronizacaoGeral> {
  const agora = input.referencia ?? new Date();

  const clientes = await prisma.client.findMany({
    where: { active: true, notionPageId: { not: null } },
    select: { id: true, name: true, notionSyncedAt: true },
    // Quem nunca foi lido vai primeiro; depois, do mais antigo ao mais recente.
    orderBy: [
      { notionSyncedAt: { sort: "asc", nulls: "first" } },
      { name: "asc" },
    ],
  });

  const r: ResultadoSincronizacaoGeral = {
    comPagina: clientes.length,
    lidos: [],
    falhas: [],
    pulados: 0,
  };

  const limite =
    input.lidoHaMenosDeHoras !== undefined
      ? new Date(agora.getTime() - input.lidoHaMenosDeHoras * 3_600_000)
      : null;

  const fila = clientes.filter((c) => {
    if (limite && c.notionSyncedAt && c.notionSyncedAt > limite) {
      r.pulados += 1;
      return false;
    }
    return true;
  });

  const nestaRodada =
    input.maximo !== undefined ? fila.slice(0, input.maximo) : fila;
  r.pulados += fila.length - nestaRodada.length;

  for (const cliente of nestaRodada) {
    try {
      r.lidos.push(
        await sincronizarCalendarioDoNotion({
          clienteId: cliente.id,
          ator: input.ator,
          referencia: agora,
          criarPostos: input.criarPostos,
          hora: input.hora,
        }),
      );
    } catch (erro) {
      // Sem token nao adianta tentar o proximo: e a mesma falha 18 vezes.
      if (erro instanceof NotionNaoConfigurado) throw erro;
      r.falhas.push({
        clienteId: cliente.id,
        cliente: cliente.name,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return r;
}
