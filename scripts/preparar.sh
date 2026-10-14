#!/usr/bin/env bash
# Preparacao para testar o sistema na sua maquina.
#   bash scripts/preparar.sh
#
# O que ele faz: confere o Node, sobe Postgres e Redis (Docker, se houver),
# cria o .env com uma chave nova, instala as dependencias, cria as tabelas e
# roda o seed com os tres clientes do piloto.
set -euo pipefail

cd "$(dirname "$0")/.."
verde=$'\033[0;32m'; amarelo=$'\033[0;33m'; vermelho=$'\033[0;31m'; fim=$'\033[0m'
ok()    { echo "${verde}✓${fim} $1"; }
aviso() { echo "${amarelo}!${fim} $1"; }
erro()  { echo "${vermelho}✗${fim} $1" >&2; }

echo "=== VORA - preparacao do ambiente de teste ==="
echo

# 1. Node 22+
if ! command -v node > /dev/null; then
  erro "Node nao encontrado. Instale a versao 22 ou mais nova: https://nodejs.org"
  exit 1
fi
versao_node=$(node -p "process.versions.node.split('.')[0]")
if [ "$versao_node" -lt 22 ]; then
  erro "Node $(node -v) encontrado; o projeto precisa da versao 22 ou mais nova."
  exit 1
fi
ok "Node $(node -v)"

# 2. Banco e Redis
usar_docker=0
if command -v docker > /dev/null && docker info > /dev/null 2>&1; then
  usar_docker=1
fi

if [ "$usar_docker" -eq 1 ]; then
  echo "  subindo Postgres e Redis com Docker..."
  docker compose up -d > /dev/null
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U vora -d vora_aprovacao > /dev/null 2>&1; then break; fi
    sleep 1
  done
  ok "Postgres e Redis no ar (Docker)"
  URL_BANCO="postgresql://vora:vora@127.0.0.1:5432/vora_aprovacao?schema=public"
  URL_REDIS="redis://127.0.0.1:6379"
else
  aviso "Docker nao esta disponivel: vou usar o Postgres e o Redis que voce ja tem."
  aviso "Se eles nao estiverem rodando, ajuste DATABASE_URL e REDIS_URL no .env depois."
  URL_BANCO="${DATABASE_URL:-postgresql://postgres@127.0.0.1:5432/vora_aprovacao?schema=public}"
  URL_REDIS="${REDIS_URL:-redis://127.0.0.1:6379}"
fi

# 3. .env
if [ -f .env ]; then
  ok ".env ja existe (nao vou mexer)"
else
  chave=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  cp .env.example .env
  # Preenche o que da para preencher sozinho.
  node - "$URL_BANCO" "$URL_REDIS" "$chave" <<'NODE'
const fs = require("node:fs");
const [, , banco, redis, chave] = process.argv;
let texto = fs.readFileSync(".env", "utf8");
const trocar = (campo, valor) =>
  (texto = texto.replace(new RegExp(`^${campo}=.*$`, "m"), `${campo}="${valor}"`));
trocar("DATABASE_URL", banco);
trocar("REDIS_URL", redis);
trocar("ENCRYPTION_KEY", chave);
fs.writeFileSync(".env", texto);
NODE
  ok ".env criado, com chave de criptografia nova"
fi

# 4. Dependencias
if [ -d node_modules ]; then
  ok "dependencias ja instaladas"
else
  echo "  instalando dependencias (demora um pouco na primeira vez)..."
  npm install --no-audit --no-fund > /dev/null
  ok "dependencias instaladas"
fi

# 5. Banco
echo "  criando as tabelas..."
npm run db:push > /dev/null 2>&1 || {
  erro "Nao consegui conectar no banco. Confira o DATABASE_URL no .env e rode de novo."
  exit 1
}
ok "tabelas criadas"

echo "  populando com os clientes do piloto..."
npm run db:seed 2>&1 | tail -8
echo

cat <<'FIM'
=== Pronto. Agora abra dois terminais nesta pasta: ===

  Terminal 1:  npm run dev        (painel: http://localhost:3000)
  Terminal 2:  npm run worker     (fila: publicacao e lembretes)

Entre no painel com o login acima. O link de aprovacao impresso pelo seed e o
que o cliente receberia por WhatsApp: abra no celular para ver a tela dele.

Para ver os links em aberto a qualquer momento:
  npx tsx scripts/link-pendente.ts

Testes:
  npm test                                 (97 testes)
  npx tsx scripts/smoke-publicacao.ts      (com o worker rodando)
  npx tsx scripts/smoke-sem-resposta.ts    (com o worker rodando)

Nada e publicado na Meta e nenhuma mensagem sai: META_DRY_RUN=true e
WHATSAPP_MODE=log.
FIM
