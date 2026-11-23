# Para o site, o tunel, a agenda e o banco (nesta ordem).
$raiz  = Split-Path -Parent $MyInvocation.MyCommand.Path
$pids  = Join-Path $raiz "pids"
$dados = Join-Path $raiz "dados-banco"

$web = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($web) { $web | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }

foreach ($nome in @("agenda", "tunel")) {
  $arq = Join-Path $pids "$nome.pid"
  if (Test-Path $arq) {
    Stop-Process -Id (Get-Content $arq | Select-Object -First 1) -Force -ErrorAction SilentlyContinue
    Remove-Item $arq
  }
}

& (Join-Path $raiz "ferramentas\pgsql\bin\pg_ctl.exe") -D $dados stop -m fast
Write-Host "Tudo parado."
