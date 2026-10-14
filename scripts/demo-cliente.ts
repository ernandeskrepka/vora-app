import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db.ts";
import { env } from "../src/env.ts";
import { hashToken, tokenDoPedido } from "../src/lib/crypto.ts";
import { chaveDeMidia, storage } from "../src/lib/storage/index.ts";
import { processarArquivo } from "../src/lib/media/processar.ts";
import { gerarSlug } from "../src/services/clientes.ts";

/**
 * Monta um exemplo com material real de um cliente, para mostrar a ele como
 * o sistema vai funcionar antes de ligar de verdade.
 *
 *   npx tsx scripts/demo-cliente.ts ./demo-midia --nome "Santa Rita" --handle santarita
 *
 * Regras de agrupamento dos arquivos da pasta:
 * - arquivos com sufixo _01, _02... e mesmo prefixo viram UM carrossel;
 * - os demais viram posts de imagem unica;
 * - o grupo mais recente fica aguardando aprovacao (o script imprime o link);
 * - os outros entram como ja publicados, para a previa do perfil ter grade.
 */

type Grupo = { chave: string; arquivos: string[] };

/** Amanha, na hora cheia informada, no fuso do sistema. */
function amanhaAs(hora: number) {
  const d = new Date(Date.now() + 86_400_000);
  // O fuso do app e America/Sao_Paulo (UTC-3).
  d.setUTCHours(hora + 3, 0, 0, 0);
  return d;
}

function argumento(nome: string, padrao: string) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const pasta = process.argv[2];
if (!pasta) {
  console.error("Uso: npx tsx scripts/demo-cliente.ts <pasta-com-imagens> [--nome X] [--handle Y]");
  process.exit(1);
}

const nomeCliente = argumento("nome", path.basename(path.resolve(pasta)));
const handle = argumento("handle", gerarSlug(nomeCliente).replace(/-/g, ""));
const telefone = argumento("telefone", "5549999990000");
const contato = argumento("contato", "Contato do cliente");

const EXTENSOES = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"];

