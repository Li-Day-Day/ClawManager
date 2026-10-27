param([ValidateSet('isolated','published')][string]$Mode='isolated')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner)
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong source owner'}
$source=Join-Path $owner 'source'
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$prefix=Join-Path $PSScriptRoot ('d-cost-snapshot-concurrent-20261022-'+$Mode)
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing run'}
$files=Get-DIndexSourceFiles -Root $source
$pins=Get-DIndexInputPins -Root $source -Files $files
$manifest=[ordered]@{kind='d_cost_snapshot_concurrent_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins;scope='business package and tagged probe preparation; no actual MySQL';dependencies_installed=$false;actual_mysql=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
$targets=@('backend/internal/systembackupbusinessa/restore_rows_mysql_test.go','backend/internal/systembackupbusinessa/cost_snapshot_hook_test.go','backend/internal/systembackupbusinessa/cost_snapshot_concurrent_mysql_test.go')
if($pins.Count -ne $base.files.Count+2){throw 'Unexpected candidate source set'}
foreach($p in $base.files){if($p.path -cnotin $targets -and (@($pins|Where-Object path -CEQ $p.path)[0].sha256 -cne $p.sha256)){throw ('Unrelated private source changed '+$p.path)}}
foreach($p in $targets){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$runRoot=$source
if($Mode -eq 'published'){$runRoot=$root}
function Test-Inputs {
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 if($Mode -eq 'published'){
  $guard=@($pins|Where-Object{ $_.path -in @('backend/go.mod','backend/go.sum','contracts/system-backup/v12/schema-registry.json','contracts/system-backup/v12/verifier-contract.schema.json') -or $_.path.StartsWith('backend/internal/systembackupbusinessa/') })
  foreach($p in $guard){if((Get-FileHash -LiteralPath (Join-Path $root $p.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.sha256){throw ('Published scope changed '+$p.path)}}
 }
}
foreach($d in @('cache','tmp','telemetry/local','detached')){[IO.Directory]::CreateDirectory((Join-Path $owner $d))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$stages=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false
function Run-Go([string]$Stage,[string[]]$Arguments){
 & 'C:/Program Files/Go/bin/go.exe' @Arguments 1> ($prefix+'-'+$Stage+'.stdout') 2> ($prefix+'-'+$Stage+'.stderr')
 $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage=$Stage;exit=$code;arguments=$Arguments})
 Write-Output ('COST_SNAPSHOT stage='+$Stage+' exit='+$code)
 if($code -ne 0){throw ('Cost snapshot validation failed '+$Stage)}
}
Push-Location (Join-Path $runRoot 'backend')
try{
 Test-Inputs
 Run-Go 'full-business' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupbusinessa')
 if($Mode -eq 'isolated'){
  Run-Go 'tagged-seed' @('test','-mod=readonly','-p=1','-count=1','-timeout=120s','-tags','systembackup_mysql','-run','^TestABusinessRestoreMySQLSeed$','-json','./internal/systembackupbusinessa')
  Run-Go 'windows-probe' @('test','-mod=readonly','-p=1','-tags','systembackup_mysql','-c','-o',(Join-Path $owner 'a-cost-snapshot.exe'),'./internal/systembackupbusinessa')
  Push-Location (Join-Path $owner 'detached')
  try{
   & (Join-Path $owner 'a-cost-snapshot.exe') '-test.run' '^TestABusinessRestoreMySQLSeed$' '-test.v' '-test.count=1' 1> ($prefix+'-detached-seed.stdout') 2> ($prefix+'-detached-seed.stderr')
   $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage='detached-seed';exit=$code})
   if($code -ne 0){throw 'Detached seed failed'}
  }finally{Pop-Location}
  $env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
  Run-Go 'linux-probe' @('test','-mod=readonly','-p=1','-tags','systembackup_mysql','-c','-o',(Join-Path $owner 'a-cost-snapshot.test'),'./internal/systembackupbusinessa')
 }
 Test-Inputs;$post=$true;$exit=0
}finally{
 Pop-Location
 [ordered]@{kind='d_cost_snapshot_concurrent_local_run';mode=$Mode;stages=$stages;exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;default_vet=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;finished_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('COST_SNAPSHOT_DONE mode='+$Mode+' exit='+$exit+' postcheck='+$post)
exit $exit
