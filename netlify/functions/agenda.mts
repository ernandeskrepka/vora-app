import type { Config } from "@netlify/functions";

/**
 * Substitui o worker nesta hospedagem: de minuto em minuto chama a rota que
 * publica o que venceu, marca POST SEM RESPOSTA e envia os lembretes.
 */
export default async () => {
  const base = process.env.APP_URL || process.env.URL;
  const token = process.env.AGENDA_TOKEN;

  if (!base || !token) {
    console.warn("agenda: APP_URL/URL ou AGENDA_TOKEN ausente; nada a fazer");
    return new Response("sem configuracao", { status: 200 });
  }

  const resposta = await fetch(`${base.replace(/\/$/, "")}/api/agenda`, {
    method: "POST",
    headers: { "x-agenda-token": token },
  });
  const corpo = await resposta.text();
  console.log("agenda:", resposta.status, corpo.slice(0, 300));
  return new Response(corpo, { status: resposta.status });
};

export const config: Config = {
  schedule: "* * * * *",
};
