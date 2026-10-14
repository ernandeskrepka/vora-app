/**
 * Regras de formato de midia exigidas pela Meta.
 *
 * Os numeros abaixo vem da documentacao oficial (Instagram Content
 * Publishing / IG User Media) e estao centralizados aqui de proposito: a
 * Meta muda esses limites, e quando mudar e um arquivo so para ajustar.
 * Conferido em 13/10/2026 - rever a cada versao nova da Graph API.
 */

export type MediaKind = "IMAGEM" | "VIDEO";
export type PostFormat = "IMAGEM_UNICA" | "CARROSSEL" | "VIDEO" | "REELS";
export type Network = "INSTAGRAM" | "FACEBOOK";

export const MIME_IMAGEM_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/bmp"];
export const MIME_VIDEO_ACEITOS = ["video/mp4", "video/quicktime"];

/** O Instagram so aceita JPEG: o upload converte o resto. */
export const MIME_IMAGEM_INSTAGRAM = "image/jpeg";

export const LIMITES_INSTAGRAM = {
  imagem: {
    proporcaoMin: 4 / 5, // 0.8
    proporcaoMax: 1.91,
    larguraMin: 320,
    larguraMax: 1440,
    tamanhoMaxBytes: 8 * 1024 * 1024,
  },
  video: {
    duracaoMinSegundos: 3,
    duracaoMaxSegundos: 15 * 60,
    tamanhoMaxBytes: 300 * 1024 * 1024,
    proporcaoMin: 0.01,
    proporcaoMax: 10,
  },
  reels: {
    duracaoMinSegundos: 3,
    duracaoMaxSegundos: 15 * 60,
    tamanhoMaxBytes: 300 * 1024 * 1024,
    proporcaoRecomendada: 9 / 16,
    proporcaoMin: 0.01,
    proporcaoMax: 10,
  },
  carrossel: { minItens: 2, maxItens: 10 },
} as const;

export const LIMITES_FACEBOOK = {
  imagem: { tamanhoMaxBytes: 10 * 1024 * 1024 },
  video: { tamanhoMaxBytes: 1024 * 1024 * 1024, duracaoMaxSegundos: 240 * 60 },
} as const;

export type ArquivoParaValidar = {
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  originalFilename?: string | null;
};

export type Problema = { campo: string; mensagem: string };

export type ResultadoValidacao = {
  ok: boolean;
  erros: Problema[];
  avisos: Problema[];
};

function formatarMB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function proporcao(a: ArquivoParaValidar): number | null {
  if (!a.width || !a.height) return null;
  return a.width / a.height;
}

export function kindEsperadoPorFormato(formato: PostFormat): MediaKind | "QUALQUER" {
  switch (formato) {
    case "IMAGEM_UNICA":
      return "IMAGEM";
    case "VIDEO":
    case "REELS":
      return "VIDEO";
    case "CARROSSEL":
      return "QUALQUER";
  }
}

/**
 * Valida o conjunto de arquivos de um post contra o formato escolhido e as
 * redes de destino. Erro impede pedir aprovacao; aviso so informa a equipe.
 */
