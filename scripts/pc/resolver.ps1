# Conserta o acesso ao painel VORA neste computador, de ponta a ponta:
# sobe o banco, confere e conserta usuario/senha, reinicia o site e o
# endereco publico, e mostra o login pronto. Uso: dois cliques em RESOLVER.cmd.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$raiz  = Split-Path -Parent $MyInvocation.MyCommand.Path
$fer   = Join-Path $raiz "ferramentas"
$app   = Join-Path $raiz "app"
$logs  = Join-Path $raiz "logs"
$dados = Join-Path $raiz "dados-banco"
if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }
Start-Transcript -Path (Join-Path $logs "resolver.log") -Append | Out-Null
$env:Path = (Join-Path $fer "node") + ";" + $env:Path
function Titulo($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }

try {

if (-not (Test-Path (Join-Path $app ".env"))) {
  throw "Nao achei app\.env - rode o INSTALAR.cmd primeiro."
}

# ------------------------------------------------------------- 1. Banco
Titulo "Banco de dados"
$pgctl = Join-Path $fer "pgsql\bin\pg_ctl.exe"
& $pgctl status -D $dados *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgctl -D $dados -o "-p 5433 -c listen_addresses=127.0.0.1" -l (Join-Path $logs "postgres.log") start -w
}
& $pgctl status -D $dados *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  O PostgreSQL nao esta subindo. Fim do log dele:" -ForegroundColor Red
  if (Test-Path (Join-Path $logs "postgres.log")) { Get-Content (Join-Path $logs "postgres.log") -Tail 15 }
  throw "o banco nao sobe"
}
Write-Host "  OK: PostgreSQL rodando na porta 5433" -ForegroundColor Green

# ------------------------------------------- 2. Usuario e senha no banco
Titulo "Usuario e senha"
Push-Location $app
& (Join-Path $fer "node\node.exe") (Join-Path $raiz "conserta-login.cjs")
$codigo = $LASTEXITCODE
Pop-Location
if ($codigo -eq 1) { throw "o app nao conseguiu falar com o banco" }
if ($codigo -eq 2) { throw "app\.env sem ADMIN_EMAIL/ADMIN_SENHA/DATABASE_URL" }

# --------------------------- 3. Site e endereco publico (reinicia tudo)
Titulo "Site e endereco publico (ate 1 minuto)"
& (Join-Path $raiz "iniciar.ps1") -Invisivel

# ------ 4. Usuario ainda nao existia: a tela de login cria; conserta apos
if ($codigo -eq 3) {
  Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000/login" -TimeoutSec 20 | Out-Null
  Push-Location $app
  & (Join-Path $fer "node\node.exe") (Join-Path $raiz "conserta-login.cjs")
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "o primeiro usuario nao foi criado" }
  Pop-Location
}

# ------------------------------------------------------------- 5. Pronto
Titulo "PRONTO - use estes dados"
Get-Content (Join-Path $raiz "resumo-instalacao.txt")
$urlFinal = ([regex]::Match((Get-Content (Join-Path $app ".env") -Raw), "(?m)^APP_URL=(.+)$")).Groups[1].Value.Trim()
if ($urlFinal) { Start-Process $urlFinal }

} catch {
  Write-Host ""
  Write-Host ("DEU ERRADO: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "Me mande o arquivo logs\resolver.log que eu conserto." -ForegroundColor Yellow
} finally {
  Stop-Transcript | Out-Null
}
Read-Host "Aperte Enter para fechar"
