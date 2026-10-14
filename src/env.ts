import { z } from "zod";

/**
 * Validacao das variaveis de ambiente. Falha rapido no boot em vez de
 * quebrar no meio de uma publicacao.
 */
const booleanish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  // "bullmq" usa Redis e um worker dedicado (producao normal).
  // "none" nao agenda nada: quem dispara e a rotina de agenda, chamada por
  // um cron externo. E o modo usado em hospedagem sem processo continuo.
  QUEUE_DRIVER: z.enum(["bullmq", "none"]).default("bullmq"),

  // Base publica usada nos links de aprovacao enviados por WhatsApp.
  APP_URL: z.string().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("America/Sao_Paulo"),

  // 32 bytes em base64: usada para cifrar tokens da Meta (AES-256-GCM).
  ENCRYPTION_KEY: z.string().min(1).optional(),

  // Armazenamento dos criativos.
  STORAGE_DRIVER: z.enum(["local", "s3", "netlify"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Meta.
  META_GRAPH_VERSION: z.string().default("v26.0"),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // Com dry-run ligado, nada e enviado para a Meta: o worker simula a
  // publicacao e grava a tentativa normalmente.
  META_DRY_RUN: booleanish.default(true),
  META_IG_DAILY_LIMIT: z.coerce.number().int().positive().default(100),

  // WhatsApp Cloud API. Em "log" as mensagens so vao para o banco e para o log.
  WHATSAPP_MODE: z.enum(["log", "cloud_api"]).default("log"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_LANGUAGE: z.string().default("pt_BR"),
  WHATSAPP_TEMPLATE_APPROVAL: z.string().default("vora_aprovacao_pendente"),
  WHATSAPP_TEMPLATE_REMINDER: z.string().default("vora_aprovacao_lembrete"),
  WHATSAPP_TEMPLATE_PUBLISHED: z.string().default("vora_post_publicado"),

  // Notificacao interna da equipe.
  INTERNAL_NOTIFY_CHANNEL: z.enum(["log", "whatsapp", "slack"]).default("log"),
  INTERNAL_NOTIFY_WHATSAPP_TO: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),

  // Regras operacionais.
  APPROVAL_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(336),
  REMINDER_OFFSETS_HOURS: z.string().default("24,2"),
  PUBLISH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  SENTRY_DSN: z.string().optional(),

  // Protege a rota que dispara a agenda quando nao ha worker.
  AGENDA_TOKEN: z.string().optional(),
});

/**
 * Na Netlify o banco e provisionado pela plataforma e chega em NETLIFY_DB_URL.
 * Em qualquer outra hospedagem vale o DATABASE_URL normal.
 */
const bruto = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || process.env.NETLIFY_DB_URL,
};

const parsed = schema.safeParse(bruto);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Variaveis de ambiente invalidas:\n${issues}`);
}

export const env = parsed.data;

export const reminderOffsetsHours: number[] = env.REMINDER_OFFSETS_HOURS.split(",")
  .map((p) => Number(p.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => b - a);
