// Confere e conserta o login do painel direto no banco local.
// Rodado pelo resolver.ps1 com a pasta "app" como diretorio atual.
// - Mostra quantos usuarios existem.
// - Se o usuario do ADMIN_EMAIL existir mas a senha gravada nao for a do
//   .env, regrava o hash (mesmo formato do src/lib/crypto.ts: scrypt).
// - Nao cria usuario: isso e papel do primeiro acesso, na tela de login.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const requireDoApp = createRequire(path.join(process.cwd(), "package.json"));
const { Client } = requireDoApp("pg");

const envTexto = fs.readFileSync(".env", "utf8");
const pega = (chave) => {
  const m = envTexto.match(new RegExp("^" + chave + "=(.*)$", "m"));
  return m ? m[1].trim() : "";
};

const email = pega("ADMIN_EMAIL").toLowerCase();
const senha = pega("ADMIN_SENHA");
const url = pega("DATABASE_URL");
if (!email || !senha || !url) {
  console.log("ERRO: .env sem ADMIN_EMAIL, ADMIN_SENHA ou DATABASE_URL");
  process.exit(2);
}

function senhaConfere(s, guardado) {
  const [algo, saltB64, hashB64] = String(guardado || "").split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = crypto.scryptSync(s, Buffer.from(saltB64, "base64"), esperado.length);
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}
function hashSenha(s) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(s, salt, 64);
  return "scrypt$" + salt.toString("base64") + "$" + hash.toString("base64");
}

(async () => {
  const banco = new Client({ connectionString: url });
  await banco.connect();
  try {
    const total = await banco.query('SELECT count(*)::int AS n FROM "User"');
    console.log("usuarios no banco: " + total.rows[0].n);

    const r = await banco.query(
      'SELECT id, "passwordHash", active FROM "User" WHERE email = $1',
      [email]
    );
    if (r.rows.length === 0) {
      console.log("usuario " + email + ": AINDA NAO EXISTE (sera criado ao abrir a tela de login)");
      process.exit(3);
    }
    const u = r.rows[0];
    if (!u.active) {
      await banco.query('UPDATE "User" SET active = true WHERE id = $1', [u.id]);
      console.log("usuario reativado");
    }
    if (senhaConfere(senha, u.passwordHash)) {
      console.log("senha do .env CONFERE com o banco: login pronto");
    } else {
      await banco.query('UPDATE "User" SET "passwordHash" = $1 WHERE id = $2', [
        hashSenha(senha),
        u.id,
      ]);
      console.log("senha do banco estava diferente: REGRAVADA com a senha do .env");
    }
    process.exit(0);
  } finally {
    await banco.end();
  }
})().catch((erro) => {
  console.log("ERRO ao falar com o banco: " + (erro && erro.message ? erro.message : erro));
  process.exit(1);
});
