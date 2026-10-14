/**
 * Nome de campanha em portugues de cliente.
 *
 * Internamente a VORA nomeia assim:
 *
 *   [LAB ST RT 30.07.2026] [ENGAJAMENTO] [MSG WPP] [ADS ESTATICOS] [BAIRRO MARTELLO]
 *
 * O primeiro colchete e codigo de cliente e data, que so serve para a equipe.
 * O resto diz o objetivo, o canal e o tema - e isso o cliente entende, desde
 * que escrito por extenso.
 */

const TRADUCAO: Record<string, string> = {
  ENGAJAMENTO: "Engajamento",
  TRAFEGO: "Trafego",
  CONVERSAO: "Conversao",
  CONVERSOES: "Conversoes",
  "RECONHECIMENTO DE MARCA": "Reconhecimento de marca",
  ALCANCE: "Alcance",
  "MSG WPP": "Mensagem no WhatsApp",
  WHATS: "Mensagem no WhatsApp",
  WHATSAPP: "Mensagem no WhatsApp",
  "PUBLIS IG": "Publicacoes do Instagram",
  "POST IG": "Post do Instagram",
  "ADS ESTATICOS": "Anuncios estaticos",
  "THRU PLAY": "Video assistido",
  "+SEGUIDORES": "Mais seguidores",
  LEADS: "Cadastros",
  CAMPANHA: "Campanha",
};

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function bonito(pedaco: string): string {
  const chave = semAcento(pedaco).toUpperCase().trim();
  if (TRADUCAO[chave]) return TRADUCAO[chave];
  // Tema escrito pela equipe (BAIRRO MARTELLO, OUTUBRO ROSA): so arruma a caixa.
  return pedaco
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (p.length > 2 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ")
    .trim();
}

/** Parece codigo interno de cliente e data? Entao nao vai para o cliente. */
function ehCodigoInterno(pedaco: string): boolean {
  return /\d{2}[./]\d{2}[./]\d{2,4}/.test(pedaco) || /^\s*[A-Z]{2,4}\s*\d*\s*$/.test(pedaco);
}

export function nomeDaCampanhaParaCliente(nome: string): string {
  const pedacos = [...nome.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()).filter(Boolean);

  if (pedacos.length === 0) {
    // Campanha sem colchete nenhum: devolve como esta, so limpando espacos.
    return nome.trim() || "Campanha";
  }

  const uteis = pedacos.filter((p) => !ehCodigoInterno(p)).map(bonito);
  const vistos = new Set<string>();
  const final = uteis.filter((p) => {
    const chave = p.toLowerCase();
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  return final.length > 0 ? final.join(" · ") : "Campanha";
}
