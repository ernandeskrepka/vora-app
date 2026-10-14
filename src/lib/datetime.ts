import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { env } from "@/env";

/**
 * O banco guarda tudo em UTC. A equipe e o cliente leem sempre em
 * America/Sao_Paulo (ou no fuso do cliente, se for diferente).
 */
export const FUSO_PADRAO = env.APP_TIMEZONE;

/** Converte o valor de um <input type="datetime-local"> para UTC. */
export function doFusoParaUtc(valorLocal: string, fuso: string = FUSO_PADRAO): Date {
  return fromZonedTime(valorLocal, fuso);
}

/** Valor para preencher um <input type="datetime-local">. */
export function paraInputLocal(data: Date, fuso: string = FUSO_PADRAO): string {
  return formatInTimeZone(data, fuso, "yyyy-MM-dd'T'HH:mm");
}

export function formatarDataHora(data: Date, fuso: string = FUSO_PADRAO): string {
  return formatInTimeZone(data, fuso, "dd/MM/yyyy 'as' HH:mm");
}

export function formatarData(data: Date, fuso: string = FUSO_PADRAO): string {
  return formatInTimeZone(data, fuso, "dd/MM/yyyy");
}

export function formatarHora(data: Date, fuso: string = FUSO_PADRAO): string {
  return formatInTimeZone(data, fuso, "HH:mm");
}

export function formatarDiaExtenso(data: Date, fuso: string = FUSO_PADRAO): string {
  const dias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const local = toZonedTime(data, fuso);
  return `${dias[local.getDay()]}, ${formatarData(data, fuso)}`;
}

/** Inicio e fim de um mes (1-12) no fuso informado, em UTC. */
export function intervaloDoMes(ano: number, mes: number, fuso: string = FUSO_PADRAO) {
  const inicio = fromZonedTime(`${ano}-${String(mes).padStart(2, "0")}-01T00:00:00`, fuso);
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const fim = fromZonedTime(`${proximoAno}-${String(proximoMes).padStart(2, "0")}-01T00:00:00`, fuso);
  return { inicio, fim };
}

/**
 * Dia de metrica (coluna @db.Date) vem como meia-noite UTC. Formatar isso no
 * fuso de Sao Paulo joga a data para o dia anterior, entao esse tipo de data
 * tem de ser lido em UTC.
 */
export function formatarDiaUTC(data: Date): string {
  return formatInTimeZone(data, "UTC", "dd/MM");
}

export function chaveDiaLocal(data: Date, fuso: string = FUSO_PADRAO): string {
  return formatInTimeZone(data, fuso, "yyyy-MM-dd");
}

export function somarHoras(data: Date, horas: number): Date {
  return new Date(data.getTime() + horas * 3_600_000);
}

export function subtrairHoras(data: Date, horas: number): Date {
  return somarHoras(data, -horas);
}
