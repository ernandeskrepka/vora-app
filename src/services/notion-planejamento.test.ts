import { describe, expect, it } from "vitest";
import { interpretarCalendario } from "./notion-planejamento.ts";
import { idDaPagina } from "@/lib/notion/client.ts";

/** Trecho real de um cronograma da VORA, como o Notion devolve. */
const PAGINA = [
  { tipo: "paragraph", texto: "Obs: Seria muito legal fazer alguns stories em dia de montagem." },
  { tipo: "divider", texto: "" },
  { tipo: "heading_2", texto: "Sexta-feira — 09/10 | Um passeio pela loja" },
  { tipo: "paragraph", texto: "**Formato:** vídeo simples / tour" },
  { tipo: "numbered_list_item", texto: "Filmar a entrada e revelar um dos ambientes mais bonitos." },
  { tipo: "numbered_list_item", texto: "Fazer cortes rápidos de sofás, poltronas e camas." },
  { tipo: "heading_2", texto: "Terça-feira — 13/10 | O sofá que chama atenção" },
  { tipo: "paragraph", texto: "**Formato:** vídeo de produto" },
  { tipo: "numbered_list_item", texto: "Mostrar o sofá inteiro, de frente e de lado." },
  // Sem ## e com a barra escapada, como aparece quando alguem cola de outro lugar.
  { tipo: "paragraph", texto: "Segunda-feira — 26/10 \\| O cantinho do descanso" },
  { tipo: "paragraph", texto: "Mostrar uma poltrona e uma luminária." },
].filter((l) => l.texto);

const REFERENCIA = new Date(2026, 9, 14); // 14/10/2026

describe("calendario do Notion", () => {
  it("le cada dia como uma pauta, com formato e notas", () => {
    const itens = interpretarCalendario(PAGINA, REFERENCIA);

    expect(itens).toHaveLength(3);
    expect(itens[0].titulo).toBe("Um passeio pela loja");
    expect(itens[0].formato).toBe("vídeo simples / tour");
    expect(itens[0].data.getDate()).toBe(9);
    expect(itens[0].data.getMonth()).toBe(9);
    expect(itens[0].notas).toContain("Filmar a entrada");
    expect(itens[0].notas).not.toContain("sofá que chama");
  });

  it("entende o dia sem ## e com a barra escapada", () => {
    const itens = interpretarCalendario(PAGINA, REFERENCIA);
    expect(itens[2].titulo).toBe("O cantinho do descanso");
    expect(itens[2].data.getDate()).toBe(26);
  });

  it("ignora o texto solto antes do primeiro dia", () => {
    const itens = interpretarCalendario(PAGINA, REFERENCIA);
    for (const item of itens) expect(item.notas).not.toContain("Seria muito legal");
  });

  it("joga para o ano seguinte quando a data ja passou ha muito", () => {
    const itens = interpretarCalendario(
      [{ tipo: "heading_2", texto: "Quarta-feira — 07/01 | Retomada do ano" }],
      new Date(2026, 9, 14),
    );
    expect(itens[0].data.getFullYear()).toBe(2027);
  });

  it("respeita o ano quando ele vem escrito", () => {
    const itens = interpretarCalendario(
      [{ tipo: "heading_2", texto: "03/11/2026 | Lancamento" }],
      REFERENCIA,
    );
    expect(itens[0].data.getFullYear()).toBe(2026);
    expect(itens[0].data.getMonth()).toBe(10);
  });

  it("aceita travessao no lugar da barra", () => {
    const itens = interpretarCalendario(
      [{ tipo: "paragraph", texto: "15/10 - Dia do professor" }],
      REFERENCIA,
    );
    expect(itens[0].titulo).toBe("Dia do professor");
  });

  it("nao inventa pauta a partir de texto comum", () => {
    const itens = interpretarCalendario(
      [
        { tipo: "paragraph", texto: "Lembrar de pedir as fotos ao cliente" },
        { tipo: "paragraph", texto: "O combo custa R$ 139,90 e vale ate 31/10" },
      ],
      REFERENCIA,
    );
    expect(itens).toHaveLength(0);
  });

  it("aceita link do Notion e id solto", () => {
    expect(idDaPagina("https://app.notion.com/p/3f48b499e74381d6b63af048deef3927?pvs=4")).toBe(
      "3f48b499-e743-81d6-b63a-f048deef3927",
    );
    expect(idDaPagina("3f48b499-e743-81d6-b63a-f048deef3927")).toBe(
      "3f48b499-e743-81d6-b63a-f048deef3927",
    );
    expect(idDaPagina("sem id aqui")).toBeNull();
  });
});
