import { describe, expect, it } from "vitest";
import {
  clienteDoTitulo,
  ehDaPessoa,
  limparTitulo,
  tarefaConcluida,
  tarefaDaPagina,
} from "./tarefas.ts";

/** Linha da base DESIGNER da VORA, como a API devolve. */
const PAGINA = {
  id: "4058b499-e743-8009-b934-d00ec45a1f6f",
  url: "https://www.notion.so/4058b499e7438009b934d00ec45a1f6f",
  last_edited_time: "2026-10-26T18:00:00.000Z",
  archived: false,
  properties: {
    "Nome do conteúdo": { type: "title", title: [{ plain_text: "<p>\nArtes do Santa Rita \n</p>" }] },
    Status: { type: "status", status: { name: "Em edição" } },
    Proprietário: { type: "people", people: [{ id: "u1", name: "Natalia" }, { id: "u2", name: "Victor" }] },
    "Data de publicação": { type: "date", date: { start: "2026-10-26", end: null } },
    "Data de filmagem": { type: "date", date: { start: "2026-10-20", end: null } },
    "Tipo de conteúdo": { type: "select", select: { name: "CARROSSEL" } },
    Plataforma: { type: "multi_select", multi_select: [{ name: "Instagram" }, { name: "TikTok" }] },
    Arte: { type: "url", url: "https://figma.com/x" },
    Link: { type: "url", url: null },
  },
};

describe("tarefa lida do Notion", () => {
  it("le titulo, status, pessoas, datas, tipo, plataformas e links", () => {
    const t = tarefaDaPagina(PAGINA);
    expect(t.title).toBe("Artes do Santa Rita");
    expect(t.status).toBe("Em edição");
    expect(t.ownerNames).toEqual(["Natalia", "Victor"]);
    expect(t.kind).toBe("CARROSSEL");
    expect(t.platforms).toEqual(["Instagram", "TikTok"]);
    expect(t.dueAt?.toISOString()).toBe("2026-10-26T15:00:00.000Z");
    expect(t.filmingAt?.toISOString()).toBe("2026-10-20T15:00:00.000Z");
    expect(t.arteUrl).toBe("https://figma.com/x");
    expect(t.linkUrl).toBeNull();
    expect(t.archived).toBe(false);
    expect(t.notionPageId).toBe(PAGINA.id);
  });

  it("base com outros nomes de coluna: Responsavel, Prazo, select de status", () => {
    const t = tarefaDaPagina({
      id: "x",
      url: "u",
      last_edited_time: "2026-10-26T18:00:00.000Z",
      properties: {
        Tarefa: { type: "title", title: [{ plain_text: "Roteiro Camati" }] },
        Situacao: { type: "select", select: { name: "Feito" } },
        Responsavel: { type: "people", people: [{ name: "Pamela Skrepka" }] },
        Prazo: { type: "date", date: { start: "2026-11-02T14:30:00.000-03:00" } },
        Notas: { type: "rich_text", rich_text: [] },
      },
    });
    expect(t.status).toBe("Feito");
    expect(t.ownerNames).toEqual(["Pamela Skrepka"]);
    expect(t.dueAt?.toISOString()).toBe("2026-11-02T17:30:00.000Z");
    expect(t.filmingAt).toBeNull();
    expect(t.kind).toBeNull();
  });

  it("pagina sem nada util nao quebra", () => {
    const t = tarefaDaPagina({ id: "y", url: "u", last_edited_time: "2026-01-01T00:00:00Z", properties: {} });
    expect(t.title).toBe("(sem titulo)");
    expect(t.status).toBeNull();
    expect(t.dueAt).toBeNull();
    expect(t.ownerNames).toEqual([]);
  });

  it("concluida: pelo grupo da base ou pelo nome do status", () => {
    expect(tarefaConcluida("Publicado", ["Publicado", "Enviado Whats", "Agendado"])).toBe(true);
    expect(tarefaConcluida("Em edição", ["Publicado"])).toBe(false);
    expect(tarefaConcluida("Feito", [])).toBe(true);
    expect(tarefaConcluida("Para fazer", [])).toBe(false);
    expect(tarefaConcluida(null, [])).toBe(false);
  });

  it("reconhece o cliente pelo titulo, sem acento e sem 'Laboratorio'", () => {
    const clientes = [
      { name: "Laboratorio Santa Rita" },
      { name: "Laboratorio Camati" },
      { name: "Danieli Moveis" },
      { name: "Dr. Maykon Ribeiro" },
    ];
    expect(clienteDoTitulo("Artes do Santa Rita", clientes)).toBe("Laboratorio Santa Rita");
    expect(clienteDoTitulo("Artes da Danieli Móveis! Feirão", clientes)).toBe("Danieli Moveis");
    expect(clienteDoTitulo("Reels Maykon Ribeiro novembro", clientes)).toBe("Dr. Maykon Ribeiro");
    expect(clienteDoTitulo("Artes Endogist - Gui", clientes)).toBeNull();
  });

  it("minhas tarefas: bate pelo primeiro nome", () => {
    expect(ehDaPessoa(["Natalia"], "Natália Souza")).toBe(true);
    expect(ehDaPessoa(["Pamela Skrepka"], "Pâmela")).toBe(true);
    expect(ehDaPessoa(["Victor"], "Guilherme Henrik")).toBe(false);
    expect(limparTitulo("<p>\n Oi \n</p>")).toBe("Oi");
  });
});
