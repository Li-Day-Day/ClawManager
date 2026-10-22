param([ValidateSet('isolated','published')][string]$Mode='isolated')
$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false;$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-base-20261022-r2.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner);$source=Join-Path $owner 'source'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong lifecycle owner'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$targets=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-targets-20261022-r2.json') -Raw|ConvertFrom-Json).targets
$manifestPath=Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-candidate-20261022-r2-source.json'
if(-not(Test-Path -LiteralPath $manifestPath)){
 $pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
 if($pins.Count -ne $base.files.Count+2){throw 'Unexpected lifecycle input set'}
 foreach($p in $base.files){if($p.path -cnotin $targets -and (@($pins|Where-Object path -CEQ $p.path)[0].sha256 -cne $p.sha256)){throw ('Unrelated lifecycle source change '+$p.path)}}
 [ordered]@{kind='d_gc_owner_lifecycle_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins;dependencies_installed=$false;actual_mysql=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
}
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
$prefix=Join-Path $PSScriptRoot ('d-gc-owner-lifecycle-20261022-r2-'+$Mode)
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing lifecycle run'}
foreach($dir in @('cache','tmp','telemetry/local','detached')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$stages=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false
$runRoot=$source;if($Mode -eq 'published'){$runRoot=$root}
function Test-LifecycleInputs{
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 if($Mode -eq 'published'){
  & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-review-20261022-r2.mjs') --current
  if($LASTEXITCODE -ne 0){throw 'Published lifecycle input scope changed'}
 }
}
function Run-LifecycleGo([string]$Stage,[string[]]$Arguments){
 & 'C:/Program Files/Go/bin/go.exe' @Arguments 1> ($prefix+'-'+$Stage+'.stdout') 2> ($prefix+'-'+$Stage+'.stderr')
 $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage=$Stage;exit=$code;arguments=$Arguments})
 Write-Output ('GC_OWNER_LIFECYCLE stage='+$Stage+' exit='+$code)
 if($code -ne 0){throw ('Lifecycle validation failed '+$Stage)}
}
$listing='{{.ImportPath}}'+[char]9+'{{.Dir}}'+[char]9+'{{join .GoFiles "|"}}'+[char]9+'{{join .CgoFiles "|"}}'+[char]9+'{{join .EmbedFiles "|"}}'
Push-Location (Join-Path $runRoot 'backend')
try{
 Test-LifecycleInputs
 foreach($p in $targets){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
 & (Join-Path $runRoot 'scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1') 1> ($prefix+'-dispatch.stdout') 2> ($prefix+'-dispatch.stderr')
 $stages.Add([pscustomobject]@{stage='dispatch';exit=0})
 if($Mode -eq 'isolated'){Run-LifecycleGo 'dependencies-default' @('list','-mod=readonly','-deps','-test','-f',$listing,'./internal/systembackupsecurity','./internal/systembackupevidence')}
 Run-LifecycleGo 'full' @('test','-mod=readonly','-p=1','-count=1','-timeout=2700s','-json','./internal/systembackupsecurity','./internal/systembackupevidence')
 if($Mode -eq 'isolated'){
  $seed='^Test(DDownloadGCFreezeMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
  Run-LifecycleGo 'tagged-seed' @('test','-mod=readonly','-p=1','-count=1','-timeout=120s','-tags','systembackup_mysql','-run',$seed,'-json','./internal/systembackupevidence')
  Run-LifecycleGo 'dependencies-windows' @('list','-mod=readonly','-deps','-test','-tags','systembackup_mysql','-f',$listing,'./internal/systembackupsecurity','./internal/systembackupevidence')
  Run-LifecycleGo 'windows-probe' @('test','-mod=readonly','-p=1','-tags','systembackup_mysql','-c','-o',(Join-Path $owner 'd-gc-owner-lifecycle.exe'),'./internal/systembackupevidence')
  Push-Location (Join-Path $owner 'detached')
  try{& (Join-Path $owner 'd-gc-owner-lifecycle.exe') '-test.run' $seed '-test.v' '-test.count=1' '-test.timeout=120s' 1> ($prefix+'-detached-seed.stdout') 2> ($prefix+'-detached-seed.stderr');$code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage='detached-seed';exit=$code});if($code -ne 0){throw 'Detached lifecycle seed failed'}}finally{Pop-Location}
  $env:GOOS='linux'
  Run-LifecycleGo 'dependencies-linux' @('list','-mod=readonly','-deps','-test','-tags','systembackup_mysql','-f',$listing,'./internal/systembackupsecurity','./internal/systembackupevidence')
  Run-LifecycleGo 'linux-probe' @('test','-mod=readonly','-p=1','-tags','systembackup_mysql','-c','-o',(Join-Path $owner 'd-gc-owner-lifecycle.test'),'./internal/systembackupevidence')
  Run-LifecycleGo 'migration-build' @('build','-mod=readonly','-p=1','-o',(Join-Path $owner 'system-backup-migrate'),'./cmd/system-backup-migrate')
 }
 Test-LifecycleInputs;$post=$true;$exit=0
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_owner_lifecycle_local_validation';mode=$Mode;exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;stages=$stages;default_vet=$true;dependencies_installed=$false;actual_mysql=$false;remote_executed=$false;freeze_adapter_wired=$false;production_approved=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('GC_OWNER_LIFECYCLE_DONE mode='+$Mode+' exit='+$exit+' postcheck='+$post)
exit $exit
