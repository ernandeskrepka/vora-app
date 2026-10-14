import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/env";

/* ------------------------------------------------------------ segredos */

const ALGO = "aes-256-gcm";

function chave(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY nao configurada. Gere com: openssl rand -base64 32",
    );
  }
  const buf = Buffer.from(env.ENCRYPTION_KEY, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY deve ter 32 bytes em base64 (openssl rand -base64 32).");
  }
  return buf;
}

/**
 * Cifra um segredo (token da Meta, por exemplo) para guardar no banco.
 * Formato: v1.<iv>.<tag>.<conteudo>, tudo em base64.
 */
export function cifrarSegredo(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, chave(), iv);
  const ct = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decifrarSegredo(valor: string): string {
  const [versao, ivB64, tagB64, ctB64] = valor.split(".");
  if (versao !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Segredo cifrado em formato invalido.");
  }
  const decipher = createDecipheriv(ALGO, chave(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/* ------------------------------------------------------------- tokens */

/**
 * Token aleatorio para link publico. 32 bytes = 256 bits.
 * O valor puro so existe na URL enviada ao cliente; no banco fica o hash.
 */
export function gerarToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Token do link de aprovacao derivado do id do pedido.
 *
 * Por que derivar em vez de sortear: o banco guarda apenas o hash do token
 * (regra do projeto), e os lembretes precisam reenviar o MESMO link, sem
 * quebrar a mensagem que o cliente ja recebeu. Derivando por HMAC com a
 * chave do servidor, o token continua imprevisivel (32 bytes), unico por
 * pedido, e pode ser recalculado quando preciso.
 *
 * Consequencia operacional: trocar ENCRYPTION_KEY invalida os links de
 * aprovacao que estiverem em aberto (esta no README).
 */
export function tokenDoPedido(pedidoId: string): string {
  const segredo = chave();
  return createHmac("sha256", segredo).update(`aprovacao:v1:${pedidoId}`).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenConfere(token: string, hashGuardado: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hashGuardado, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------- senhas */

const SCRYPT_KEYLEN = 64;

export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function senhaConfere(senha: string, guardado: string): boolean {
  const [algo, saltB64, hashB64] = guardado.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = scryptSync(senha, Buffer.from(saltB64, "base64"), esperado.length);
  return timingSafeEqual(esperado, calculado);
}
