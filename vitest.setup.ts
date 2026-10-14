// Valores de ambiente para os testes. Nenhum teste toca banco, Redis,
// Meta ou WhatsApp de verdade.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres@127.0.0.1:5432/vora_aprovacao_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.APP_URL ??= "http://localhost:3000";
process.env.APP_TIMEZONE ??= "America/Sao_Paulo";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.META_DRY_RUN ??= "true";
process.env.WHATSAPP_MODE ??= "log";
process.env.STORAGE_LOCAL_DIR ??= "./.storage-test";
process.env.INTERNAL_NOTIFY_CHANNEL ??= "log";
