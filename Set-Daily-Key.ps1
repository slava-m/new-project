$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$secret=Read-Host 'Twelve Data API key (hidden; do not send it to chat)' -AsSecureString
$secretPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {$apiKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer);if([string]::IsNullOrWhiteSpace($apiKey)){throw 'Empty key'};[Environment]::SetEnvironmentVariable('TWELVEDATA_API_KEY',$apiKey,'User');$env:TWELVEDATA_API_KEY=$apiKey}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)}
Write-Host 'Saved locally. This key is sent only to Twelve Data for market-data requests, never to the model or browser.'
$listener=Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue
if($listener){$panelProcessId=$listener.OwningProcess;$info=Get-CimInstance Win32_Process -Filter "ProcessId = $panelProcessId";if($info.Name -eq 'node.exe' -and $info.CommandLine -match 'server\.mjs'){Stop-Process -Id $panelProcessId}else{throw 'Port 8787 is used by another app'}}
& (Join-Path $PSScriptRoot 'Start.ps1')
