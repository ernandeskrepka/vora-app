// Converte o PNG baixado do Drive em JPEG leve para a demonstracao.
import sharp from "sharp";
const [,, entrada, saida, largura = "1080"] = process.argv;
const info = await sharp(entrada)
  .resize({ width: Number(largura), withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(saida);
console.log(`${saida}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
