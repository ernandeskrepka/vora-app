import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Queima as legendas no video com ffmpeg.
 *
 * A legenda nao pode ser desenhada dentro do navegador: com a pagina ampliada
 * o elemento fixo nao entra na gravacao. Entao o gravador anota o que estava
 * escrito e quando, e o desenho acontece aqui.
 */

const [, , entrada, legendasJson, saida, pastaFontes] = process.argv;

const LARGURA = 1920;
const ALTURA = 1080;
const MARGEM = 50;
const ALTURA_FAIXA = 148;
const TITULO = 37;
const NOTA = 23;

const preta = `${pastaFontes}/creato-display-black.ttf`;
const normal = `${pastaFontes}/creato-display-regular.ttf`;

const legendas = JSON.parse(readFileSync(legendasJson, "utf8"));

/** ffmpeg usa ':' e '\\' na propria sintaxe do filtro. */
function escapar(texto) {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%");
}

const filtros = [];

for (const l of legendas) {
  if (l.fim === null || l.fim - l.inicio < 0.6) continue;
  const dentro = `between(t,${l.inicio.toFixed(2)},${l.fim.toFixed(2)})`;

  // Faixa solida: por tras dela passa tanto a barra escura do menu quanto o
  // fundo claro do painel, e um degrade ficaria cinzento de um lado so.
  filtros.push(
    `drawbox=x=0:y=${ALTURA - ALTURA_FAIXA}:w=${LARGURA}:h=${ALTURA_FAIXA}:` +
      `color=0x070D0B:t=fill:enable='${dentro}'`,
    `drawbox=x=0:y=${ALTURA - ALTURA_FAIXA}:w=${LARGURA}:h=3:` +
      `color=0x02D89E:t=fill:enable='${dentro}'`,
    `drawtext=fontfile='${preta}':text='${escapar(l.texto)}':` +
      `x=${MARGEM}:y=${ALTURA - ALTURA_FAIXA + 26}:fontsize=${TITULO}:fontcolor=0xF5F6F7:` +
      `enable='${dentro}'`,
  );

  if (l.nota) {
    filtros.push(
      `drawtext=fontfile='${normal}':text='${escapar(l.nota)}':` +
        `x=${MARGEM}:y=${ALTURA - ALTURA_FAIXA + 82}:fontsize=${NOTA}:fontcolor=0x9AA19C:` +
        `enable='${dentro}'`,
    );
  }
}

// Abre e fecha em preto: o corte seco no primeiro e no ultimo quadro
// incomoda em apresentacao.
const duracao = Number(
  execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", entrada,
  ]).toString().trim(),
);
filtros.push(`fade=t=in:st=0:d=0.5`, `fade=t=out:st=${(duracao - 0.7).toFixed(2)}:d=0.7`);

const arquivoFiltro = `${pastaFontes}/filtro.txt`;
writeFileSync(arquivoFiltro, filtros.join(","));

execFileSync(
  "ffmpeg",
  [
    "-y", "-loglevel", "error",
    "-i", entrada,
    "-filter_complex_script", arquivoFiltro,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart",
    saida,
  ],
  { stdio: "inherit" },
);

console.log(`${legendas.length} legendas queimadas em ${saida}`);
console.log(`duracao ${duracao.toFixed(1)}s`);
