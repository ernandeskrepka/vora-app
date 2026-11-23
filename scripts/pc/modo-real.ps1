# Liga o modo real do painel VORA neste computador:
# - publicacao de verdade no Instagram/Facebook (desliga o dry-run)
# - token do Notion (sincroniza planejamento e tarefas)
# - token do System User da Meta (opcional; da para colar por cliente na
#   tela Conexoes do painel, que guarda cifrado no banco)
# Os tokens ficam apenas no app\.env DESTE computador.
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$envArq = Join-Path $raiz "app\.env"
if (-not (Test-Path $envArq)) {
  Write-Host "Nao achei app\.env - rode o INSTALAR.cmd antes." -ForegroundColor Red
  Read-Host "Aperte Enter para fechar"
  exit 1
}

function DefinirChave($texto, $chave, $valor) {
  if ($texto -match "(?m)^$chave=") {
    return [regex]::Replace($texto, "(?m)^$chave=.*$", "$chave=$valor")
  }
  return $texto.TrimEnd() + "`n" + "$chave=$valor" + "`n"
}

$texto = Get-Content $envArq -Raw

Write-Host ""
Write-Host "== Publicacao real na Meta ==" -ForegroundColor Cyan
Write-Host "Ligada, post APROVADO sai de verdade no Instagram/Facebook no horario."
Write-Host "Sem aprovacao registrada, nada sai - essa regra continua valendo."
$resp = Read-Host "Ligar publicacao real agora? (s/n)"
if ($resp -match "^[sS]") {
  $texto = DefinirChave $texto "META_DRY_RUN" "false"
  Write-Host "  OK: publicacao real LIGADA." -ForegroundColor Green
} else {
  Write-Host "  Mantida em modo de teste (nada sai para a Meta)."
}

Write-Host ""
Write-Host "== Token do Notion ==" -ForegroundColor Cyan
Write-Host "Crie em notion.so/my-integrations (integracao interna) e compartilhe"
Write-Host "as paginas de planejamento e o quadro de tarefas com a integracao."
$token = Read-Host "Cole o token do Notion (Enter para pular)"
if ($token) {
  $texto = DefinirChave $texto "NOTION_TOKEN" $token.Trim()
  Write-Host "  OK: salvo no .env (so neste computador)." -ForegroundColor Green
}

Write-Host ""
Write-Host "== Token do System User da Meta (opcional) ==" -ForegroundColor Cyan
Write-Host "Business Manager > Usuarios do sistema > gerar token com:"
Write-Host "pages_manage_posts, pages_read_engagement, instagram_basic,"
Write-Host "instagram_content_publish, business_management."
Write-Host "(Alternativa: colar o token por cliente na tela Conexoes do painel.)"
$meta = Read-Host "Cole o token do System User (Enter para pular)"
if ($meta) {
  $texto = DefinirChave $texto "META_SYSTEM_USER_TOKEN" $meta.Trim()
  Write-Host "  OK: salvo no .env (so neste computador)." -ForegroundColor Green
}

[IO.File]::WriteAllText($envArq, $texto, [Text.Encoding]::ASCII)

Write-Host ""
Write-Host "Reiniciando o site para as chaves valerem..." -ForegroundColor Cyan
& (Join-Path $raiz "iniciar.ps1")
Read-Host "Aperte Enter para fechar"
