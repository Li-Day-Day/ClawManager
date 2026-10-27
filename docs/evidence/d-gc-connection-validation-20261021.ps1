param([Parameter(Mandatory=$true)][ValidatePattern('^r[0-9]+$')][string]$Attempt,[ValidateSet('target','full','published')][string]$Stage='target')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-83cd6bed3e644a098defa87b015f3b43'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong GC connection source owner'}
$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot ('d-gc-connection-20261021-'+$Attempt+'-'+$Stage)
foreach($suffix in @('-source.json','.jsonl','-stderr.txt','-native.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing evidence'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$files=Get-DIndexSourceFiles -Root $source
$pins=Get-DIndexInputPins -Root $source -Files $files
$base=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-connection-base-20261021.json')|ConvertFrom-Json
$names=@('download_retention_gc.go','download_retention_gc_test.go','download_retention_gc_connection.go','download_retention_gc_connection_test.go','system_publish_runtime_test.go')
$ownedPaths=@($names|ForEach-Object{'backend/internal/systembackupevidence/'+$_})
$byPath=@{};foreach($pin in $pins){$byPath[$pin.path]=$pin}
foreach($pin in $base.files){if($ownedPaths -contains $pin.path){continue};if(-not$byPath.ContainsKey($pin.path) -or $byPath[$pin.path].sha256 -ne $pin.sha256){throw ('Unowned source drift: '+$pin.path)}}
if($pins.Count -ne $base.files.Count+2){throw 'Unexpected source additions'}
foreach($p in $ownedPaths){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$manifest=[ordered]@{kind='d_gc_connection_candidate';version=1;source_sha256=(Get-DIndexPinDigest -Pins $pins);base_source_sha256=$base.source_sha256;files=$pins;dependencies_installed=$false;production_approved=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$runRoot=$source;if($Stage -eq 'published'){$runRoot=$root}
function Test-PublishedInputs {
    foreach($p in @($ownedPaths)+@('backend/go.mod','backend/go.sum')){if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $runRoot $p)).Hash.ToLowerInvariant() -ne $byPath[$p].sha256){throw ('Published input changed: '+$p)}}
}
Test-PublishedInputs
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$packages=@('./internal/systembackupevidence');$pattern='^(TestDownloadGCConnection|TestDownloadRetentionGCConnection|TestSystemPublisher(StagingAndRevocation|AbsenceExpiredBeforeStaging))'
if($Stage -eq 'full'){$packages=@('./internal/systembackupsecurity','./internal/systembackupevidence','./internal/systembackupread','./internal/systembackupproducer','./internal/systembackupgcmetadata');$pattern=''}
elseif($Stage -eq 'published'){$pattern='^(TestDownloadRetentionGC|TestDownloadGC|TestDownloadGCEarly|TestSQLDownloadGCDirect|TestSystemPublisher(StagingAndRevocation|AbsenceExpiredBeforeStaging))'}
$args=@('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json');if($pattern){$args+=@('-run',$pattern)};$args+=$packages
$exit=-1;$postcheck=$false;$started=(Get-Date).ToUniversalTime().ToString('o')
Push-Location (Join-Path $runRoot 'backend')
try {
    & 'C:/Program Files/Go/bin/go.exe' @args 1>($prefix+'.jsonl') 2>($prefix+'-stderr.txt')
    $exit=$LASTEXITCODE
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    Test-PublishedInputs
    $postcheck=$true
}finally{
    Pop-Location
    [ordered]@{kind='d_gc_connection_local_run';stage=$Stage;attempt=$Attempt;owner=$owner;started_utc=$started;finished_utc=(Get-Date).ToUniversalTime().ToString('o');exit=$exit;source_postcheck=$postcheck;source_sha256=$manifest.source_sha256;files=$pins.Count;default_vet=$true;packages=$packages;pattern=$pattern;dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('GC_CONNECTION stage='+$Stage+' exit='+$exit+' source_postcheck='+$postcheck+' files='+$pins.Count+' source='+$manifest.source_sha256)
exit $exit
