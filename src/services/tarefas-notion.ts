import { prisma } from "@/lib/db.ts";
import { logger } from "@/lib/logger.ts";
import { registrarAuditoria } from "@/lib/audit.ts";
import {
  NotionNaoConfigurado,
  esquemaDaBase,
  idDaPagina,
  linhasDaBase,
} from "@/lib/notion/client.ts";
import {
  clienteDoTitulo,
  ehDaPessoa,
  tarefaConcluida,
  tarefaDaPagina,
} from "@/domain/tarefas.ts";
import { FUSO_PADRAO, chaveDiaLocal } from "@/lib/datetime.ts";
import { ErroDeRegra } from "./erros.ts";
import type { Ator } from "./transicoes.ts";

const log = logger("tarefas-notion");

export const CHAVE_BASES = "notion_bases_de_tarefas";
export const CHAVE_ULTIMA_LEITURA = "notion_tarefas_lidas_em";

/**
 * Base de tarefas sugerida: o calendario DESIGNER da VORA, que o Notion
 * Calendar mostra. Outras bases (VORA - PRODUTORA, por cliente) entram
 * pela tela de Configuracoes, desde que compartilhadas com a integracao.
 */
export const BASE_SUGERIDA = {
  id: "2718b499-e743-81ce-9c34-cfdbc9e068e4",
  nome: "DESIGNER (calendario da equipe)",
};

export type BaseDeTarefas = { id: string; nome: string };

export async function basesConfiguradas(): Promise<BaseDeTarefas[]> {
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_BASES } });
  const valor = linha?.value;
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((b): b is BaseDeTarefas => typeof b === "object" && b !== null && "id" in b)
    .map((b) => ({ id: String(b.id), nome: String(b.nome ?? "Base do Notion") }));
}

async function salvarBases(bases: BaseDeTarefas[]) {
  await prisma.setting.upsert({
    where: { key: CHAVE_BASES },
    create: { key: CHAVE_BASES, value: bases },
    update: { value: bases },
  });
}

export async function adicionarBase(input: { entrada: string; nome?: string | null; ator: Ator }) {
  const id = idDaPagina(input.entrada);
  if (!id) throw new ErroDeRegra("Cole o link da base do Notion (ou o ID dela).");
  const bases = await basesConfiguradas();
  if (bases.some((b) => b.id === id)) throw new ErroDeRegra("Essa base ja esta na lista.");

  // Le o titulo na hora: confirma que a integracao enxerga a base.
  let nome = input.nome?.trim() || "";
  try {
    const esquema = await esquemaDaBase(id);
    nome = nome || esquema.titulo;
  } catch (erro) {
    if (erro instanceof NotionNaoConfigurado) throw new ErroDeRegra(erro.message);
    throw new ErroDeRegra(
      "O Notion nao deixou ler essa base. Abra a base no Notion, menu ... > Conexoes, e compartilhe com a integracao da VORA.",
    );
  }

  await salvarBases([...bases, { id, nome }]);
  await registrarAuditoria({
    entityType: "setting",
    entityId: CHAVE_BASES,
    action: "configuracoes_salvas",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { baseAdicionada: nome },
  });
  return { id, nome };
}

export async function removerBase(input: { id: string; ator: Ator }) {
  const bases = await basesConfiguradas();
  await salvarBases(bases.filter((b) => b.id !== input.id));
  await prisma.teamTask.updateMany({ where: { databaseId: input.id }, data: { archived: true } });
  await registrarAuditoria({
    entityType: "setting",
    entityId: CHAVE_BASES,
    action: "configuracoes_salvas",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: { baseRemovida: input.id },
  });
}

export type ResultadoSincronizacao = {
  bases: number;
  lidas: number;
  novas: number;
  atualizadas: number;
  arquivadas: number;
  falhas: Array<{ base: string; erro: string }>;
};

/**
 * Le todas as bases configuradas e espelha as linhas em TeamTask.
 * Idempotente: roda quantas vezes quiser, pelo botao ou pela agenda.
 */
