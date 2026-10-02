
param([string]$InputPath,[string]$OutputPath,[ValidateSet('ru','en')][string]$Language)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
 $voice=$synth.GetInstalledVoices() | Where-Object {$_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $Language} | Select-Object -First 1
 if(!$voice){throw 'No local voice for selected language'}
 $synth.SelectVoice($voice.VoiceInfo.Name)
 $synth.SetOutputToWaveFile($OutputPath)
 $synth.Speak([System.IO.File]::ReadAllText($InputPath))
} finally {$synth.Dispose()}
