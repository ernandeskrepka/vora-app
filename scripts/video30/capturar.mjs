import "dotenv/config";
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = "./scripts/video30/telas";
const POST = process.env.VIDEO_POST ?? "";
const CLIENTE = process.env.VIDEO_CLIENTE ?? "";
const TOKEN = process.env.VIDEO_TOKEN ?? "";
// Link assinado do perfil: npx tsx scripts/link-perfil.ts <nome>
const PERFIL = process.env.VIDEO_PERFIL ?? "";

if (!POST || !CLIENTE || !TOKEN || !PERFIL) {
  console.error("Defina VIDEO_POST, VIDEO_CLIENTE, VIDEO_TOKEN e VIDEO_PERFIL (ver README).");
  process.exit(1);
}
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/login.png` });
await page.fill('input[name="email"]', process.env.ADMIN_EMAIL ?? "");
await page.fill('input[name="senha"]', process.env.ADMIN_SENHA ?? "");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 90000 });
await ctx.addCookies([{ name: "tema", value: "vora", url: BASE }]);

const telas = [
  ["dashboard", "/"],
  ["calendario", "/calendario"],
  ["post", `/posts/${POST}`],
  ["perfil-interno", `/clientes/${CLIENTE}/perfil`],
  ["historico", `/clientes/${CLIENTE}/historico`],
  ["resultados", "/relatorios"],
  ["configuracoes", "/configuracoes"],
  ["clientes", "/clientes"],
  ["materiais", `/clientes/${CLIENTE}/materiais`],
];
for (const [nome, rota] of telas) {
  await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${nome}.png` });
}
// Novo post, com cliente e arquivo escolhidos (previa aparece).
await page.goto(`${BASE}/posts/novo?cliente=${CLIENTE}`, { waitUntil: "networkidle" });
await page.setInputFiles('input[name="arquivos"]', "./.storage/clientes/santa-rita-laboratorio/posts/cmv7eg43i000ox37d4gg1q1bc/04.jpg");
await page.fill('textarea[name="caption"]', "Novembro Azul: cuidar da saude e um gesto de quem ama a vida. Agende seus exames.");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/novo-post.png` });
await ctx.close();

// Celular: aprovacao e perfil publico
const cel = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
const pc = await cel.newPage();
await pc.goto(`${BASE}/aprovar/${TOKEN}`, { waitUntil: "networkidle" });
await pc.waitForTimeout(800);
await pc.screenshot({ path: `${OUT}/aprovar.png` });
await pc.goto(PERFIL, { waitUntil: "networkidle" });
await pc.waitForTimeout(800);
await pc.screenshot({ path: `${OUT}/perfil-publico.png` });
await cel.close();
await browser.close();
console.log("ok");
