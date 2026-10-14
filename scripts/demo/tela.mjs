import { chromium } from "playwright";
const [,, ...alvos] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/login");
await p.fill('input[name="email"]', "ernandeskrepka@gmail.com");
await p.fill('input[name="senha"]', "vora-5c7a544b79e3");
await p.click('button[type="submit"]');
await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
for (const alvo of alvos) {
  const [caminho, nome] = alvo.split("|");
  await p.goto("http://localhost:3000" + caminho, { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `/tmp/claude-0/tela-${nome}.png`, fullPage: true });
  console.log(nome, "->", p.url());
}
await b.close();
