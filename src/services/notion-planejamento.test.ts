import { describe, expect, it } from "vitest";
import { interpretarCalendario } from "./notion-planejamento.ts";
import { idDaPagina } from "@/lib/notion/client.ts";

/** Trecho real de um cronograma da VORA, como o Notion devolve. */
const PAGINA = [
  {
    tipo: "paragraph",
    texto: "Obs: Seria muito legal fazer alguns stories em dia de montagem.",
  },
  { tipo: "divider", texto: "" },
  { tipo: "heading_2", texto: "Sexta-feira — 09/10 | Um passeio pela loja" },
  { tipo: "paragraph", texto: "**Formato:** vídeo simples / tour" },
  {
    tipo: "numbered_list_item",
    texto: "Filmar a entrada e revelar um dos ambientes mais bonitos.",
  },
  {
    tipo: "numbered_list_item",
    texto: "Fazer cortes rápidos de sofás, poltronas e camas.",
  },
  {
    tipo: "heading_2",
    texto: "Terça-feira — 13/10 | O sofá que chama atenção",
  },
  { tipo: "paragraph", texto: "**Formato:** vídeo de produto" },
  {
    tipo: "numbered_list_item",
    texto: "Mostrar o sofá inteiro, de frente e de lado.",
  },
  // Sem ## e com a barra escapada, como aparece quando alguem cola de outro lugar.
  {
    tipo: "paragraph",
    texto: "Segunda-feira — 26/10 \\| O cantinho do descanso",
  },
  { tipo: "paragraph", texto: "Mostrar uma poltrona e uma luminária." },
].filter((l) => l.texto);

const REFERENCIA = new Date(2026, 9, 14); // 14/10/2026

describe("calendario do Notion", () => {
  it("le cada dia como uma pauta, com formato e notas", () => {
    const itens = interpretarCalendario(PAGINA, REFERENCIA);

    expect(itens).toHaveLength(3);
    expect(itens[0].titulo).toBe("Um passeio pela loja");
    expect(itens[0].formato).toBe("vídeo simples / tour");
    expect(itens[0].data!.getDate()).toBe(9);
    expect(itens[0].data!.getMonth()).toBe(9);
    expect(itens[0].notas).toContain("Filmar a entrada");
    expect(itens[0].notas).not.toContain("sofá que chama");
  });

  it("entende o dia sem ## e com a barra escapada", () => {
    const itens = interpretarCalendario(PAGINA, REFERENCIA);
    expect(itens[2].titulo).toBe("O cantinho do descanso");
    expect(itens[2].data!.getDate()).toBe(26);
  });

  it("ignora o texto solto antes do primeiro dia", () => {
    const itens = interpretarCalendario(PAGINA, REFERENCIA);
    for (const item of itens)
      expect(item.notas).not.toContain("Seria muito legal");
  });

  it("joga para o ano seguinte quando a data ja passou ha muito", () => {
    const itens = interpretarCalendario(
      [{ tipo: "heading_2", texto: "Quarta-feira — 07/01 | Retomada do ano" }],
      new Date(2026, 9, 14),
    );
    expect(itens[0].data!.getFullYear()).toBe(2027);
  });

  it("respeita o ano quando ele vem escrito", () => {
    const itens = interpretarCalendario(
      [{ tipo: "heading_2", texto: "03/11/2026 | Lancamento" }],
      REFERENCIA,
    );
    expect(itens[0].data!.getFullYear()).toBe(2026);
    expect(itens[0].data!.getMonth()).toBe(10);
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
        {
          tipo: "paragraph",
          texto: "O combo custa R$ 139,90 e vale ate 31/10",
        },
      ],
      REFERENCIA,
    );
    expect(itens).toHaveLength(0);
  });

  it("aceita link do Notion e id solto", () => {
    expect(
      idDaPagina(
        "https://app.notion.com/p/3f48b499e74381d6b63af048deef3927?pvs=4",
      ),
    ).toBe("3f48b499-e743-81d6-b63a-f048deef3927");
    expect(idDaPagina("3f48b499-e743-81d6-b63a-f048deef3927")).toBe(
      "3f48b499-e743-81d6-b63a-f048deef3927",
    );
    expect(idDaPagina("sem id aqui")).toBeNull();
  });
});

