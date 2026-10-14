type Level = "debug" | "info" | "warn" | "error";

const REDACTED_KEYS = [
  "token",
  "access_token",
  "accessToken",
  "password",
  "passwordHash",
  "tokenCiphertext",
  "authorization",
  "secret",
];

/** Remove segredos de qualquer objeto antes de ir para o log. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.some((r) => k.toLowerCase().includes(r.toLowerCase()))
        ? "[oculto]"
        : redact(v);
    }
    return out;
  }
  return value;
}

function write(level: Level, scope: string, message: string, meta?: unknown) {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta !== undefined ? { meta: redact(meta) } : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export function logger(scope: string) {
  return {
    debug: (m: string, meta?: unknown) => write("debug", scope, m, meta),
    info: (m: string, meta?: unknown) => write("info", scope, m, meta),
    warn: (m: string, meta?: unknown) => write("warn", scope, m, meta),
    error: (m: string, meta?: unknown) => write("error", scope, m, meta),
  };
}
