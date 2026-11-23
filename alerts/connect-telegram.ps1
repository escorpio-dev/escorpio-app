# Connects the deployed escorpio-alerts Worker to the Telegram bot. Run it yourself, once (PowerShell, from alerts\):
#   & .\connect-telegram.ps1
# It asks for the bot token (hidden), makes a random webhook secret, stores both as Worker secrets through a temporary
# file that is deleted right after, and points the bot's webhook at https://alerts.escorpio.pro/telegram.
# Neither value is printed or written anywhere else.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$secure = Read-Host -AsSecureString 'Paste the bot token from BotFather'
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($token -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') { throw 'That does not look like a bot token (it should look like 123456:ABC...).' }

$me = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getMe"
Write-Host "Bot found: @$($me.result.username)"

$chars = [char[]](48..57 + 65..90 + 97..122)
$secret = -join (1..48 | ForEach-Object { $chars | Get-Random })

$tmp = Join-Path $env:TEMP ("escorpio-secrets-" + [guid]::NewGuid().ToString() + '.json')
try {
  @{ TELEGRAM_BOT_TOKEN = $token; TELEGRAM_WEBHOOK_SECRET = $secret } | ConvertTo-Json | Set-Content -Path $tmp -Encoding Ascii
  npx wrangler secret bulk $tmp
  if ($LASTEXITCODE -ne 0) { throw 'wrangler secret bulk failed' }
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}

$hook = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -Body @{
  url = 'https://alerts.escorpio.pro/telegram'
  secret_token = $secret
  allowed_updates = '["message"]'
  drop_pending_updates = 'true'
}
Write-Host ("Webhook set: " + $hook.ok + " " + $hook.description)
$token = $null; $secret = $null
Write-Host "Done. Open @$($me.result.username) in Telegram and send /start."
