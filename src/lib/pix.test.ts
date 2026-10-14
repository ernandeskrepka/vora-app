import { describe, expect, it } from "vitest";
import { crc16, montarPayloadPix, normalizarTexto, PixInvalido } from "./pix.ts";

/** Le um payload EMV de volta: {id: valor}. Serve para conferir a montagem. */
function abrir(payload: string): Record<string, string> {
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < payload.length - 4) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    campos[id] = payload.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return campos;
}

describe("CRC do BR Code", () => {
  it("bate com o valor de referencia do CRC-16/CCITT-FALSE", () => {
    // Vetor classico do algoritmo: "123456789" -> 0x29B1.
    expect(crc16("123456789")).toBe("29B1");
  });

  it("muda quando qualquer caractere muda", () => {
    expect(crc16("123456789")).not.toBe(crc16("123456780"));
  });
});

describe("payload do PIX", () => {
  const base = { chave: "financeiro@vorabr.com", nome: "VORA Marketing", cidade: "Fraiburgo" };

  it("monta os campos obrigatorios na ordem do padrao", () => {
    const payload = montarPayloadPix(base);
    const campos = abrir(payload);

    expect(campos["00"]).toBe("01");
    expect(campos["26"]).toContain("br.gov.bcb.pix");
    expect(campos["26"]).toContain("financeiro@vorabr.com");
    expect(campos["53"]).toBe("986");
    expect(campos["58"]).toBe("BR");
    expect(campos["59"]).toBe("VORA MARKETING");
    expect(campos["60"]).toBe("FRAIBURGO");
  });

  it("fecha com o CRC calculado sobre o payload inteiro, incluindo o 6304", () => {
    const payload = montarPayloadPix(base);
    const semCrc = payload.slice(0, -4);

    expect(semCrc.endsWith("6304")).toBe(true);
    expect(payload.slice(-4)).toBe(crc16(semCrc));
  });

  it("inclui o valor com ponto e duas casas", () => {
    const payload = montarPayloadPix({ ...base, valor: 300 });
    expect(abrir(payload)["54"]).toBe("300.00");

    const quebrado = montarPayloadPix({ ...base, valor: 80.5 });
    expect(abrir(quebrado)["54"]).toBe("80.50");
  });

  it("sem valor, o pagador decide quanto paga", () => {
    expect(abrir(montarPayloadPix(base))["54"]).toBeUndefined();
  });

  it("leva o identificador da cobranca no campo 62", () => {
    const payload = montarPayloadPix({ ...base, txid: "santa-rita-2026-10" });
    expect(abrir(payload)["62"]).toBe("0515santarita202610");
  });

  it("usa *** quando nao ha identificador", () => {
    expect(abrir(montarPayloadPix(base))["62"]).toBe("0503***");
  });

  it("tira acento e corta nome e cidade no limite do padrao", () => {
    expect(normalizarTexto("Sao Jose do Rio Preto e mais um pouco", 15)).toBe("SAO JOSE DO RIO");
    expect(normalizarTexto("Criacao & Midia Ltda.", 25)).toBe("CRIACAO  MIDIA LTDA");
  });

  it("recusa dados que gerariam um QR que o banco nao abre", () => {
    expect(() => montarPayloadPix({ ...base, chave: "  " })).toThrow(PixInvalido);
    expect(() => montarPayloadPix({ ...base, nome: "!!!" })).toThrow(PixInvalido);
    expect(() => montarPayloadPix({ ...base, cidade: "" })).toThrow(PixInvalido);
    expect(() => montarPayloadPix({ ...base, valor: 0 })).toThrow(PixInvalido);
    expect(() => montarPayloadPix({ ...base, valor: -5 })).toThrow(PixInvalido);
  });
});
