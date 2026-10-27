import { chromium } from "playwright";
import fs from "node:fs";
const DIR = "./scripts/video30";
const modo = process.argv[2] ?? "previa";
const FPS = 30, DUR = 30;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${DIR}/compor.html`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
if (modo === "previa") {
  fs.mkdirSync(`${DIR}/previa`, { recursive: true });
  for (const t of [1.2, 4.0, 5.5, 12.5, 15.5, 18.4, 21.5, 24.0, 28.0]) {
    await page.evaluate((tt) => window.render(tt), t);
    await page.screenshot({ path: `${DIR}/previa/t${t.toFixed(1)}.jpg`, type: "jpeg", quality: 85 });
  }
} else {
  fs.mkdirSync(`${DIR}/quadros`, { recursive: true });
  const total = FPS * DUR;
  for (let i = 0; i < total; i++) {
    await page.evaluate((tt) => window.render(tt), i / FPS);
    await page.screenshot({ path: `${DIR}/quadros/${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
    if (i % 150 === 0) console.log("quadro", i, "/", total);
  }
}
await browser.close();
console.log("ok");
