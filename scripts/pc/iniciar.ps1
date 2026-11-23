# Sobe o sistema VORA neste computador: banco, site, endereco publico e a
# agenda (que publica no horario e corta post sem resposta).
# Rodado pelo instalador, pelo atalho de inicializacao do Windows e a mao.
param([switch]$Invisivel)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz  = Split-Path -Parent $MyInvocation.MyCommand.Path
$fer   = Join-Path $raiz "ferramentas"
$app   = Join-Path $raiz "app"
$logs  = Join-Path $raiz "logs"
$pids  = Join-Path $raiz "pids"
$dados = Join-Path $raiz "dados-banco"
foreach ($d in @($logs, $pids)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }
$env:Path = (Join-Path $fer "node") + ";" + $env:Path

function Vivo($arquivoPid) {
  if (-not (Test-Path $arquivoPid)) { return $false }
  $numero = Get-Content $arquivoPid | Select-Object -First 1
  return [bool](Get-Process -Id $numero -ErrorAction SilentlyContinue)
}

# 1. Banco
$pgctl = Join-Path $fer "pgsql\bin\pg_ctl.exe"
& $pgctl status -D $dados *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgctl -D $dados -o "-p 5433 -c listen_addresses=127.0.0.1" -l (Join-Path $logs "postgres.log") start -w
  if ($LASTEXITCODE -ne 0) { throw "O PostgreSQL nao subiu; veja logs\postgres.log." }
}

# 2. Endereco publico (Cloudflare Tunnel). Sem conta: o endereco muda a cada
#    inicio - os links ja enviados por WhatsApp apontam para o endereco antigo.
$tunelLog = Join-Path $logs "tunel.log"
$urlTunel = $null
if (Vivo (Join-Path $pids "tunel.pid")) {
  if (Test-Path $tunelLog) {
    $urlTunel = ([regex]::Matches((Get-Content $tunelLog -Raw), "https://[a-z0-9-]+\.trycloudflare\.com") | Select-Object -Last 1).Value
  }
} else {
  if (Test-Path $tunelLog) { Remove-Item $tunelLog }
  $p = Start-Process -FilePath (Join-Path $fer "cloudflared.exe") `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:3000", "--no-autoupdate", "--logfile", $tunelLog `
    -WindowStyle Hidden -PassThru
  $p.Id | Out-File (Join-Path $pids "tunel.pid") -Encoding ascii
  foreach ($tentativa in 1..45) {
    Start-Sleep 2
    if (Test-Path $tunelLog) {
      $urlTunel = ([regex]::Matches((Get-Content $tunelLog -Raw), "https://[a-z0-9-]+\.trycloudflare\.com") | Select-Object -Last 1).Value
      if ($urlTunel) { break }
    }
  }
}

# 3. APP_URL entra nos links que o cliente recebe: precisa ser o endereco publico.
$envArq = Join-Path $app ".env"
$urlFinal = if ($urlTunel) { $urlTunel } else { "http://127.0.0.1:3000" }
$conteudo = Get-Content $envArq -Raw
$conteudo = [regex]::Replace($conteudo, "(?m)^APP_URL=.*$", "APP_URL=$urlFinal")
[IO.File]::WriteAllText($envArq, $conteudo, [Text.Encoding]::ASCII)

# 4. Site (se a porta 3000 ja responde, aproveita o que esta rodando)
$jaRodando = [bool](Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
if (-not $jaRodando) {
  $npx = Join-Path $fer "node\npx.cmd"
  $webLog = Join-Path $logs "site.log"
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `
    "& { `$env:Path = '$($fer)\node;' + `$env:Path; Set-Location '$app'; & '$npx' next start -H 127.0.0.1 -p 3000 *>> '$webLog' }" | Out-Null
}

# 5. Agenda de minuto em minuto
if (-not (Vivo (Join-Path $pids "agenda.pid"))) {
  $token = ([regex]::Match((Get-Content $envArq -Raw), "(?m)^AGENDA_TOKEN=(.+)$")).Groups[1].Value.Trim()
  $p = Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -PassThru -ArgumentList `
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $raiz "agenda-loop.ps1"), "-Url", "http://127.0.0.1:3000", "-Token", $token
  $p.Id | Out-File (Join-Path $pids "agenda.pid") -Encoding ascii
}

# 6. Espera o site responder
$noAr = $false
foreach ($tentativa in 1..60) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000/login" -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $noAr = $true; break }
  } catch { Start-Sleep 3 }
}

# 7. Resumo
$resumo = Join-Path $raiz "resumo-instalacao.txt"
$linhas = @()
if (Test-Path $resumo) { $linhas = @(Get-Content $resumo | Where-Object { $_ -notmatch "^Endereco" }) }
$linhas += "Endereco em $(Get-Date -Format 'dd/MM HH:mm'): $urlFinal"
[IO.File]::WriteAllLines($resumo, $linhas, [Text.Encoding]::ASCII)

if (-not $Invisivel) {
  Write-Host ""
  if ($noAr) { Write-Host "NO AR!" -ForegroundColor Green } else { Write-Host "O site nao respondeu ainda; veja logs\site.log" -ForegroundColor Yellow }
  Write-Host ("  endereco publico: " + $urlFinal)
  Write-Host  "  login e senha:    resumo-instalacao.txt (aqui na pasta)"
  if (-not $urlTunel) { Write-Host "  (sem tunel agora: so funciona neste computador)" -ForegroundColor Yellow }
  if ($noAr) { Start-Process $urlFinal }
}
