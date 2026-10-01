$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 24 or newer' }
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_HOST = '127.0.0.1:11434'
$ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
$listener = Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue
if (!$listener -and (Test-Path -LiteralPath $ollamaPath)) {
    Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'ollama.log') -RedirectStandardError (Join-Path $PSScriptRoot 'ollama-error.log')
}
Write-Host 'Open http://127.0.0.1:8787 ; Stop panel: Ctrl+C'
& $nodePath server.mjs
