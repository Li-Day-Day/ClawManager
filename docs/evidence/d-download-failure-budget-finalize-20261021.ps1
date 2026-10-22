param([Parameter(Mandatory=$true)][ValidateSet('publish','cleanup')][string]$Stage,[switch]$ValidationSessionsTerminal)
$ErrorActionPreference='Stop'
if(-not $ValidationSessionsTerminal){throw 'Confirm exact owned validation handles are terminal first'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-712d347ca75740f2b13657daa867ca88'
$owner=(Resolve-Path -LiteralPath (Join-Path $root $name)).Path
if([IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.Path]::GetFileName($owner) -ne $name -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne $name){throw 'Wrong exact source owner'}
if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
if(@(Get-ChildItem -LiteralPath $owner -Force -Recurse|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}|Select-Object -First 1).Count){throw 'Redirected owned child'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$source=Join-Path $owner 'source'
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-failure-budget-20261021-full-source.json')|ConvertFrom-Json
$base=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-failure-budget-base-20261021.json')|ConvertFrom-Json
foreach($run in @('target','full')){
    $native=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('d-download-failure-budget-20261021-'+$run+'-native.json'))|ConvertFrom-Json
    if($native.exit -ne 0 -or -not $native.source_postcheck -or $native.source_sha256 -ne $manifest.source_sha256){throw 'Matching successful validation missing'}
}
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$own=@('backend/internal/systembackupevidence/http.go','backend/internal/systembackupevidence/download_http_failure_budget_test.go')
if($Stage -eq 'publish'){
    $out=Join-Path $PSScriptRoot 'd-download-failure-budget-published-context-20261021.json'
    if(Test-Path -LiteralPath $out){throw 'Refusing existing publication evidence'}
    $old=@($base.files|Where-Object path -eq $own[0]);if($old.Count -ne 1){throw 'Missing original HTTP pin'}
    if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $own[0])).Hash.ToLowerInvariant() -ne $old[0].sha256 -or (Test-Path -LiteralPath (Join-Path $root $own[1]))){throw 'Concurrent HTTP changes or occupied test path'}
    foreach($p in @($own[1],$own[0])){
        Copy-Item -LiteralPath (Join-Path $source $p) -Destination (Join-Path $root $p)
        (Get-Item -LiteralPath (Join-Path $root $p)).IsReadOnly=$false
    }
    $first=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
    $second=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
    $digest=Get-DIndexPinDigest -Pins $first
    if($digest -ne (Get-DIndexPinDigest -Pins $second)){throw 'Publication context changed while observed'}
    [ordered]@{kind='d_download_failure_budget_published_context';source_sha256=$digest;files=$second;stable_copy_verified=$true;dependencies_installed=$false;production_approved=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
}else{
    $out=Join-Path $PSScriptRoot 'd-download-failure-budget-cleanup-20261021.json'
    if(Test-Path -LiteralPath $out){throw 'Refusing existing cleanup evidence'}
    if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'd-download-failure-budget-published-context-20261021.json'))){throw 'Published source context missing'}
}
foreach($p in @($own)+@('backend/go.mod','backend/go.sum')){
    $pin=@($manifest.files|Where-Object path -eq $p)
    if($pin.Count -ne 1 -or (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $p)).Hash.ToLowerInvariant() -ne $pin[0].sha256){throw ('Published bytes changed: '+$p)}
}
if($Stage -eq 'cleanup'){
    Remove-Item -LiteralPath $owner -Recurse -Force
    if(Test-Path -LiteralPath $owner){throw 'Owned artifacts remain'}
    [ordered]@{kind='d_download_failure_budget_cleanup';absolute_owner=$owner;removed=$true;source_postcheck=$true;process_terminal=$true;source_sha256=$manifest.source_sha256;dependencies_installed=$false;retained='logs, source manifests, review evidence';recorded_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $out -Encoding utf8NoBOM
}
Write-Output ('DOWNLOAD_FAILURE_BUDGET finalize='+$Stage+' source='+$manifest.source_sha256)