export async function sincronizarTarefas(input: { ator: Ator }): Promise<ResultadoSincronizacao> {
  const bases = await basesConfiguradas();
  const resultado: ResultadoSincronizacao = {
    bases: bases.length,
    lidas: 0,
    novas: 0,
    atualizadas: 0,
    arquivadas: 0,
    falhas: [],
  };
  if (bases.length === 0) return resultado;

  const clientes = await prisma.client.findMany({ where: { active: true }, select: { name: true } });
  const agora = new Date();

  for (const base of bases) {
    try {
      const esquema = await esquemaDaBase(base.id);
      const linhas = await linhasDaBase(base.id);
      const vistas = new Set<string>();

      for (const pagina of linhas) {
        const t = tarefaDaPagina(pagina);
        vistas.add(t.notionPageId);
        const dados = {
          databaseId: base.id,
          title: t.title,
          status: t.status,
          ownerNames: t.ownerNames,
          kind: t.kind,
          platforms: t.platforms,
          dueAt: t.dueAt,
          filmingAt: t.filmingAt,
          url: t.url,
          arteUrl: t.arteUrl,
          linkUrl: t.linkUrl,
          clientName: clienteDoTitulo(t.title, clientes),
          concluida: tarefaConcluida(t.status, esquema.statusConcluidos),
          archived: t.archived,
          notionEditedAt: t.notionEditedAt,
          syncedAt: agora,
        };
        const existente = await prisma.teamTask.findUnique({ where: { notionPageId: t.notionPageId } });
        if (!existente) {
          await prisma.teamTask.create({ data: { notionPageId: t.notionPageId, ...dados } });
          resultado.novas++;
        } else {
          await prisma.teamTask.update({ where: { id: existente.id }, data: dados });
          if (existente.notionEditedAt.getTime() !== t.notionEditedAt.getTime()) resultado.atualizadas++;
        }
        resultado.lidas++;
      }

      // Linha que sumiu da base (apagada no Notion) deixa de aparecer.
      const sumidas = await prisma.teamTask.updateMany({
        where: { databaseId: base.id, archived: false, notionPageId: { notIn: [...vistas] } },
        data: { archived: true, syncedAt: agora },
      });
      resultado.arquivadas += sumidas.count;
    } catch (erro) {
      if (erro instanceof NotionNaoConfigurado) throw erro;
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      resultado.falhas.push({ base: base.nome, erro: mensagem });
      log.warn("base de tarefas nao pode ser lida", { base: base.nome, erro: mensagem });
    }
  }

  await prisma.setting.upsert({
    where: { key: CHAVE_ULTIMA_LEITURA },
    create: { key: CHAVE_ULTIMA_LEITURA, value: agora.toISOString() },
    update: { value: agora.toISOString() },
  });

  await registrarAuditoria({
    entityType: "setting",
    entityId: CHAVE_BASES,
    action: "tarefas_sincronizadas",
    actorType: input.ator.tipo,
    actorUserId: input.ator.usuarioId ?? null,
    actorName: input.ator.nome ?? null,
    metadata: {
      bases: resultado.bases,
      lidas: resultado.lidas,
      novas: resultado.novas,
      atualizadas: resultado.atualizadas,
      falhas: resultado.falhas.length,
    },
  });

  log.info("tarefas sincronizadas", { ...resultado, falhas: resultado.falhas.length });
  return resultado;
}

export async function ultimaLeituraDeTarefas(): Promise<Date | null> {
  const linha = await prisma.setting.findUnique({ where: { key: CHAVE_ULTIMA_LEITURA } });
  return typeof linha?.value === "string" ? new Date(linha.value) : null;
}

export type TarefaDaEquipe = {
  id: string;
  titulo: string;
  status: string | null;
  responsaveis: string[];
  cliente: string | null;
  tipo: string | null;
  quando: Date | null;
  filmagem: Date | null;
  url: string;
  arteUrl: string | null;
  concluida: boolean;
  minha: boolean;
};

export type QuadroDeTarefas = {
  atrasadas: TarefaDaEquipe[];
  hoje: TarefaDaEquipe[];
  proximas: TarefaDaEquipe[];
  semData: TarefaDaEquipe[];
  concluidasRecentes: TarefaDaEquipe[];
  total: number;
  ultimaLeitura: Date | null;
  bases: BaseDeTarefas[];
};

/**
 * O quadro do dashboard: o que esta atrasado, o que e hoje, o que vem nos
 * proximos dias e o que esta sem data, tudo em aberto. "Minha" marca o que
 * esta com a pessoa logada (pelo primeiro nome, como no Notion).
 */
export async function quadroDeTarefas(input: {
  nomeDaPessoa?: string | null;
  dias?: number;
  referencia?: Date;
} = {}): Promise<QuadroDeTarefas> {
  const agora = input.referencia ?? new Date();
  const dias = input.dias ?? 7;
  const hoje = chaveDiaLocal(agora, FUSO_PADRAO);
  const limite = new Date(agora.getTime() + dias * 86_400_000);

  const [abertas, feitas, ultimaLeitura, bases] = await Promise.all([
    prisma.teamTask.findMany({
      where: { archived: false, concluida: false },
      orderBy: [{ dueAt: "asc" }, { notionEditedAt: "desc" }],
      take: 300,
    }),
    prisma.teamTask.findMany({
      where: { archived: false, concluida: true },
      orderBy: { notionEditedAt: "desc" },
      take: 8,
    }),
    ultimaLeituraDeTarefas(),
    basesConfiguradas(),
  ]);

  const paraTarefa = (t: (typeof abertas)[number]): TarefaDaEquipe => ({
    id: t.id,
    titulo: t.title,
    status: t.status,
    responsaveis: t.ownerNames,
    cliente: t.clientName,
    tipo: t.kind,
    quando: t.dueAt,
    filmagem: t.filmingAt,
    url: t.url,
    arteUrl: t.arteUrl,
    concluida: t.concluida,
    minha: input.nomeDaPessoa ? ehDaPessoa(t.ownerNames, input.nomeDaPessoa) : false,
  });

  const quadro: QuadroDeTarefas = {
    atrasadas: [],
    hoje: [],
    proximas: [],
    semData: [],
    concluidasRecentes: feitas.map(paraTarefa),
    total: abertas.length,
    ultimaLeitura,
    bases,
  };

  for (const t of abertas) {
    const tarefa = paraTarefa(t);
    if (!t.dueAt) {
      if (quadro.semData.length < 12) quadro.semData.push(tarefa);
      continue;
    }
    const dia = chaveDiaLocal(t.dueAt, FUSO_PADRAO);
    if (dia === hoje) quadro.hoje.push(tarefa);
    else if (dia < hoje) quadro.atrasadas.push(tarefa);
    else if (t.dueAt <= limite) quadro.proximas.push(tarefa);
  }
  // Atrasadas: a mais recente primeiro, que e a que ainda da para salvar.
  quadro.atrasadas.reverse();
  return quadro;
}
