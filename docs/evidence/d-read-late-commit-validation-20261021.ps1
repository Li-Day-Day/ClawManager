param([ValidateSet('counterfactual','target','full')][string]$Stage='target')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-0af4f725101940e0927331237c9303de'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -Force -LiteralPath $owner).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong read-commit source owner'}
$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot ('d-read-late-commit-20261021-r2-'+$Stage)
foreach($suffix in @('-source.json','.jsonl','-stderr.txt','-native.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing evidence'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$base=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-read-late-commit-base-20261021.json')|ConvertFrom-Json
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$names=@('config_list.go','config_snapshot.go','operation_detail.go','operation_list.go','overview_control.go','task_detail_base.go','task_pages.go')
$owned=@($names|ForEach-Object{'backend/internal/systembackupread/'+$_})+@('backend/internal/systembackupread/read_commit_context_test.go')
$byPath=@{};foreach($pin in $pins){$byPath[$pin.path]=$pin}
foreach($pin in $base.files){if($owned -contains $pin.path -and $Stage -ne 'counterfactual'){continue};if(-not$byPath.ContainsKey($pin.path) -or $pin.sha256 -ne $byPath[$pin.path].sha256){throw ('Unexpected source change: '+$pin.path)}}
if($pins.Count -ne $base.files.Count+1){throw 'Unexpected source additions'}
foreach($p in $owned){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$manifest=[ordered]@{kind='d_read_late_commit_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);base_source_sha256=$base.source_sha256;files=$pins;dependencies_installed=$false;production_approved=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$packages=@('./internal/systembackupread');$pattern='^TestReadCommitContextBoundary$'
if($Stage -eq 'full'){$packages=@('./internal/systembackupread','./internal/systembackupsecurity');$pattern=''}
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
    [ordered]@{kind='d_read_late_commit_local_run';stage=$Stage;owner=$owner;started_utc=$started;finished_utc=(Get-Date).ToUniversalTime().ToString('o');exit=$exit;source_postcheck=$postcheck;source_sha256=$manifest.source_sha256;files=$pins.Count;default_vet=$true;packages=$packages;pattern=$pattern;dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('READ_LATE_COMMIT stage='+$Stage+' exit='+$exit+' postcheck='+$postcheck+' files='+$pins.Count)
exit $exit