/**
 * O outro formato real: o cronograma do Santa Rita e uma lista de posts, com
 * caixa de marcar, sem agenda. Linhas copiadas da pagina de verdade - inclusive
 * o estado das caixas, que na pagina estao todas marcadas.
 *
 * Repare que o texto do "to_do" nao traz o "- [x]": o Notion entrega a marca
 * fora do texto, em `marcado`.
 */
const LISTA_DE_POSTS = [
  {
    tipo: "to_do",
    marcado: true,
    texto:
      "**Vídeo 01:  REELS – OUTUBRO ROSA (gravar com uma mulher, uma das funcionárias)**",
  },
  {
    tipo: "paragraph",
    texto: "CENA 1 (pessoa segurando uma nota de 100,00 e uma de 50,00)",
  },
  { tipo: "paragraph", texto: "12 exames por menos de R$ 150,00?" },
  {
    tipo: "to_do",
    marcado: true,
    texto: "Post 2 uma arte com o valor dos exames!",
  },
  { tipo: "paragraph", texto: "Post 03 CARROSSEL (Outubro Rosa)" },
  { tipo: "paragraph", texto: "CARD 1" },
  {
    tipo: "to_do",
    marcado: true,
    texto: "**Post 04 REELS 12/10 Dia das Crianças**",
  },
  { tipo: "to_do", marcado: true, texto: "Post 07 CARROSSEL (OUTUBRO ROSA)" },
  {
    tipo: "paragraph",
    texto:
      "**POST 12 REELS (Nov Azul – Prevenção – Ivhan: Homem adulto, corredor)**",
  },
];

describe("cronograma em lista de posts", () => {
  it("le cada post da lista, mesmo sem data", () => {
    const itens = interpretarCalendario(LISTA_DE_POSTS, REFERENCIA);

    expect(itens).toHaveLength(6);
    expect(itens[0].titulo).toContain("OUTUBRO ROSA");
    expect(itens[0].formato).toBe("REELS");
    expect(itens[0].data).toBeNull();
    expect(itens[0].notas).toContain("CENA 1");
  });

  it("pega a data quando ela aparece no titulo", () => {
    const itens = interpretarCalendario(LISTA_DE_POSTS, REFERENCIA);
    const diaDasCriancas = itens.find((i) => i.titulo.includes("Crianças"));

    expect(diaDasCriancas?.data?.getDate()).toBe(12);
    expect(diaDasCriancas?.data?.getMonth()).toBe(9);
    expect(diaDasCriancas?.formato).toBe("REELS");
    expect(diaDasCriancas?.titulo).toBe("Dia das Crianças");
  });

  it("tira o parenteses de titulo que e so o tema", () => {
    const itens = interpretarCalendario(LISTA_DE_POSTS, REFERENCIA);
    const carrossel = itens.find(
      (i) => i.titulo === "OUTUBRO ROSA" && i.formato === "CARROSSEL",
    );
    expect(carrossel).toBeTruthy();
  });

  it("marca como em producao o que ja esta marcado no Notion", () => {
    const itens = interpretarCalendario(LISTA_DE_POSTS, REFERENCIA);
    expect(itens.find((i) => i.titulo === "Dia das Crianças")?.concluido).toBe(
      true,
    );
    expect(itens.find((i) => i.titulo.includes("Nov Azul"))?.concluido).toBe(
      false,
    );
  });

  it("caixa vazia e item que ainda nao saiu do papel", () => {
    const itens = interpretarCalendario(
      [
        {
          tipo: "to_do",
          marcado: false,
          texto: "Post 13 CARROSSEL (Novembro Azul)",
        },
        { tipo: "to_do", marcado: true, texto: "Post 14 REELS (Bastidores)" },
      ],
      REFERENCIA,
    );
    expect(itens.map((i) => i.concluido)).toEqual([false, true]);
  });

  it("entende tambem a caixa escrita a mao, de quem colou de outro lugar", () => {
    const itens = interpretarCalendario(
      [{ tipo: "paragraph", texto: "- [x] Post 15 REELS (Dia do dentista)" }],
      REFERENCIA,
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].concluido).toBe(true);
  });

  it("nao confunde linha comum com item da lista", () => {
    const itens = interpretarCalendario(
      [
        {
          tipo: "paragraph",
          texto: "CARD 3 Neste Outubro Rosa, coloque seus exames em dia!",
        },
        {
          tipo: "paragraph",
          texto: "CENA 5 Porque mais importante do que aproveitar",
        },
      ],
      REFERENCIA,
    );
    expect(itens).toHaveLength(0);
  });
});

