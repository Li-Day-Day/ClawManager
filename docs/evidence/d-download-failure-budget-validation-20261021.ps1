param([ValidateSet('counterfactual','target','full')][string]$Stage='target')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-712d347ca75740f2b13657daa867ca88'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -Force -LiteralPath $owner).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong audit-budget source owner'}
$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot ('d-download-failure-budget-20261021-'+$Stage)
foreach($suffix in @('-source.json','.jsonl','-stderr.txt','-native.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing evidence'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$base=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-failure-budget-base-20261021.json')|ConvertFrom-Json
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$owned=@('backend/internal/systembackupevidence/http.go','backend/internal/systembackupevidence/download_http_failure_budget_test.go')
$byPath=@{};foreach($pin in $pins){$byPath[$pin.path]=$pin}
foreach($pin in $base.files){if($pin.path -eq $owned[0] -and $Stage -ne 'counterfactual'){continue};if(-not$byPath.ContainsKey($pin.path) -or $pin.sha256 -ne $byPath[$pin.path].sha256){throw ('Unexpected source change: '+$pin.path)}}
if($pins.Count -ne $base.files.Count+1){throw 'Unexpected source additions'}
foreach($p in $owned){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$manifest=[ordered]@{kind='d_download_failure_budget_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);base_source_sha256=$base.source_sha256;files=$pins;dependencies_installed=$false;production_approved=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$packages=@('./internal/systembackupevidence');$pattern='^(TestDownloadHTTPFailure|TestDownloadResultFailure)'
if($Stage -eq 'target'){$pattern='^(TestDownloadHTTPFailure|TestDownloadResultFailure|TestRecoveryAuditJournal|TestFailureJournals|TestDownloadFailureJournal|TestJournaledDownloadRuntimeFailureGuard|TestDownloadAuthAuditRangeAndNoPartialBody|TestDownloadHandlerCarriesSessionAndRechecks|TestAdmittedDownloadHTTP)'}
if($Stage -eq 'full'){$packages=@('./internal/systembackupsecurity','./internal/systembackupevidence','./internal/systembackupread','./internal/systembackupproducer','./internal/systembackupgcmetadata');$pattern=''}
$goArgs=@('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json');if($pattern){$goArgs+=@('-run',$pattern)};$goArgs+=$packages
$exit=-1;$postcheck=$false;$started=(Get-Date).ToUniversalTime().ToString('o')
Push-Location (Join-Path $source 'backend')
try {
    & 'C:/Program Files/Go/bin/go.exe' @goArgs 1>($prefix+'.jsonl') 2>($prefix+'-stderr.txt')
    $exit=$LASTEXITCODE
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    $postcheck=$true
}finally{
    Pop-Location
    [ordered]@{kind='d_download_failure_budget_local_run';stage=$Stage;owner=$owner;started_utc=$started;finished_utc=(Get-Date).ToUniversalTime().ToString('o');exit=$exit;source_postcheck=$postcheck;source_sha256=$manifest.source_sha256;files=$pins.Count;default_vet=$true;packages=$packages;pattern=$pattern;dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('DOWNLOAD_FAILURE_BUDGET stage='+$Stage+' exit='+$exit+' postcheck='+$postcheck+' files='+$pins.Count)
exit $exit
