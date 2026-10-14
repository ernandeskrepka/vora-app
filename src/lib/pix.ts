/**
 * BR Code do PIX (QR de cobranca estatico).
 *
 * O formato e o EMV de QR apresentado pelo recebedor: cada campo e
 * `ID (2 digitos) + tamanho (2 digitos) + valor`, e o ultimo campo e o CRC.
 *
 * Dois detalhes que costumam gerar QR que o banco recusa, e por isso estao
 * explicitos aqui:
 * 1. o CRC e calculado **incluindo** o proprio cabecalho "6304";
 * 2. nome e cidade vao em ASCII sem acento, com 25 e 15 caracteres no maximo.
 */

export type DadosPix = {
  /** Chave PIX do recebedor (CPF/CNPJ, e-mail, telefone ou aleatoria). */
  chave: string;
  /** Nome do recebedor, como aparece no app do pagador. */
  nome: string;
  cidade: string;
  /** Valor em reais. Sem valor, o pagador digita quanto quer pagar. */
  valor?: number | null;
  /** Identificador da cobranca (ate 25 caracteres, sem espaco). */
  txid?: string | null;
};

/** CRC-16/CCITT-FALSE: polinomio 0x1021, inicial 0xFFFF, sem reflexao. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/** ASCII sem acento e sem simbolo: o que o padrao aceita em nome e cidade. */
export function normalizarTexto(texto: string, tamanho: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, tamanho)
    .toUpperCase();
}

function normalizarTxid(txid: string): string {
  const limpo = txid
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 25);
  return limpo || "***";
}

export class PixInvalido extends Error {}

export function montarPayloadPix(dados: DadosPix): string {
  const chave = dados.chave.trim();
  if (!chave) throw new PixInvalido("Informe a chave PIX do recebedor.");

  const nome = normalizarTexto(dados.nome, 25);
  const cidade = normalizarTexto(dados.cidade, 15);
  if (!nome) throw new PixInvalido("Informe o nome do recebedor.");
  if (!cidade) throw new PixInvalido("Informe a cidade do recebedor.");

  if (dados.valor !== undefined && dados.valor !== null) {
    if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
      throw new PixInvalido("Valor do PIX invalido.");
    }
  }

  const contaPix = campo("00", "br.gov.bcb.pix") + campo("01", chave);

  const partes = [
    campo("00", "01"), // versao do formato
    campo("26", contaPix),
    campo("52", "0000"), // categoria do recebedor: nao informada
    campo("53", "986"), // real
    ...(dados.valor ? [campo("54", dados.valor.toFixed(2))] : []),
    campo("58", "BR"),
    campo("59", nome),
    campo("60", cidade),
    campo("62", campo("05", normalizarTxid(dados.txid ?? "***"))),
  ];

  const semCrc = `${partes.join("")}6304`;
  return `${semCrc}${crc16(semCrc)}`;
}
