import { describe, expect, it } from "vitest";
import { detalheDoEvento, nomeDeQuemFez, rotuloDaAcao } from "./historico.ts";

describe("rotulos do historico", () => {
  it("traduz acao conhecida e nao quebra com desconhecida", () => {
    expect(rotuloDaAcao("post_criado")).toBe("Criou o post");
    expect(rotuloDaAcao("acao_nova_qualquer")).toBe("acao nova qualquer");
  });

  it("identifica quem fez", () => {
    expect(nomeDeQuemFez({ actorType: "USUARIO", actorName: "Natalia" })).toBe("Natalia");
    expect(nomeDeQuemFez({ actorType: "CLIENTE", actorName: "Joao" })).toBe("cliente Joao");
    expect(nomeDeQuemFez({ actorType: "SISTEMA", actorName: "agenda" })).toBe("sistema (agenda)");
    expect(nomeDeQuemFez({ actorType: "SISTEMA", actorName: null })).toBe("sistema");
  });

  it("resume o metadata quando vale a pena", () => {
    expect(detalheDoEvento("materiais_adicionados", { arquivos: 3 })).toBe("3 arquivo(s)");
    expect(detalheDoEvento("post_criado", { arquivos: 0 })).toBe("sem criativo ainda");
    expect(
      detalheDoEvento("post_editado", { alterou: { legenda: true, midia: true, horario: false } }),
    ).toBe("mudou legenda, midia");
    expect(detalheDoEvento("post_editado", { alterou: {} })).toBeNull();
    expect(detalheDoEvento("login", { x: 1 })).toBeNull();
    expect(detalheDoEvento("post_criado", null)).toBeNull();
  });
});
