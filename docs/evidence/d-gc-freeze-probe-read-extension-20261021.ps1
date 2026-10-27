$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e';$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r9'
if(Test-Path -LiteralPath ($prefix+'-source.json')){throw 'Extension evidence occupied'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong extension owner'}
$priorNative=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r8-native.json') -Raw|ConvertFrom-Json
if($priorNative.exit -ne 0 -or -not $priorNative.source_postcheck){throw 'Parent validation must be terminal and passed'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$prior=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r8-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $prior
$observed=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-prepublish-current-20261021.json') -Raw|ConvertFrom-Json
$added=@('backend/internal/systembackupread/verification_detail.go','backend/internal/systembackupread/verification_detail_test.go')
foreach($p in $added){
 $pin=$observed.files|Where-Object path -CEQ $p
 if(@($pin).Count -ne 1 -or (Test-Path -LiteralPath (Join-Path $source $p))){throw 'Extension input identity mismatch'}
 if((Get-FileHash -LiteralPath (Join-Path $root $p) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Extension input changed'}
 Copy-Item -LiteralPath (Join-Path $root $p) -Destination (Join-Path $source $p)
 (Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true
}
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
if($pins.Count -ne $prior.files.Count+2){throw 'Unexpected extension source set'}
$map=@{};foreach($pin in $pins){$map[$pin.path]=$pin}
foreach($pin in $prior.files){if($pin.sha256 -cne $map[$pin.path].sha256){throw 'Existing tested bytes changed during extension'}}
$manifest=[ordered]@{kind='d_gc_freeze_read_dependency_extension';source_sha256=(Get-DIndexPinDigest -Pins $pins);parent_source_sha256=$prior.source_sha256;files=$pins;added_from_parent=$added;existing_tested_files_unchanged=$true;production_approved=$false;actual_mysql=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$results=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false
function RunExtension {
 param([string]$Name,[string]$File,[string[]]$Arguments)
 Write-Output ('FREEZE_EXTENSION started='+$Name)
 & $File @Arguments 1>($prefix+'-'+$Name+'.stdout') 2>($prefix+'-'+$Name+'.stderr')
 $code=$LASTEXITCODE;$results.Add([ordered]@{stage=$Name;exit=$code})
 if($code -ne 0){throw ('Dependency extension failed '+$Name)}
 Write-Output ('FREEZE_EXTENSION passed='+$Name)
}
Push-Location (Join-Path $source 'backend')
try{
 $go='C:/Program Files/Go/bin/go.exe';$seed='^Test(DDownloadGCFreezeMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
 RunExtension -Name 'full-read' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupread')
 RunExtension -Name 'tagged-seed' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','-tags','systembackup_mysql','-run',$seed,'./internal/systembackupevidence')
 $windows=Join-Path $owner 'd-download-gc-freeze.exe'
 RunExtension -Name 'windows-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',$windows,'./internal/systembackupevidence')
 Set-Location (Join-Path $owner 'detached/work/probe')
 RunExtension -Name 'detached-seed' -File $windows -Arguments @('-test.run',$seed,'-test.v','-test.count=1','-test.timeout=60s')
 Set-Location (Join-Path $source 'backend');$env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
 RunExtension -Name 'linux-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',(Join-Path $owner 'd-download-gc-freeze.test'),'./internal/systembackupevidence')
 RunExtension -Name 'linux-migration' -File $go -Arguments @('build','-mod=readonly','-p=1','-o',(Join-Path $owner 'system-backup-migrate'),'./cmd/system-backup-migrate')
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;$post=$true;$exit=0
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_freeze_read_dependency_extension_validation';exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;parent_source_sha256=$prior.source_sha256;stages=$results;default_vet=$true;existing_passed_source_bytes_unchanged=$true;dependencies_installed=$false;actual_mysql=$false;remote=$false;production_approved=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('FREEZE_EXTENSION exit='+$exit+' source-postcheck='+$post)
exit $exit
