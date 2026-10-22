param([ValidateSet('old','candidate','published')][string]$Mode)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-observer-close-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner)
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong owner'}
$source=Join-Path $owner 'source'
$runRoot=$source
if($Mode -eq 'published'){$runRoot=$root}
$prefix=Join-Path $PSScriptRoot ('d-gc-observer-close-20261022-'+$Mode)
foreach($suffix in @('-source.json','.jsonl','.stderr','-native.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Existing stage evidence'}}
$catalog=Join-Path $source 'backend/internal/systembackupgcmetadata/catalog.go'
if($Mode -eq 'candidate'){[IO.File]::WriteAllBytes($catalog,[IO.File]::ReadAllBytes((Join-Path $owner 'catalog-candidate.bytes')))}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$package=Join-Path $runRoot 'backend/internal/systembackupgcmetadata'
$files=@('backend/go.mod','backend/go.sum')+@(Get-ChildItem -LiteralPath $package -File -Force|Sort-Object Name|ForEach-Object{'backend/internal/systembackupgcmetadata/'+$_.Name})
if($files.Count -ne 7){throw 'Package scope changed'}
$pins=Get-DIndexInputPins -Root $runRoot -Files $files
$manifest=[ordered]@{kind='d_gc_observer_close_package_inputs';mode=$Mode;files=$pins;source_sha256=(Get-DIndexPinDigest -Pins $pins);scope='exact package and module files only';whole_tree_tested=$false}
$manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
foreach($d in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $d))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$argsGo=@('test','-mod=readonly','-p=1','-count=1','-timeout=120s','-json')
if($Mode -eq 'old'){$argsGo+=@('-run','^TestProgramObservationAfterConnectionClose$')}
$argsGo+='clawreef/internal/systembackupgcmetadata'
$exit=-1;$post=$false
Push-Location (Join-Path $runRoot 'backend')
try{
 & 'C:/Program Files/Go/bin/go.exe' @argsGo 1> ($prefix+'.jsonl') 2> ($prefix+'.stderr')
 $exit=$LASTEXITCODE
 $after=Get-DIndexInputPins -Root $runRoot -Files $files
 if((Get-DIndexPinDigest -Pins $after) -cne $manifest.source_sha256){throw 'Source changed during test'}
 if(@(Get-ChildItem -LiteralPath $package -File -Force).Count -ne 5){throw 'Package source set changed'}
 $post=$true
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_observer_close_test_run';mode=$Mode;exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;default_vet=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;owner=$owner;finished_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('OBSERVER_CLOSE mode='+$Mode+' exit='+$exit+' postcheck='+$post)
exit $exit
