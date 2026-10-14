import { describe, expect, it } from "vitest";
import { nomeDaCampanhaParaCliente } from "./nome-campanha.ts";

describe("nome de campanha para o cliente", () => {
  it("tira o codigo interno e escreve o resto por extenso", () => {
    expect(
      nomeDaCampanhaParaCliente(
        "[LAB ST RT 30.07.2026] [ENGAJAMENTO] [MSG WPP] [ADS ESTATICOS] [BAIRRO MARTELLO]",
      ),
    ).toBe("Engajamento · Mensagem no WhatsApp · Anuncios estaticos · Bairro Martello");
  });

  it("traduz os codigos de canal que a equipe usa", () => {
    expect(nomeDaCampanhaParaCliente("[DMD 07.04.2026] [TRAFEGO] [+SEGUIDORES]")).toBe(
      "Trafego · Mais seguidores",
    );
    expect(nomeDaCampanhaParaCliente("[DMD 15.04.2026] [ENGAJAMENTO] [THRU PLAY] [POST IG]")).toBe(
      "Engajamento · Video assistido · Post do Instagram",
    );
  });

  it("aceita acento no objetivo", () => {
    expect(nomeDaCampanhaParaCliente("[X 01.01.2026] [TRÁFEGO] [WHATS]")).toBe(
      "Trafego · Mensagem no WhatsApp",
    );
  });

  it("nao repete o mesmo pedaco duas vezes", () => {
    expect(nomeDaCampanhaParaCliente("[A 01.01.2026] [MSG WPP] [WHATSAPP]")).toBe(
      "Mensagem no WhatsApp",
    );
  });

  it("deixa a campanha sem colchete como esta", () => {
    expect(nomeDaCampanhaParaCliente("Campanha de outubro")).toBe("Campanha de outubro");
  });

  it("nao devolve vazio quando so havia codigo interno", () => {
    expect(nomeDaCampanhaParaCliente("[LAB ST RT 30.07.2026]")).toBe("Campanha");
  });
});
