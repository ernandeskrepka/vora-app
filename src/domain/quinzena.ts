import { fromZonedTime } from "date-fns-tz";
import { FUSO_PADRAO } from "@/lib/datetime.ts";

/**
 * Quinzena: a janela de relatorio da VORA.
 *
 * O cliente nao acompanha numero de um dia so - um dia ruim nao quer dizer
 * nada e um dia bom tambem nao. A conversa com ele e de quinze em quinze dias,
 * entao e essa a unidade do relatorio: dia 1 ao 15, e dia 16 ao fim do mes
 * (que pode ter 13, 14, 15 ou 16 dias, conforme o mes).
 */
export type Quinzena = {
  /** Chave estavel usada na URL: "2026-10-Q1". */
  chave: string;
  ano: number;
  mes: number;
  metade: 1 | 2;
  /** Instante inicial, no fuso do cliente, ja em UTC. */
  inicio: Date;
  /** Instante final exclusivo. */
  fim: Date;
  /** Numero de dias da janela. */
  dias: number;
};

const FORMATO = /^(\d{4})-(\d{2})-Q([12])$/;

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

export function montarQuinzena(
  ano: number,
  mes: number,
  metade: 1 | 2,
  fuso: string = FUSO_PADRAO,
): Quinzena {
  const ultimo = diasNoMes(ano, mes);
  const diaInicio = metade === 1 ? 1 : 16;
  const diaFimExclusivo = metade === 1 ? 16 : ultimo + 1;

  const mm = String(mes).padStart(2, "0");
  const inicio = fromZonedTime(`${ano}-${mm}-${String(diaInicio).padStart(2, "0")}T00:00:00`, fuso);

  const fim =
    metade === 1
      ? fromZonedTime(`${ano}-${mm}-16T00:00:00`, fuso)
      : fromZonedTime(
          mes === 12
            ? `${ano + 1}-01-01T00:00:00`
            : `${ano}-${String(mes + 1).padStart(2, "0")}-01T00:00:00`,
          fuso,
        );

  return {
    chave: `${ano}-${mm}-Q${metade}`,
    ano,
    mes,
    metade,
    inicio,
    fim,
    dias: diaFimExclusivo - diaInicio,
  };
}

/** Quinzena em que uma data cai. */
export function quinzenaDe(data: Date, fuso: string = FUSO_PADRAO): Quinzena {
  // O dia precisa ser lido no fuso do cliente: 31/10 as 22h em Sao Paulo ja e
  // 01/11 em UTC, e o relatorio seguiria a virada errada.
  const local = new Date(data.toLocaleString("en-US", { timeZone: fuso }));
  return montarQuinzena(
    local.getFullYear(),
    local.getMonth() + 1,
    local.getDate() <= 15 ? 1 : 2,
    fuso,
  );
}

export function quinzenaPorChave(chave: string, fuso: string = FUSO_PADRAO): Quinzena | null {
  const achado = chave.match(FORMATO);
  if (!achado) return null;
  const ano = Number(achado[1]);
  const mes = Number(achado[2]);
  if (mes < 1 || mes > 12) return null;
  return montarQuinzena(ano, mes, Number(achado[3]) as 1 | 2, fuso);
}

export function quinzenaAnterior(q: Quinzena, fuso: string = FUSO_PADRAO): Quinzena {
  if (q.metade === 2) return montarQuinzena(q.ano, q.mes, 1, fuso);
  return q.mes === 1
    ? montarQuinzena(q.ano - 1, 12, 2, fuso)
    : montarQuinzena(q.ano, q.mes - 1, 2, fuso);
}

export function quinzenaSeguinte(q: Quinzena, fuso: string = FUSO_PADRAO): Quinzena {
  if (q.metade === 1) return montarQuinzena(q.ano, q.mes, 2, fuso);
  return q.mes === 12
    ? montarQuinzena(q.ano + 1, 1, 1, fuso)
    : montarQuinzena(q.ano, q.mes + 1, 1, fuso);
}

const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "1 a 15 de outubro de 2026" - o jeito que o cliente le. */
export function rotuloDaQuinzena(q: Quinzena): string {
  const ultimo = diasNoMes(q.ano, q.mes);
  const de = q.metade === 1 ? 1 : 16;
  const ate = q.metade === 1 ? 15 : ultimo;
  return `${de} a ${ate} de ${MESES[q.mes - 1]} de ${q.ano}`;
}

export function rotuloCurto(q: Quinzena): string {
  const ultimo = diasNoMes(q.ano, q.mes);
  const de = q.metade === 1 ? 1 : 16;
  const ate = q.metade === 1 ? 15 : ultimo;
  const mm = String(q.mes).padStart(2, "0");
  return `${de}/${mm} a ${ate}/${mm}`;
}
