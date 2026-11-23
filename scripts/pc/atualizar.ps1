# Atualiza o codigo do painel VORA neste computador a partir da pasta
# "app-novo" (que vem no zip de atualizacao), preservando banco, .env e
# arquivos enviados. Uso: dois cliques em ATUALIZAR.cmd.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$raiz  = Split-Path -Parent $MyInvocation.MyCommand.Path
$fer   = Join-Path $raiz "ferramentas"
$app   = Join-Path $raiz "app"
$novo  = Join-Path $raiz "app-novo"
$logs  = Join-Path $raiz "logs"
$dados = Join-Path $raiz "dados-banco"
if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }
Start-Transcript -Path (Join-Path $logs "atualizacao.log") -Append | Out-Null
$env:Path = (Join-Path $fer "node") + ";" + $env:Path

try {

if (-not (Test-Path (Join-Path $novo "package.json"))) {
  throw "A pasta app-novo nao esta aqui do lado. Extraia o zip de atualizacao inteiro."
}
if (-not (Test-Path (Join-Path $app ".env"))) {
  throw "Nao achei app\.env - rode o INSTALAR.cmd antes de atualizar."
}

Write-Host "[1/5] Parando o site..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep 1

Write-Host "[2/5] Copiando o codigo novo (banco, .env e arquivos ficam)..." -ForegroundColor Cyan
robocopy $novo $app /MIR /XD node_modules .next .storage /XF .env /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "a copia falhou (robocopy codigo $LASTEXITCODE)" }
cmd /c "exit 0"

Write-Host "[3/5] Dependencias..." -ForegroundColor Cyan
Push-Location $app
& (Join-Path $fer "node\npm.cmd") ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci falhou" }

Write-Host "[4/5] Banco de dados..." -ForegroundColor Cyan
$pgctl = Join-Path $fer "pgsql\bin\pg_ctl.exe"
& $pgctl status -D $dados *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgctl -D $dados -o "-p 5433 -c listen_addresses=127.0.0.1" -l (Join-Path $logs "postgres.log") start -w
}
$env:DATABASE_URL = ([regex]::Match((Get-Content ".env" -Raw), "(?m)^DATABASE_URL=(.+)$")).Groups[1].Value.Trim()
& (Join-Path $fer "node\npx.cmd") prisma db push
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "prisma db push falhou" }

Write-Host "[5/5] Compilando (alguns minutos)..." -ForegroundColor Cyan
& (Join-Path $fer "node\npm.cmd") run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "o build falhou" }
Pop-Location

Write-Host ""
Write-Host "Atualizado! Subindo o site..." -ForegroundColor Green
& (Join-Path $raiz "iniciar.ps1")

} catch {
  Write-Host ""
  Write-Host ("DEU ERRADO: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "Me mande o arquivo logs\atualizacao.log que eu conserto." -ForegroundColor Yellow
} finally {
  Stop-Transcript | Out-Null
}
Read-Host "Aperte Enter para fechar"
