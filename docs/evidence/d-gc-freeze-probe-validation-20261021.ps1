param([int]$Attempt=1)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong source owner'}
$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot ('d-gc-freeze-probe-20261021-r'+$Attempt)
if(Test-Path -LiteralPath ($prefix+'-source.json')){throw 'Occupied evidence prefix'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$baseFile=if($Attempt -eq 4){'d-gc-freeze-probe-base-v4-20261021.json'}else{'d-gc-freeze-probe-base-20261021.json'}
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot $baseFile) -Raw|ConvertFrom-Json
$allowed=@('backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go','scripts/system-backup-d-download-gc-freeze-phase.sh','scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1','scripts/system-backup-d-config-writer-validation.ps1','scripts/system-backup-a-evidence-validation.ps1')
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$byPath=@{};foreach($pin in $pins){$byPath[$pin.path]=$pin}
foreach($pin in $base.files){if($allowed -contains $pin.path){continue};if(-not $byPath.ContainsKey($pin.path) -or $pin.sha256 -ne $byPath[$pin.path].sha256){throw ('Unowned source drift '+$pin.path)}}
if($pins.Count -ne $base.files.Count+3){throw 'Unexpected source set'}
foreach($p in $allowed){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$manifest=[ordered]@{kind='d_gc_freeze_prerequisite_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);base_source_sha256=$base.source_sha256;files=$pins;dependencies_installed=$false;production_approved=$false;actual_mysql=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
function CheckSource {Test-DIndexSourceSnapshot -Root $source -Manifest $manifest}
CheckSource
foreach($dir in @('cache','tmp','telemetry/local','detached/work/probe')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$env:PATH='C:/Program Files/nodejs;C:/Program Files/Go/bin;'+$env:PATH
$results=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false;$started=(Get-Date).ToUniversalTime().ToString('o')
function RunNative {
 param([string]$Name,[string]$File,[string[]]$Arguments)
 Write-Output ('FREEZE_STAGE started='+$Name)
 & $File @Arguments 1>($prefix+'-'+$Name+'.stdout') 2>($prefix+'-'+$Name+'.stderr')
 $nativeExit=$LASTEXITCODE
 $results.Add([ordered]@{stage=$Name;exit=$nativeExit;finished_utc=(Get-Date).ToUniversalTime().ToString('o')})
 if($nativeExit -ne 0){throw ('Freeze validation stage failed '+$Name+' exit='+$nativeExit)}
 Write-Output ('FREEZE_STAGE passed='+$Name)
}
Push-Location $source
try{
 foreach($ps in @(@('ps7','C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'),@('ps5','C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'))){
  foreach($dispatch in @('d-download-gc-freeze','d-download-gc-task','d-download-producer','a-download-gc-role','a-evidence')){
   RunNative -Name ($ps[0]+'-'+$dispatch) -File $ps[1] -Arguments @('-NoProfile','-File',(Join-Path $source ('scripts/system-backup-'+$dispatch+'-dispatch.test.ps1')))
  }
 }
 RunNative -Name 'inputs' -File 'C:/Program Files/nodejs/node.exe' -Arguments @('scripts/system-backup-a-download-mfa-inputs.mjs')
 # The existing Git Bash failed to initialize with 0xC0000142 in r1. Do not
 # install a replacement or retry the same unavailable runtime. The operator's
 # existing three-script bash preflight remains mandatory before remote work.
 $results.Add([ordered]@{stage='local-bash-syntax';status='unavailable';observed_exit=-1073741502;remote_bash_preflight_preserved=$true})
 Set-Location (Join-Path $source 'backend')
 $go='C:/Program Files/Go/bin/go.exe'
 $seed='^Test(DDownloadGCFreezeMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
 RunNative -Name 'tagged-seed' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','-tags','systembackup_mysql','-run',$seed,'./internal/systembackupevidence')
 RunNative -Name 'full' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupsecurity','./internal/systembackupevidence')
 $windows=Join-Path $owner 'd-download-gc-freeze.exe'
 RunNative -Name 'windows-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',$windows,'./internal/systembackupevidence')
 Set-Location (Join-Path $owner 'detached/work/probe')
 if(@(Get-ChildItem -LiteralPath (Get-Location) -Force).Count -ne 0){throw 'Detached seed cwd occupied'}
 RunNative -Name 'detached-seed' -File $windows -Arguments @('-test.run',$seed,'-test.v','-test.count=1','-test.timeout=60s')
 if($Attempt -eq 4){RunNative -Name 'unowned-deny' -File 'C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe' -Arguments @('-NoProfile','-File',(Join-Path $PSScriptRoot 'd-gc-freeze-probe-unowned-deny-20261021.ps1'),'-Revision','4')}
 Set-Location (Join-Path $source 'backend')
 $env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
 RunNative -Name 'linux-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',(Join-Path $owner 'd-download-gc-freeze.test'),'./internal/systembackupevidence')
 RunNative -Name 'linux-migration' -File $go -Arguments @('build','-mod=readonly','-p=1','-o',(Join-Path $owner 'system-backup-migrate'),'./cmd/system-backup-migrate')
 CheckSource;$post=$true;$exit=0
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_freeze_prerequisite_local_validation';started_utc=$started;finished_utc=(Get-Date).ToUniversalTime().ToString('o');exit=$exit;stages=$results;source_postcheck=$post;source_sha256=$manifest.source_sha256;source_files=$pins.Count;default_vet=$true;dependencies_installed=$false;remote=$false;actual_mysql=$false;full_gc=$false;freeze_adapter_wired=$false;production_approved=$false}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('FREEZE_VALIDATION exit='+$exit+' postcheck='+$post)
exit $exit