export function validarMidiaDoPost(input: {
  formato: PostFormat;
  networks: Network[];
  arquivos: ArquivoParaValidar[];
}): ResultadoValidacao {
  const erros: Problema[] = [];
  const avisos: Problema[] = [];
  const { formato, networks, arquivos } = input;
  const paraInstagram = networks.includes("INSTAGRAM");
  const paraFacebook = networks.includes("FACEBOOK");

  if (networks.length === 0) {
    erros.push({ campo: "networks", mensagem: "Escolha ao menos uma rede (Instagram ou Facebook)." });
  }

  if (arquivos.length === 0) {
    erros.push({ campo: "midia", mensagem: "Envie ao menos um arquivo de criativo." });
    return { ok: false, erros, avisos };
  }

  // Quantidade por formato.
  if (formato === "CARROSSEL") {
    const { minItens, maxItens } = LIMITES_INSTAGRAM.carrossel;
    if (arquivos.length < minItens || arquivos.length > maxItens) {
      erros.push({
        campo: "midia",
        mensagem: `Carrossel aceita de ${minItens} a ${maxItens} itens (enviados: ${arquivos.length}).`,
      });
    }
  } else if (arquivos.length > 1) {
    erros.push({
      campo: "midia",
      mensagem: "Esse formato aceita um unico arquivo. Para varios, use o formato Carrossel.",
    });
  }

  // Tipo de midia por formato.
  const esperado = kindEsperadoPorFormato(formato);
  if (esperado !== "QUALQUER") {
    for (const [i, a] of arquivos.entries()) {
      if (a.kind !== esperado) {
        erros.push({
          campo: `midia[${i}]`,
          mensagem: `O formato escolhido espera ${esperado === "IMAGEM" ? "imagem" : "video"}.`,
        });
      }
    }
  }

  for (const [i, a] of arquivos.entries()) {
    const campo = `midia[${i}]`;
    const nome = a.originalFilename ? `"${a.originalFilename}"` : `arquivo ${i + 1}`;

    if (a.kind === "IMAGEM") {
      if (!MIME_IMAGEM_ACEITOS.includes(a.mimeType)) {
        erros.push({ campo, mensagem: `${nome}: tipo de imagem nao aceito (${a.mimeType}).` });
      }
      if (paraInstagram) {
        const lim = LIMITES_INSTAGRAM.imagem;
        if (a.mimeType !== MIME_IMAGEM_INSTAGRAM) {
          avisos.push({
            campo,
            mensagem: `${nome}: sera convertido para JPEG no envio (o Instagram so aceita JPEG).`,
          });
        }
        if (a.sizeBytes > lim.tamanhoMaxBytes) {
          erros.push({
            campo,
            mensagem: `${nome}: ${formatarMB(a.sizeBytes)} excede o limite do Instagram (${formatarMB(lim.tamanhoMaxBytes)}).`,
          });
        }
        const p = proporcao(a);
        if (p !== null && (p < lim.proporcaoMin - 0.001 || p > lim.proporcaoMax + 0.001)) {
          erros.push({
            campo,
            mensagem: `${nome}: proporcao ${p.toFixed(2)}:1 fora do aceito pelo Instagram (de 4:5 a 1.91:1).`,
          });
        }
        if (a.width && a.width < lim.larguraMin) {
          erros.push({
            campo,
            mensagem: `${nome}: largura de ${a.width}px abaixo do minimo do Instagram (${lim.larguraMin}px).`,
          });
        }
        if (a.width && a.width > lim.larguraMax) {
          avisos.push({
            campo,
            mensagem: `${nome}: ${a.width}px de largura; o Instagram vai reduzir para ${lim.larguraMax}px.`,
          });
        }
      }
      if (paraFacebook && a.sizeBytes > LIMITES_FACEBOOK.imagem.tamanhoMaxBytes) {
        erros.push({
          campo,
          mensagem: `${nome}: ${formatarMB(a.sizeBytes)} excede o limite do Facebook (${formatarMB(LIMITES_FACEBOOK.imagem.tamanhoMaxBytes)}).`,
        });
      }
    }

    if (a.kind === "VIDEO") {
      if (!MIME_VIDEO_ACEITOS.includes(a.mimeType)) {
        erros.push({ campo, mensagem: `${nome}: tipo de video nao aceito (${a.mimeType}). Use MP4 ou MOV.` });
      }
      if (paraInstagram) {
        const lim = formato === "REELS" ? LIMITES_INSTAGRAM.reels : LIMITES_INSTAGRAM.video;
        if (a.sizeBytes > lim.tamanhoMaxBytes) {
          erros.push({
            campo,
            mensagem: `${nome}: ${formatarMB(a.sizeBytes)} excede o limite do Instagram (${formatarMB(lim.tamanhoMaxBytes)}).`,
          });
        }
        if (a.durationSeconds != null) {
          if (a.durationSeconds < lim.duracaoMinSegundos) {
            erros.push({
              campo,
              mensagem: `${nome}: ${a.durationSeconds.toFixed(1)}s e menos que o minimo de ${lim.duracaoMinSegundos}s.`,
            });
          }
          if (a.durationSeconds > lim.duracaoMaxSegundos) {
            erros.push({
              campo,
              mensagem: `${nome}: ${Math.round(a.durationSeconds)}s excede o maximo de ${lim.duracaoMaxSegundos}s.`,
            });
          }
        } else {
          avisos.push({
            campo,
            mensagem: `${nome}: nao foi possivel medir a duracao; confira antes de agendar.`,
          });
        }
        const p = proporcao(a);
        if (p !== null && (p < lim.proporcaoMin || p > lim.proporcaoMax)) {
          erros.push({ campo, mensagem: `${nome}: proporcao ${p.toFixed(2)}:1 fora do aceito pelo Instagram.` });
        }
        if (formato === "REELS" && p !== null && Math.abs(p - LIMITES_INSTAGRAM.reels.proporcaoRecomendada) > 0.05) {
          avisos.push({
            campo,
            mensagem: `${nome}: Reels funciona melhor em 9:16 (vertical); esse esta em ${p.toFixed(2)}:1.`,
          });
        }
      }
      if (paraFacebook && a.sizeBytes > LIMITES_FACEBOOK.video.tamanhoMaxBytes) {
        erros.push({ campo, mensagem: `${nome}: video acima do limite do Facebook.` });
      }
    }
  }

  if (formato === "CARROSSEL" && paraInstagram && arquivos.length > 1) {
    const primeira = proporcao(arquivos[0]);
    const divergente = arquivos.slice(1).some((a) => {
      const p = proporcao(a);
      return p !== null && primeira !== null && Math.abs(p - primeira) > 0.02;
    });
    if (divergente) {
      avisos.push({
        campo: "midia",
        mensagem: "O Instagram recorta todos os itens do carrossel pela proporcao do primeiro.",
      });
    }
  }

  return { ok: erros.length === 0, erros, avisos };
}
