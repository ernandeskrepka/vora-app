# Instalador do sistema VORA no Windows, sem precisar de administrador.
# Baixa Node e PostgreSQL portateis, monta o banco, compila o app e sobe
# o site com um endereco publico de teste (Cloudflare Tunnel).
#
# Uso: dois cliques em INSTALAR.cmd (ou: powershell -ExecutionPolicy Bypass -File instalar.ps1)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$fer  = Join-Path $raiz "ferramentas"
$app  = Join-Path $raiz "app"
$logs = Join-Path $raiz "logs"
foreach ($d in @($fer, $logs, (Join-Path $raiz "pids"))) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}
Start-Transcript -Path (Join-Path $logs "instalacao.log") -Append | Out-Null

function Passo($n, $texto) { Write-Host ""; Write-Host "[$n/8] $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "  OK: $texto" -ForegroundColor Green }

function ChaveAleatoria($bytes) {
  $b = New-Object byte[] $bytes
  (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
  return [Convert]::ToBase64String($b)
}
function HexAleatorio($bytes) {
  $b = New-Object byte[] $bytes
  (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
  return (($b | ForEach-Object { $_.ToString("x2") }) -join "")
}

try {

if (-not (Test-Path (Join-Path $app "package.json"))) {
  throw "A pasta 'app' nao esta aqui do lado. Extraia o zip inteiro antes de rodar."
}

# ------------------------------------------------------------- 1. Node
Passo 1 "Node.js 22 portatil"
$nodeDir = Join-Path $fer "node"
if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
  $lista = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v22.x/").Content
  $zipNome = [regex]::Match($lista, "node-v[\d\.]+-win-x64\.zip").Value
  if (-not $zipNome) { throw "Nao achei o zip do Node na pagina nodejs.org." }
  $zip = Join-Path $fer $zipNome
  Write-Host "  baixando $zipNome..."
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v22.x/$zipNome" -OutFile $zip
  $extraido = Join-Path $fer ($zipNome -replace "\.zip$", "")
  if (Test-Path $extraido) { Remove-Item $extraido -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $fer -Force
  Rename-Item -Path $extraido -NewName "node"
  Remove-Item $zip
}
$env:Path = "$nodeDir;" + $env:Path
Ok ("node " + (& (Join-Path $nodeDir "node.exe") --version))

# --------------------------------------------------------- 2. PostgreSQL
Passo 2 "PostgreSQL 17 portatil"
$pgDir = Join-Path $fer "pgsql"
if (-not (Test-Path (Join-Path $pgDir "bin\initdb.exe"))) {
  $tmp = Join-Path $fer "tmp-pg"
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Push-Location $tmp
  Write-Host "  baixando os binarios do PostgreSQL (uns 40 MB)..."
  & (Join-Path $nodeDir "npm.cmd") pack "@embedded-postgres/windows-x64@17.12.0-beta.19" --silent *>> (Join-Path $logs "pg-download.log")
  $tgz = Get-ChildItem -Filter "*.tgz" | Select-Object -First 1
  if (-not $tgz) { throw "O download do PostgreSQL via npm falhou. Veja logs\pg-download.log." }
  & "$env:windir\System32\tar.exe" -xzf $tgz.FullName
  Pop-Location
  Move-Item (Join-Path $tmp "package\native") $pgDir
  Remove-Item $tmp -Recurse -Force
}
Ok "binarios em ferramentas\pgsql"

# ------------------------------------------------------- 3. Banco de dados
Passo 3 "Banco de dados local"
$dados = Join-Path $raiz "dados-banco"
$pgctl = Join-Path $pgDir "bin\pg_ctl.exe"
if (-not (Test-Path (Join-Path $dados "PG_VERSION"))) {
  & (Join-Path $pgDir "bin\initdb.exe") -D $dados -U postgres -A trust -E UTF8 --no-locale *>> (Join-Path $logs "banco-criacao.log")
  if ($LASTEXITCODE -ne 0) { throw "initdb falhou. Veja logs\banco-criacao.log." }
}
& $pgctl status -D $dados *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgctl -D $dados -o "-p 5433 -c listen_addresses=127.0.0.1" -l (Join-Path $logs "postgres.log") start -w
  if ($LASTEXITCODE -ne 0) { throw "O PostgreSQL nao subiu. Veja logs\postgres.log." }
}
Ok "PostgreSQL rodando em 127.0.0.1:5433 (so neste computador)"

# ------------------------------------------------------------ 4. Configuracao
Passo 4 "Arquivo de configuracao (.env)"
$envArq = Join-Path $app ".env"
$resumo = Join-Path $raiz "resumo-instalacao.txt"
if (-not (Test-Path $envArq)) {
  $senhaAdmin = "vora-" + (HexAleatorio 4) + "-pc"
  $conteudo = @(
    "NODE_ENV=production",
    "DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres",
    "QUEUE_DRIVER=none",
    "STORAGE_DRIVER=local",
    "STORAGE_LOCAL_DIR=./.storage",
    "META_DRY_RUN=true",
    "WHATSAPP_MODE=log",
    "INTERNAL_NOTIFY_CHANNEL=log",
    "APP_URL=http://127.0.0.1:3000",
    "APP_TIMEZONE=America/Sao_Paulo",
    ("ENCRYPTION_KEY=" + (ChaveAleatoria 32)),
    ("AGENDA_TOKEN=" + (HexAleatorio 24)),
    "ADMIN_EMAIL=ernandeskrepka@gmail.com",
    ("ADMIN_SENHA=" + $senhaAdmin)
  ) -join "`n"
  [IO.File]::WriteAllText($envArq, $conteudo + "`n", [Text.Encoding]::ASCII)
  [IO.File]::WriteAllText($resumo, @(
    "VORA - instalado em $(Get-Date)",
    "",
    "Login do painel:",
    "  e-mail: ernandeskrepka@gmail.com",
    "  senha:  $senhaAdmin",
    "",
    "Troque a senha em Configuracoes depois de entrar.",
    "O endereco publico aparece aqui embaixo a cada inicio."
  ) -join "`r`n", [Text.Encoding]::ASCII)
  Ok "chaves novas geradas; login salvo em resumo-instalacao.txt"
} else {
  Ok ".env ja existia (mantive)"
}

# ------------------------------------------------------------ 5. Dependencias
Passo 5 "Dependencias do app (alguns minutos na primeira vez)"
Push-Location $app
& (Join-Path $nodeDir "npm.cmd") ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci falhou." }
Pop-Location
Ok "dependencias instaladas"

# ------------------------------------------------------------ 6. Tabelas
Passo 6 "Tabelas do banco"
Push-Location $app
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5433/postgres"
& (Join-Path $nodeDir "npx.cmd") prisma db push
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "prisma db push falhou." }
Pop-Location
Ok "tabelas criadas/atualizadas"

# ------------------------------------------------------------ 7. Build
Passo 7 "Compilando o site (alguns minutos)"
Push-Location $app
& (Join-Path $nodeDir "npm.cmd") run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm run build falhou." }
Pop-Location
Ok "build pronto"

# --------------------------------------------------- 8. Tunel + inicio
Passo 8 "Endereco publico e inicio automatico"
$cf = Join-Path $fer "cloudflared.exe"
if (-not (Test-Path $cf)) {
  Write-Host "  baixando cloudflared..."
  Invoke-WebRequest -UseBasicParsing "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf
}
$inicio = [Environment]::GetFolderPath("Startup")
$atalho = Join-Path $inicio "VORA servidor.cmd"
$linha = "@powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$raiz\iniciar.ps1`" -Invisivel"
[IO.File]::WriteAllText($atalho, $linha + "`r`n", [Text.Encoding]::ASCII)
Ok "entra no ar sozinho quando voce ligar o computador"

& (Join-Path $raiz "iniciar.ps1")

} catch {
  Write-Host ""
  Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "O detalhe esta em logs\instalacao.log. Me mande esse arquivo no chat que eu arrumo." -ForegroundColor Yellow
  Stop-Transcript | Out-Null
  exit 1
}
Stop-Transcript | Out-Null
