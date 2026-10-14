import { chromium } from "playwright";
const [,, url, nome] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(600);
await p.screenshot({ path: `/tmp/claude-0/tela-${nome}.png`, fullPage: true });
console.log(nome, p.url(), await p.title());
await b.close();
