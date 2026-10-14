import "dotenv/config";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../src/lib/db.ts";
import { hashSenha, hashToken, tokenDoPedido } from "../src/lib/crypto.ts";
import { chaveDeMidia, storage } from "../src/lib/storage/index.ts";
import { env } from "../src/env.ts";

/**
 * Seed de desenvolvimento.
 *
 * Cria a equipe, os tres clientes do piloto (Danieli Moveis, Dental Care e
 * Laboratorio Fleming) e alguns posts em estados diferentes, para a equipe
 * ver o fluxo inteiro sem precisar esperar horario nenhum.
 */

const SENHA_PADRAO = process.env.SEED_SENHA ?? "vora-piloto-2026";

async function criativoExemplo(titulo: string, cor: string) {
  const svg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1080" fill="${cor}"/>
    <text x="540" y="500" font-family="Inter, sans-serif" font-size="64" font-weight="700"
      fill="#ffffff" text-anchor="middle">${titulo}</text>
    <text x="540" y="590" font-family="Inter, sans-serif" font-size="34"
      fill="#ffffff" opacity="0.8" text-anchor="middle">criativo de exemplo - VORA</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

async function anexarMidia(input: {
  postId: string;
  clientSlug: string;
  titulo: string;
  cor: string;
  posicao?: number;
}) {
  const conteudo = await criativoExemplo(input.titulo, input.cor);
  const meta = await sharp(conteudo).metadata();
  const key = chaveDeMidia({
    clientSlug: input.clientSlug,
    postId: input.postId,
    posicao: input.posicao ?? 0,
    extensao: "jpg",
  });
  await storage.salvar(key, conteudo, "image/jpeg");
  await prisma.postMedia.create({
    data: {
      postId: input.postId,
      position: input.posicao ?? 0,
      kind: "IMAGEM",
      storageKey: key,
      mimeType: "image/jpeg",
      width: meta.width ?? 1080,
      height: meta.height ?? 1080,
      sizeBytes: conteudo.byteLength,
      originalFilename: `${input.titulo.toLowerCase().replace(/\s+/g, "-")}.jpg`,
    },
  });
}

async function main() {
  console.log("Limpando dados de desenvolvimento...");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.approvalDecision.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.publishAttempt.deleteMany(),
    prisma.postPublication.deleteMany(),
    prisma.postMedia.deleteMany(),
    prisma.post.deleteMany(),
    prisma.adInsightDaily.deleteMany(),
    prisma.metaConnection.deleteMany(),
    prisma.clientContact.deleteMany(),
    prisma.client.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setting.deleteMany(),
  ]);

  const admin = await prisma.user.create({
    data: {
      name: "Ernande Krepka",
      email: "ernandeskrepka@gmail.com",
      passwordHash: hashSenha(SENHA_PADRAO),
      role: "ADMIN",
    },
  });

  await prisma.user.create({
    data: {
      name: "Equipe VORA",
      email: "equipe@vorabr.com",
      passwordHash: hashSenha(SENHA_PADRAO),
      role: "EDITOR",
    },
  });

  const pilotos = [
    {
      nome: "Danieli Moveis",
      contato: { nome: "Danieli", telefone: "5549999990001" },
      cor: "#7c3aed",
      ig: "17841400000000001",
      page: "100000000000001",
      ads: "act_1000000000001",
    },
    {
      nome: "Dental Care",
      contato: { nome: "Dra. Camila", telefone: "5549999990002" },
      cor: "#0ea5e9",
      ig: "17841400000000002",
      page: "100000000000002",
      ads: "act_1000000000002",
    },
    {
      nome: "Laboratorio Fleming",
      contato: { nome: "Marcos", telefone: "5549999990003" },
      cor: "#059669",
      ig: "17841400000000003",
      page: "100000000000003",
      ads: null,
    },
  ];

  const criados = [];

  for (const p of pilotos) {
    const cliente = await prisma.client.create({
      data: {
        name: p.nome,
        slug: p.nome
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-"),
        notes: "Cliente do piloto.",
        contacts: {
          create: [
            {
              name: p.contato.nome,
              phoneE164: p.contato.telefone,
              isApprover: true,
              receivesReminders: true,
            },
          ],
        },
        metaConnections: {
          create: [
            {
              assetType: "INSTAGRAM",
              assetId: p.ig,
              assetName: `@${p.nome.toLowerCase().replace(/\s+/g, "")}`,
              authMode: "SYSTEM_USER",
              status: "CONECTADO",
              lastCheckedAt: new Date(),
            },
            {
              assetType: "FACEBOOK_PAGE",
              assetId: p.page,
              assetName: p.nome,
              authMode: "SYSTEM_USER",
              status: "CONECTADO",
              lastCheckedAt: new Date(),
            },
            ...(p.ads
              ? [
                  {
                    assetType: "AD_ACCOUNT" as const,
                    assetId: p.ads,
                    assetName: `Anuncios ${p.nome}`,
                    authMode: "SYSTEM_USER" as const,
                    status: "CONECTADO" as const,
                    lastCheckedAt: new Date(),
                  },
                ]
              : []),
          ],
        },
      },
      include: { contacts: true },
    });
    criados.push({ ...p, cliente });
  }

  const [danieli, dental, fleming] = criados;
  const emHoras = (h: number) => new Date(Date.now() + h * 3_600_000);

  // 1) Rascunho, ainda nao enviado ao cliente.
  const rascunho = await prisma.post.create({
    data: {
      clientId: danieli.cliente.id,
      createdById: admin.id,
      caption: "Sofa novo chegando na loja. Venha conferir!",
      format: "IMAGEM_UNICA",
      networks: ["INSTAGRAM", "FACEBOOK"],
      scheduledAt: emHoras(72),
      status: "RASCUNHO",
    },
  });
  await anexarMidia({
    postId: rascunho.id,
    clientSlug: danieli.cliente.slug,
    titulo: "Danieli Moveis",
    cor: danieli.cor,
  });

  // 2) Aguardando aprovacao, com link valido (o link aparece no console).
  const aguardando = await prisma.post.create({
    data: {
      clientId: dental.cliente.id,
      createdById: admin.id,
      caption: "Check-up odontologico com horarios na proxima semana. Agende pelo WhatsApp.",
      format: "CARROSSEL",
      networks: ["INSTAGRAM"],
      scheduledAt: emHoras(30),
      status: "AGUARDANDO_APROVACAO",
    },
  });
  await anexarMidia({
    postId: aguardando.id,
    clientSlug: dental.cliente.slug,
    titulo: "Dental Care",
    cor: dental.cor,
    posicao: 0,
  });
  await anexarMidia({
    postId: aguardando.id,
    clientSlug: dental.cliente.slug,
    titulo: "Agende agora",
    cor: "#0369a1",
    posicao: 1,
  });

  const pedidoId = randomUUID();
  const token = tokenDoPedido(pedidoId);
  await prisma.approvalRequest.create({
    data: {
      id: pedidoId,
      postId: aguardando.id,
      postVersion: 1,
      tokenHash: hashToken(token),
      status: "PENDENTE",
      channel: "LOG",
      sentAt: new Date(),
      expiresAt: emHoras(30),
    },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "post",
      entityId: aguardando.id,
      action: "pedido_de_aprovacao_enviado",
      actorType: "USUARIO",
      actorUserId: admin.id,
      actorName: admin.name,
      fromStatus: "RASCUNHO",
      toStatus: "AGUARDANDO_APROVACAO",
      metadata: { seed: true },
    },
  });

  // 3) POST SEM RESPOSTA: o horario passou sem o cliente responder.
  const semResposta = await prisma.post.create({
    data: {
      clientId: fleming.cliente.id,
      createdById: admin.id,
      caption: "Resultados de exames pelo portal do paciente.",
      format: "IMAGEM_UNICA",
      networks: ["INSTAGRAM", "FACEBOOK"],
      scheduledAt: emHoras(-26),
      status: "POST_SEM_RESPOSTA",
    },
  });
  await anexarMidia({
    postId: semResposta.id,
    clientSlug: fleming.cliente.slug,
    titulo: "Lab Fleming",
    cor: fleming.cor,
  });
  await prisma.auditLog.create({
    data: {
      entityType: "post",
      entityId: semResposta.id,
      action: "marcado_sem_resposta",
      actorType: "SISTEMA",
      actorName: "worker",
      fromStatus: "AGUARDANDO_APROVACAO",
      toStatus: "POST_SEM_RESPOSTA",
      metadata: { seed: true },
    },
  });

  // 4) Publicado (em dry-run), com aprovacao registrada.
  const publicado = await prisma.post.create({
    data: {
      clientId: danieli.cliente.id,
      createdById: admin.id,
      caption: "Promocao de mesas de jantar ate sabado.",
      format: "IMAGEM_UNICA",
      networks: ["INSTAGRAM"],
      scheduledAt: emHoras(-72),
      status: "PUBLICADO",
      approvedAt: emHoras(-80),
      publishedAt: emHoras(-72),
    },
  });
  await anexarMidia({
    postId: publicado.id,
    clientSlug: danieli.cliente.slug,
    titulo: "Mesas de jantar",
    cor: "#b45309",
  });
  const pedidoPublicado = await prisma.approvalRequest.create({
    data: {
      postId: publicado.id,
      postVersion: 1,
      tokenHash: hashToken(tokenDoPedido(randomUUID())),
      status: "DECIDIDO",
      channel: "LOG",
      sentAt: emHoras(-96),
      expiresAt: emHoras(-72),
      decidedAt: emHoras(-80),
    },
  });
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: pedidoPublicado.id,
      postId: publicado.id,
      postVersion: 1,
      decision: "APROVADO",
      approverName: "Danieli",
      ipAddress: "189.0.0.1",
      userAgent: "Mozilla/5.0 (iPhone)",
      decidedAt: emHoras(-80),
    },
  });
  await prisma.postPublication.create({
    data: {
      postId: publicado.id,
      network: "INSTAGRAM",
      externalId: "dryrun_instagram_seed0001",
      permalink: "https://exemplo.local/dry-run/seed0001",
      dryRun: true,
      publishedAt: emHoras(-72),
    },
  });

  // 5) Insights de exemplo (fase 2) para a Danieli, ultimos 30 dias.
  const campanhas = [
    { id: "23850000000000001", nome: "Institucional - Alcance" },
    { id: "23850000000000002", nome: "Promocao - Conversao" },
  ];
  for (let dia = 29; dia >= 0; dia--) {
    const data = new Date();
    data.setUTCHours(0, 0, 0, 0);
    data.setUTCDate(data.getUTCDate() - dia);
    for (const campanha of campanhas) {
      const base = campanha.id.endsWith("1") ? 18 : 42;
      const impressoes = base * 120 + dia * 7;
      const cliques = Math.round(impressoes * 0.021);
      const gasto = base + (dia % 5) * 3.5;
      await prisma.adInsightDaily.create({
        data: {
          clientId: danieli.cliente.id,
          adAccountId: danieli.ads!,
          date: data,
          campaignId: campanha.id,
          campaignName: campanha.nome,
          spend: gasto.toFixed(2),
          reach: Math.round(impressoes * 0.78),
          impressions: impressoes,
          clicks: cliques,
          ctr: Number(((cliques / impressoes) * 100).toFixed(4)),
          cpc: (gasto / Math.max(1, cliques)).toFixed(4),
          cpm: ((gasto / impressoes) * 1000).toFixed(4),
          conversions: campanha.id.endsWith("2") ? Math.round(cliques * 0.08) : 0,
          costPerResult: campanha.id.endsWith("2")
            ? (gasto / Math.max(1, Math.round(cliques * 0.08))).toFixed(4)
            : null,
          currency: "BRL",
          raw: { exemplo: true, origem: "seed de desenvolvimento" },
        },
      });
    }
  }

  console.log("\nSeed pronto.");
  console.log("-------------------------------------------------");
  console.log(`Login:  ernandeskrepka@gmail.com`);
  console.log(`Senha:  ${SENHA_PADRAO}`);
  console.log("");
  console.log("Post aguardando aprovacao (Dental Care). Link do cliente:");
  console.log(`${env.APP_URL.replace(/\/$/, "")}/aprovar/${token}`);
  console.log("-------------------------------------------------");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
