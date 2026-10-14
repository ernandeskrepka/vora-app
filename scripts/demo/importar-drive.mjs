// Pega os downloads do Drive salvos pelo harness, converte em JPEG leve e
// coloca em public/demonstracao/<cliente>/<nome>.jpg.
//
// Roda uma vez por lote: le todos os arquivos de resultado ainda nao
// processados e usa o mapa id -> destino.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PASTA = process.argv[2];
const MAPA = JSON.parse(readFileSync(process.argv[3], "utf8"));
const DESTINO = "public/demonstracao";
const PROCESSADOS = "/tmp/claude-0/processados.json";

const feitos = existsSync(PROCESSADOS) ? JSON.parse(readFileSync(PROCESSADOS, "utf8")) : [];
const arquivos = readdirSync(PASTA).filter((f) => f.includes("download_file_content") && !feitos.includes(f));

for (const arquivo of arquivos) {
  const bruto = JSON.parse(readFileSync(path.join(PASTA, arquivo), "utf8"));
  const alvo = MAPA[bruto.id];
  if (!alvo) { console.log(`- ${bruto.title}: sem destino no mapa, ignorado`); feitos.push(arquivo); continue; }
  const saida = path.join(DESTINO, `${alvo}.jpg`);
  mkdirSync(path.dirname(saida), { recursive: true });
  const info = await sharp(Buffer.from(bruto.content, "base64"))
    .resize({ width: 1080, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(saida);
  console.log(`+ ${bruto.title} -> ${saida} (${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB)`);
  feitos.push(arquivo);
}
writeFileSync(PROCESSADOS, JSON.stringify(feitos, null, 2));
