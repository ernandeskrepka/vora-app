import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Grava a apresentacao do sistema: navega de verdade no app, com legenda em
 * cima da tela e cartao de titulo entre os blocos.
 *
 * Nada aqui e mockup: as telas sao o app rodando com a carga de demonstracao.
 */

const APP = "http://localhost:3000";
const CARTOES = "http://localhost:4000";
const DESTINO = process.argv[2];
const CLIENTE = process.env.CLIENTE_ID;
const POST = process.env.POST_ID;
const POST_SEM_RESPOSTA = process.env.POST_SEM_RESPOSTA_ID;

mkdirSync(DESTINO, { recursive: true });

const linhaDoTempo = [];
let t0 = Date.now();

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await navegador.newContext({
  // O gravador nao amplia: o quadro do video tem de ser do tamanho do
  // viewport. Para o app aparecer maior, quem cresce 1,5x e a propria pagina
  // (ZOOM, abaixo) - assim o texto fica legivel num projetor.
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: DESTINO, size: { width: 1920, height: 1080 } },
  deviceScaleFactor: 1,
});
const page = await contexto.newPage();
t0 = Date.now();
// O servidor de desenvolvimento compila cada rota na primeira visita, e
// gravar video deixa tudo mais lento: o padrao de 30s nao da conta.
page.setDefaultTimeout(120000);
page.setDefaultNavigationTimeout(120000);

const esperar = (ms) => page.waitForTimeout(ms);

/**
 * Linha do tempo das legendas.
 *
 * Nao da para desenhar a legenda dentro da pagina: com a pagina ampliada o
 * elemento fixo nao entra na gravacao. Entao o roteiro so anota o que estava
 * escrito e quando, e o ffmpeg queima isso no video depois.
 */

function legenda(texto, nota) {
  const agora = (Date.now() - t0) / 1000;
  const anterior = linhaDoTempo[linhaDoTempo.length - 1];
  // So fecha o que ainda esta aberto: um cartao de titulo no meio ja fechou a
  // legenda anterior, e sobrescrever aqui esticaria ela por cima do cartao.
  if (anterior && anterior.fim === null) anterior.fim = agora;
  linhaDoTempo.push({ inicio: agora, fim: null, texto, nota: nota ?? "" });
}

/** Tira a legenda da tela (cartao de titulo nao leva legenda). */
function semLegenda() {
  const anterior = linhaDoTempo[linhaDoTempo.length - 1];
  if (anterior && anterior.fim === null) anterior.fim = (Date.now() - t0) / 1000;
}

/** Desce a pagina devagar, para a tela inteira aparecer sem corte. */
async function descer(fracao, duracao = 3200) {
  await page.evaluate(
    ([fracao, duracao]) => {
      const inicio = window.scrollY;
      const rolavel = Math.max(0, document.body.scrollHeight - window.innerHeight);
      const alvo = rolavel * fracao;
      const t0 = performance.now();
      return new Promise((pronto) => {
        function passo(agora) {
          const p = Math.min(1, (agora - t0) / duracao);
          // Comeca e termina devagar: movimento linear parece robotico.
          const suave = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          window.scrollTo(0, inicio + (alvo - inicio) * suave);
          p < 1 ? requestAnimationFrame(passo) : pronto();
        }
        requestAnimationFrame(passo);
      });
    },
    [fracao, duracao],
  );
}

/** Desliza a tela do cliente dentro da moldura (o telefone.html faz o resto). */
async function rolarNoCelular(ate, passo = 7) {
  await page.evaluate(([ate, passo]) => window.deslizar(ate, passo), [ate, passo]);
}

async function cartao(nome, segundos) {
  semLegenda();
  await page.goto(`${CARTOES}/${nome}.html`, { waitUntil: "networkidle" });
  await esperar(segundos * 1000);
}

/**
 * Quanto a pagina do app cresce no video.
 *
 * 1,3 e o teto: a tabela de Resultados pede 1040px e, acima disso, a largura
 * util cai abaixo disso e a coluna da direita fica cortada no quadro.
 */
const ZOOM = 1.3;

async function tela(caminho) {
  await page.goto(`${APP}${caminho}`, { waitUntil: "networkidle" });
  await page.evaluate((z) => {
    document.body.style.zoom = String(z);
    window.scrollTo(0, 0);
  }, ZOOM);
  await esperar(600);
}

/* ------------------------------------------------------------------ roteiro */

await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', process.env.ADMIN_EMAIL);
await page.fill('input[name="senha"]', process.env.ADMIN_SENHA);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

