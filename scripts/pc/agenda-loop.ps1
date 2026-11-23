# Substitui o worker no PC: chama a rota da agenda de minuto em minuto
# (publicar no horario, POST SEM RESPOSTA, lembretes, releitura do Notion).
param([string]$Url, [string]$Token)
while ($true) {
  try {
    Invoke-RestMethod -Method Post -Uri "$Url/api/agenda" -Headers @{ "x-agenda-token" = $Token } -TimeoutSec 55 | Out-Null
  } catch { }
  Start-Sleep -Seconds 60
}
