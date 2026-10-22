param([ValidateRange(1,2)][int]$Attempt=1)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$source=Join-Path $root '.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61/source'
$prefix=Join-Path $PSScriptRoot ('d-prune-identity-controls-20261021'+$(if($Attempt -eq 2){'-r2'}else{''}))
if(Test-Path -LiteralPath ($prefix+'.json')){throw 'Control evidence exists'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifestName=if($Attempt -eq 2){'d-prune-identity-20261021-r1-controller-source.json'}else{'d-prune-identity-20261021-r1-full-source.json'}
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot $manifestName)|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$steps=@(
 @{name='inventory';exe='C:/Program Files/nodejs/node.exe';args=@('scripts/system-backup-schema-inventory.mjs','--check');expected=0},
 @{name='contract';exe='C:/Program Files/nodejs/node.exe';args=@('scripts/system-backup-contract-check.mjs','--check');expected=0},
 @{name='strict';exe='C:/Program Files/nodejs/node.exe';args=@('scripts/system-backup-contract-check.mjs','--check','--strict');expected=1},
 @{name='mfa-inputs';exe='C:/Program Files/nodejs/node.exe';args=@('scripts/system-backup-a-download-mfa-inputs.mjs');expected=0},
 @{name='producer-inputs';exe='C:/Program Files/nodejs/node.exe';args=@('scripts/system-backup-d-download-producer-inputs.mjs');expected=0}
)
foreach($version in @(@{name='ps5';exe='C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'},@{name='ps7';exe='C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'})){
 foreach($profile in @('gc-task','producer')){
  $steps+=@{name=($version.name+'-'+$profile);exe=$version.exe;args=@('-NoProfile','-File',('scripts/system-backup-d-download-'+$profile+'-dispatch.test.ps1'));expected=0}
 }
}
$results=@();$ok=$false
Push-Location $source
try{
 foreach($step in $steps){
  $stdout=$prefix+'-'+$step.name+'.stdout';$stderr=$prefix+'-'+$step.name+'.stderr'
  if((Test-Path -LiteralPath $stdout) -or (Test-Path -LiteralPath $stderr)){throw 'Control stage exists'}
  & $step.exe @($step.args) 1>$stdout 2>$stderr
  $actual=$LASTEXITCODE;$results+=@{name=$step.name;exit=$actual;expected=$step.expected;stdout_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $stdout).Hash.ToLowerInvariant();stderr_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $stderr).Hash.ToLowerInvariant()}
  if($actual -ne $step.expected){throw ('Control stage failed: '+$step.name)}
 }
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;$ok=$true
}finally{
 Pop-Location
 [ordered]@{kind='d_prune_identity_control_checks';success=$ok;source_sha256=$manifest.source_sha256;steps=$results;source_postcheck=$ok;dependencies_installed=$false;remote=$false;strict_still_blocked=$true}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'.json') -Encoding utf8NoBOM
}
Write-Output ('PRUNE_IDENTITY_CONTROLS success='+$ok+' steps='+$results.Count)