// Pega o link de aprovacao do post antes de comecar: ele entra na cena do
// celular e nao da para parar a gravacao no meio para buscar.
await page.goto(`${APP}/posts/${POST}`, { waitUntil: "networkidle" });
const linkAprovacao = (
  await page.getByText(/\/aprovar\//).first().innerText()
).trim();

await page.goto(`${APP}/relatorios/${CLIENTE}`, { waitUntil: "networkidle" });
const linkRelatorio = await page.locator("input[readonly]").first().inputValue();

console.log("aprovacao:", linkAprovacao);
console.log("relatorio:", linkRelatorio);

await cartao("00-abertura", 4.2);

// 1. Dashboard
await tela("/");
legenda(
  "Tudo que precisa de você, ao abrir",
  "Quem está sem saldo, o que espera aprovação, o que vai sair e o que falhou.",
);
await esperar(3400);
await descer(1, 2600);
await esperar(2600);

// 2. Calendario
await tela("/calendario");
legenda("O mês inteiro da carteira", "Colorido por status: publicado, aprovado, esperando, sem resposta.");
await esperar(4200);
await descer(1, 2800);
await esperar(2200);

// 3. O post e o link
await tela(`/posts/${POST}`);
legenda(
  "Cada post gera um link próprio",
  "Com validade. Reagendar ou editar derruba a aprovação e pede uma nova.",
);
await esperar(5200);

await cartao("01-regra-aprovacao", 4.6);

// 4. O que o cliente ve
semLegenda();
await page.goto(
  `${CARTOES}/telefone.html?u=${encodeURIComponent(linkAprovacao)}` +
    `&titulo=${encodeURIComponent("Chega o link no WhatsApp")}` +
    `&sub=${encodeURIComponent("Ele abre no celular, sem login e sem instalar nada.")}` +
    `&pontos=${encodeURIComponent("Vê o criativo e a legenda exatos que vão ao ar|Aprova ou reprova escrevendo o motivo|Digita o nome: a decisão fica registrada com IP e horário")}`,
  { waitUntil: "networkidle" },
);
await esperar(3600);
await rolarNoCelular(1500, 6);
await esperar(2800);

await cartao("02-regra-silencio", 4.6);

// 5. POST SEM RESPOSTA
if (POST_SEM_RESPOSTA) {
  await tela(`/posts/${POST_SEM_RESPOSTA}`);
  legenda(
    "O horário passou e o cliente não respondeu",
    "O post não saiu. Fica registrado como POST SEM RESPOSTA, com o histórico completo.",
  );
  await esperar(5200);
}

// 6. Previa do Instagram
await tela(`/clientes/${CLIENTE}/perfil`);
legenda(
  "Como o feed do cliente vai ficar",
  "Publicado e agendado na mesma grade: dá para conferir ritmo, cor e repetição antes de mandar.",
);
await esperar(5600);

// 7. Planejamento e Notion
await tela(`/clientes/${CLIENTE}/planejamento`);
legenda(
  "O cronograma do Notion entra sozinho",
  "Vira pauta e, se você quiser, rascunho no calendário na data certa. Entende os três jeitos que a equipe escreve.",
);
await esperar(5000);
await descer(0.62, 2600);
await esperar(2600);

// 8. Resultados da carteira
await tela("/relatorios");
legenda(
  "A carteira inteira numa tela",
  "Ordenada por quem precisa de atenção, não por nome.",
);
await esperar(4600);
await descer(0.2, 2400);
legenda("Investimento e resultado, dia a dia", "Cada um no seu gráfico: dois eixos fariam comparar alturas que não são comparáveis.");
await esperar(3200);
await descer(0.5, 3000);
legenda("Todos os clientes, com o motivo do lado", "Saldo no limite, custo que subiu, post sem resposta.");
await esperar(3600);
await descer(1, 3000);
legenda("O que funcionou e o que saiu caro", "As campanhas mais baratas e mais caras da carteira, com o criativo.");
await esperar(4000);

// 9. Relatorio do cliente
semLegenda();
await page.goto(
  `${CARTOES}/telefone.html?u=${encodeURIComponent(linkRelatorio)}` +
    `&titulo=${encodeURIComponent("O relatório de 15 em 15 dias")}` +
    `&sub=${encodeURIComponent("O mesmo link abre no celular do cliente, sem login.")}` +
    `&pontos=${encodeURIComponent("Cada sigla explicada: CPC, CPR, CTR, CPM|Comparado com a quinzena anterior|A arte de cada campanha do lado do resultado|Botão de PDF para mandar por e-mail")}`,
  { waitUntil: "networkidle" },
);
await esperar(3600);
await rolarNoCelular(3000, 9);
await esperar(2400);

// 10. Saldo e PIX
await tela(`/clientes/${CLIENTE}/saldo`);
legenda(
  "Saldo no limite vira cobrança pronta",
  "A Meta não entrega saldo pré-pago pela API: o número sai das recargas registradas menos o gasto coletado.",
);
await esperar(4200);
await descer(0.34, 2400);
legenda("PIX com QR Code e copia e cola", "É só mandar no WhatsApp do cliente. O valor sugerido recompõe o patamar da última recarga.");
await esperar(5000);

await cartao("04-encerramento", 7.5);

semLegenda();
await page.close();
await contexto.close();
await navegador.close();

const { writeFileSync } = await import("node:fs");
writeFileSync(`${DESTINO}/legendas.json`, JSON.stringify(linhaDoTempo, null, 2));
console.log("gravado em", DESTINO, "-", linhaDoTempo.length, "legendas");