function agrupar(arquivos: string[]): Grupo[] {
  const grupos = new Map<string, string[]>();
  for (const arquivo of arquivos) {
    const base = path.parse(arquivo).name;
    const m = base.match(/^(.*?)[-_ ]?(\d{1,2})$/);
    const chave = m && m[1].length > 2 ? m[1] : base;
    grupos.set(chave, [...(grupos.get(chave) ?? []), arquivo]);
  }
  return [...grupos.entries()]
    .map(([chave, lista]) => ({ chave, arquivos: lista.sort() }))
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

/**
 * Legenda de exemplo. Numa operacao real quem escreve e a equipe; aqui so
 * precisamos de um texto plausivel para a tela nao ficar vazia.
 */
function legendaDe(grupo: Grupo, cliente: string) {
  const titulo = grupo.chave
    .replace(/^c+arrossel[-_ ]*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const assunto = /^\d+$/.test(titulo) ? "" : `${titulo.charAt(0).toUpperCase()}${titulo.slice(1)}. `;
  return (
    `${assunto}Cuidar da saude comeca com informacao.\n\n` +
    `Agende pelo WhatsApp e fale com a equipe ${cliente}.`
  );
}

async function main() {
  const todos = (await readdir(pasta)).filter((a) =>
    EXTENSOES.includes(path.extname(a).toLowerCase()),
  );
  if (todos.length === 0) {
    console.error(`Nenhuma imagem ou video em ${pasta}`);
    process.exit(1);
  }

  const grupos = agrupar(todos);
  console.log(`${todos.length} arquivo(s) em ${grupos.length} post(s).`);

  const slug = gerarSlug(nomeCliente);
  await prisma.client.deleteMany({ where: { slug } });

  const cliente = await prisma.client.create({
    data: {
      name: nomeCliente,
      slug,
      notes: "Cliente de demonstracao, criado a partir de material real.",
      contacts: {
        create: [{ name: contato, phoneE164: telefone, isApprover: true, receivesReminders: true }],
      },
      metaConnections: {
        create: [
          {
            assetType: "INSTAGRAM",
            assetId: `17841400000${Math.floor(Math.random() * 900000 + 100000)}`,
            assetName: `@${handle}`,
            authMode: "SYSTEM_USER",
            status: "CONECTADO",
            lastCheckedAt: new Date(),
          },
          {
            assetType: "FACEBOOK_PAGE",
            assetId: `10000000000${Math.floor(Math.random() * 9000 + 1000)}`,
            assetName: nomeCliente,
            authMode: "SYSTEM_USER",
            status: "CONECTADO",
            lastCheckedAt: new Date(),
          },
        ],
      },
    },
  });

  const usuario = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  let linkDoPendente: string | null = null;

  for (const [indice, grupo] of grupos.entries()) {
    const ultimo = indice === grupos.length - 1;
    const carrossel = grupo.arquivos.length > 1;
    // Os publicados ficam no passado; o pendente, daqui a 2 dias.
    // O pendente cai amanha as 9h; os publicados ficam espalhados no passado.
    const quando = ultimo ? amanhaAs(9) : new Date(Date.now() - (grupos.length - indice) * 3 * 86_400_000);

    const post = await prisma.post.create({
      data: {
        clientId: cliente.id,
        createdById: usuario?.id ?? null,
        caption: legendaDe(grupo, nomeCliente),
        format: carrossel ? "CARROSSEL" : "IMAGEM_UNICA",
        networks: ["INSTAGRAM", "FACEBOOK"],
        scheduledAt: quando,
        status: ultimo ? "AGUARDANDO_APROVACAO" : "PUBLICADO",
        approvedAt: ultimo ? null : quando,
        publishedAt: ultimo ? null : quando,
      },
    });

    for (const [posicao, nome] of grupo.arquivos.entries()) {
      const conteudo = await readFile(path.join(pasta, nome));
      const midia = await processarArquivo({
        nome,
        mimeType: nome.toLowerCase().endsWith(".png")
          ? "image/png"
          : nome.toLowerCase().endsWith(".mp4")
            ? "video/mp4"
            : "image/jpeg",
        conteudo,
      });
      const key = chaveDeMidia({
        clientSlug: cliente.slug,
        postId: post.id,
        posicao,
        extensao: midia.extensao,
      });
      await storage.salvar(key, midia.conteudo, midia.mimeType);
      await prisma.postMedia.create({
        data: {
          postId: post.id,
          position: posicao,
          kind: midia.kind,
          storageKey: key,
          mimeType: midia.mimeType,
          width: midia.width,
          height: midia.height,
          sizeBytes: midia.sizeBytes,
          durationSeconds: midia.durationSeconds,
          originalFilename: midia.originalFilename,
        },
      });
    }

    if (ultimo) {
      const pedidoId = randomUUID();
      const token = tokenDoPedido(pedidoId);
      await prisma.approvalRequest.create({
        data: {
          id: pedidoId,
          postId: post.id,
          postVersion: 1,
          tokenHash: hashToken(token),
          status: "PENDENTE",
          channel: "LOG",
          sentAt: new Date(),
          expiresAt: quando,
        },
      });
      await prisma.auditLog.create({
        data: {
          entityType: "post",
          entityId: post.id,
          action: "pedido_de_aprovacao_enviado",
          actorType: "USUARIO",
          actorUserId: usuario?.id ?? null,
          actorName: usuario?.name ?? "Equipe VORA",
          fromStatus: "RASCUNHO",
          toStatus: "AGUARDANDO_APROVACAO",
          metadata: { demo: true },
        },
      });
      linkDoPendente = `${env.APP_URL.replace(/\/$/, "")}/aprovar/${token}`;
    } else {
      for (const rede of ["INSTAGRAM", "FACEBOOK"] as const) {
        await prisma.postPublication.create({
          data: {
            postId: post.id,
            network: rede,
            externalId: `demo_${rede.toLowerCase()}_${randomUUID().slice(0, 8)}`,
            permalink: null,
            dryRun: true,
            publishedAt: quando,
          },
        });
      }
    }

    console.log(
      `  ${ultimo ? "aguardando aprovacao" : "publicado"}: ${grupo.chave} (${grupo.arquivos.length} arquivo(s))`,
    );
  }

  console.log("\n-------------------------------------------------");
  console.log(`Cliente: ${nomeCliente}  (@${handle})`);
  if (linkDoPendente) {
    console.log("Link de aprovacao para abrir no celular:");
    console.log(linkDoPendente);
  }
  console.log("-------------------------------------------------");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
