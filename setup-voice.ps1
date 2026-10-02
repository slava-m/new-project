
param([Parameter(Mandatory=$true)][string]$PythonPath)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
& $PythonPath -m venv data\voice-env
if($LASTEXITCODE -ne 0){throw 'Cannot create Python environment'}
& .\data\voice-env\Scripts\python.exe -m pip install -r voice-requirements.txt
if($LASTEXITCODE -ne 0){throw 'Cannot install voice dependencies'}
& .\data\voice-env\Scripts\python.exe -c "from faster_whisper.utils import download_model; download_model('small', output_dir='data/voice-model', revision='536b0662742c02347bc0e980a01041f333bce120')"
if($LASTEXITCODE -ne 0){throw 'Cannot download voice model'}