/**
 * Terceiro formato real: pagina de roteiros, um titulo por roteiro, sem data e
 * sem caixa de marcar. Linhas do Dr. Maykon e do Fleming.
 */
const LISTA_DE_ROTEIROS = [
  { tipo: "heading_1", texto: "ROTEIRO 01 \u00b7 INSTITUCIONAL" },
  {
    tipo: "paragraph",
    texto:
      "Refer\u00eancia est\u00e9tica para o v\u00eddeo: https://www.instagram.com/reel/DUjUFh8j4L0/",
  },
  {
    tipo: "paragraph",
    texto: "Aqui n\u00e3o \u00e9 s\u00f3 um consult\u00f3rio.",
  },
  { tipo: "heading_1", texto: "ROTEIRO 02: AUTORIDADE" },
  {
    tipo: "heading_2",
    texto: "Por que voc\u00ea n\u00e3o emagrece: Usar o roteiro como um guia!",
  },
  { tipo: "heading_1", texto: "ROTEIRO 03 \u00b7" },
  { tipo: "paragraph", texto: "Metabolismo lento!" },
  {
    tipo: "paragraph",
    texto:
      "**V\u00eddeo 04: Outubro Rosa! Ser\u00e1 postado no inicio de outubro**",
  },
  {
    tipo: "heading_2",
    texto: "V\u00eddeo 05: Emagrecer n\u00e3o \u00e9 s\u00f3 perder peso",
  },
];

describe("cronograma em lista de roteiros", () => {
  it("le um item por roteiro, sem data e sem caixa", () => {
    const itens = interpretarCalendario(LISTA_DE_ROTEIROS, REFERENCIA);

    expect(itens.map((i) => i.titulo)).toEqual([
      "INSTITUCIONAL",
      "AUTORIDADE",
      "ROTEIRO 3",
      "Outubro Rosa! Ser\u00e1 postado no inicio de outubro",
      "Emagrecer n\u00e3o \u00e9 s\u00f3 perder peso",
    ]);
    expect(itens.every((i) => i.data === null)).toBe(true);
    expect(itens.every((i) => i.concluido === false)).toBe(true);
  });

  it("roteiro e roteiro de video: entra como VIDEO", () => {
    const itens = interpretarCalendario(LISTA_DE_ROTEIROS, REFERENCIA);
    expect(itens.map((i) => i.formato)).toEqual([
      "VIDEO",
      "VIDEO",
      "VIDEO",
      "VIDEO",
      "VIDEO",
    ]);
  });

  it("guarda o roteiro inteiro nas notas do item", () => {
    const itens = interpretarCalendario(LISTA_DE_ROTEIROS, REFERENCIA);
    expect(itens[0].notas).toContain(
      "Aqui n\u00e3o \u00e9 s\u00f3 um consult\u00f3rio",
    );
    expect(itens[0].notas).not.toContain("emagrece");
    expect(itens[1].notas).toContain("Usar o roteiro como um guia");
  });

  it("nao confunde o numero da cena com item", () => {
    const itens = interpretarCalendario(
      [
        {
          tipo: "heading_1",
          texto: "V\u00eddeo 02 \u00b7 Seu Fran\u00e7a e Fabr\u00edcio",
        },
        { tipo: "heading_3", texto: "CENA 1" },
        { tipo: "heading_3", texto: "1. ABERTURA" },
        { tipo: "paragraph", texto: "FRASE 2" },
      ],
      REFERENCIA,
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].titulo).toBe("Seu Fran\u00e7a e Fabr\u00edcio");
  });
});
