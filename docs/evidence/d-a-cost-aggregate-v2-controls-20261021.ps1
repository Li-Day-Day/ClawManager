param([int]$Attempt=1)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$source=Join-Path $root '.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096/source'
$prefix=Join-Path $PSScriptRoot ('d-a-cost-aggregate-v2-controls-20261021'+$(if($Attempt -eq 1){''}else{'-r'+$Attempt}))
if(Test-Path -LiteralPath ($prefix+'.json')){throw 'Control receipt exists'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot ('d-a-cost-aggregate-v2-20261021-r'+$Attempt+'-full-source.json')) -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$steps=@(
 @{name='inventory';args=@('scripts/system-backup-schema-inventory.mjs','--check');expected=0},
 @{name='contract';args=@('scripts/system-backup-contract-check.mjs','--check');expected=0},
 @{name='strict';args=@('scripts/system-backup-contract-check.mjs','--check','--strict');expected=1}
)
$results=@();$ok=$false
Push-Location $source
try{
 foreach($step in $steps){
  $stdout=$prefix+'-'+$step.name+'.stdout';$stderr=$prefix+'-'+$step.name+'.stderr'
  if((Test-Path -LiteralPath $stdout) -or (Test-Path -LiteralPath $stderr)){throw 'Control output exists'}
  & 'C:/Program Files/nodejs/node.exe' @($step.args) 1>$stdout 2>$stderr
  $actual=$LASTEXITCODE
  $results+=@{name=$step.name;exit=$actual;expected=$step.expected;stdout_sha256=(Get-FileHash -LiteralPath $stdout -Algorithm SHA256).Hash.ToLowerInvariant();stderr_sha256=(Get-FileHash -LiteralPath $stderr -Algorithm SHA256).Hash.ToLowerInvariant()}
  if($actual -ne $step.expected){throw ('Unexpected gate result '+$step.name)}
 }
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;$ok=$true
}finally{
 Pop-Location
 [ordered]@{kind='d_a_cost_aggregate_control_checks';success=$ok;source_sha256=$manifest.source_sha256;steps=$results;source_postcheck=$ok;dependencies_installed=$false;remote=$false;strict_still_blocked=$true}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath ($prefix+'.json') -Encoding utf8NoBOM
}
Write-Output ('COST_AGGREGATE_CONTROLS success='+$ok+' steps='+$results.Count)
