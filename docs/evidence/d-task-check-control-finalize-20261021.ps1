param([Parameter(Mandatory=$true)][ValidateSet('publish','cleanup')][string]$Stage,[ValidatePattern('^r[0-9]+$')][string]$Attempt='r2',[switch]$ValidationSessionsTerminal)
$ErrorActionPreference='Stop'
if(-not $ValidationSessionsTerminal){throw 'Confirm exact owned validation handles are terminal first'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-22896c73544948059a4d218c9e3e226f'
$owner=(Resolve-Path -LiteralPath (Join-Path $root $name)).Path
if([IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.Path]::GetFileName($owner) -ne $name -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne $name){throw 'Wrong exact source owner'}
if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
if(@(Get-ChildItem -LiteralPath $owner -Force -Recurse|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}|Select-Object -First 1).Count){throw 'Redirected owned child'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$source=Join-Path $owner 'source'
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('d-task-check-control-20261021-'+$Attempt+'-full-source.json'))|ConvertFrom-Json
foreach($run in @('target','full')){
    $native=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('d-task-check-control-20261021-'+$Attempt+'-'+$run+'-native.json'))|ConvertFrom-Json
    if($native.exit -ne 0 -or -not $native.source_postcheck -or $native.source_sha256 -ne $manifest.source_sha256){throw 'Matching successful validation missing'}
}
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$own=@('backend/internal/systembackupread/task_check_control.go','backend/internal/systembackupread/task_check_control_test.go')
if($Stage -eq 'publish'){
    $out=Join-Path $PSScriptRoot 'd-task-check-control-published-context-20261021.json'
    if(Test-Path -LiteralPath $out){throw 'Occupied publication evidence'}
    foreach($p in $own){if(Test-Path -LiteralPath (Join-Path $root $p)){throw ('Occupied source path: '+$p)}}
    foreach($p in $own){Copy-Item -LiteralPath (Join-Path $source $p) -Destination (Join-Path $root $p);(Get-Item -LiteralPath (Join-Path $root $p)).IsReadOnly=$false}
    $first=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
    $second=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
    $digest=Get-DIndexPinDigest -Pins $first
    if($digest -ne (Get-DIndexPinDigest -Pins $second)){throw 'Publication context changed while observed'}
    [ordered]@{kind='d_task_check_control_published_context';source_sha256=$digest;files=$second;stable_copy_verified=$true;dependencies_installed=$false;production_approved=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
}else{
    $out=Join-Path $PSScriptRoot 'd-task-check-control-cleanup-20261021.json'
    if(Test-Path -LiteralPath $out){throw 'Refusing existing cleanup evidence'}
    if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'd-task-check-control-published-context-20261021.json'))){throw 'Published context missing'}
}
foreach($p in @($own)+@('backend/go.mod','backend/go.sum')){
    $pin=@($manifest.files|Where-Object path -eq $p)
    if($pin.Count -ne 1 -or (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $p)).Hash.ToLowerInvariant() -ne $pin[0].sha256){throw ('Published bytes changed: '+$p)}
}
if($Stage -eq 'cleanup'){
    Remove-Item -LiteralPath $owner -Recurse -Force
    if(Test-Path -LiteralPath $owner){throw 'Owned artifacts remain'}
    [ordered]@{kind='d_task_check_control_cleanup';absolute_owner=$owner;removed=$true;source_postcheck=$true;process_terminal=$true;source_sha256=$manifest.source_sha256;dependencies_installed=$false;retained='logs, source manifests, review evidence';recorded_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $out -Encoding utf8NoBOM
}
Write-Output ('TASK_CHECK_CONTROL finalize='+$Stage+' source='+$manifest.source_sha256)
