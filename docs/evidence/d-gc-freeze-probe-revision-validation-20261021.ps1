$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
$source=Join-Path $owner 'source'
$priorPrefix=Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r2'
$prefix=Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r3'
if(Test-Path -LiteralPath ($prefix+'-source.json')){throw 'Revision evidence occupied'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong revision owner'}
$prior=Get-Content -LiteralPath ($priorPrefix+'-native.json') -Raw|ConvertFrom-Json
if($prior.exit -ne 0 -or -not $prior.source_postcheck){throw 'Prior validation must be terminal and passed'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$priorSource=Get-Content -LiteralPath ($priorPrefix+'-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $priorSource
$beforeBinaries=@(foreach($name in @('d-download-gc-freeze.exe','d-download-gc-freeze.test','system-backup-migrate')){$file=Join-Path $owner $name;[ordered]@{name=$name;size=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}})
$beforeBinaries|ConvertTo-Json -Depth 4|Set-Content -LiteralPath ($priorPrefix+'-binaries.json') -Encoding utf8NoBOM
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-freeze-probe-thread-pin-20261021.mjs')
if($LASTEXITCODE -ne 0){throw 'Thread-pin edit failed'}
$changed='backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go'
& 'C:/Program Files/Go/bin/gofmt.exe' -w (Join-Path $source $changed)
if($LASTEXITCODE -ne 0){throw 'Thread-pin format failed'}
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
if($pins.Count -ne $priorSource.files.Count){throw 'Revision changed source set'}
$map=@{};foreach($pin in $pins){$map[$pin.path]=$pin}
foreach($pin in $priorSource.files){if($pin.path -cne $changed -and $pin.sha256 -cne $map[$pin.path].sha256){throw ('Unexpected revision input '+$pin.path)}}
if($map[$changed].sha256 -ceq ($priorSource.files|Where-Object path -CEQ $changed).sha256){throw 'Thread pin was not changed'}
(Get-Item -LiteralPath (Join-Path $source $changed)).IsReadOnly=$true
$manifest=[ordered]@{kind='d_gc_freeze_thread_pin_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);parent_source_sha256=$priorSource.source_sha256;files=$pins;changed_from_parent=@($changed);dependencies_installed=$false;production_approved=$false;actual_mysql=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
$results=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false
function RunRevision {
 param([string]$Name,[string]$File,[string[]]$Arguments)
 Write-Output ('FREEZE_REVISION started='+$Name)
 & $File @Arguments 1>($prefix+'-'+$Name+'.stdout') 2>($prefix+'-'+$Name+'.stderr')
 $code=$LASTEXITCODE;$results.Add([ordered]@{stage=$Name;exit=$code})
 if($code -ne 0){throw ('Thread-pin revision failed '+$Name)}
 Write-Output ('FREEZE_REVISION passed='+$Name)
}
Push-Location (Join-Path $source 'backend')
try{
 $go='C:/Program Files/Go/bin/go.exe';$seed='^Test(DDownloadGCFreezeMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
 RunRevision -Name 'ordinary-exclusion' -File $go -Arguments @('list','-mod=readonly','-p=1','-f','{{join .TestGoFiles ","}}','./internal/systembackupevidence')
 if([IO.File]::ReadAllText($prefix+'-ordinary-exclusion.stdout').Contains('download_gc_freeze_mysql_test.go')){throw 'Tagged revision unexpectedly enters ordinary test inputs'}
 RunRevision -Name 'tagged-seed' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','-tags','systembackup_mysql','-run',$seed,'./internal/systembackupevidence')
 $windows=Join-Path $owner 'd-download-gc-freeze.exe'
 RunRevision -Name 'windows-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',$windows,'./internal/systembackupevidence')
 Set-Location (Join-Path $owner 'detached/work/probe')
 RunRevision -Name 'detached-seed' -File $windows -Arguments @('-test.run',$seed,'-test.v','-test.count=1','-test.timeout=60s')
 RunRevision -Name 'unowned-deny' -File 'C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe' -Arguments @('-NoProfile','-File',(Join-Path $PSScriptRoot 'd-gc-freeze-probe-unowned-deny-20261021.ps1'),'-Revision','3')
 Set-Location (Join-Path $source 'backend');$env:GOOS='linux'
 RunRevision -Name 'linux-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',(Join-Path $owner 'd-download-gc-freeze.test'),'./internal/systembackupevidence')
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 if((Get-FileHash -LiteralPath (Join-Path $owner 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant() -cne ($beforeBinaries|Where-Object name -CEQ 'system-backup-migrate').sha256){throw 'Unchanged migration runner changed'}
 $post=$true;$exit=0
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_freeze_thread_pin_validation';exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;parent_source_sha256=$priorSource.source_sha256;only_changed_file=$changed;ordinary_test_input_exclusion_checked=$true;full_ordinary_tests_reused_from_unchanged_parent=$true;stages=$results;default_vet=$true;dependencies_installed=$false;remote=$false;actual_mysql=$false;full_gc=$false;freeze_adapter_wired=$false;production_approved=$false}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('FREEZE_REVISION exit='+$exit+' postcheck='+$post)
exit $exit
