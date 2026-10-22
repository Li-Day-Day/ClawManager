param([switch]$ValidationSessionTerminal)
$ErrorActionPreference='Stop'
if(-not $ValidationSessionTerminal){throw 'Validation process must be confirmed terminal by its tool handle first'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-0f0b327a8c394230b477fde2cca729bb'
$owner=Join-Path $root $name
$receipt=Join-Path $PSScriptRoot 'd-gc-program-observer-cleanup-20261021.json'
if(Test-Path -LiteralPath $receipt){throw 'Refusing to overwrite cleanup receipt'}
$resolved=(Resolve-Path -LiteralPath $owner).Path
if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -ne $name -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne $name){throw 'Cleanup target escaped exact run owner'}
if((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
$redirected=@(Get-ChildItem -LiteralPath $resolved -Force -Recurse | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint} | Select-Object -First 1)
if($redirected.Count){throw 'Redirected owned child'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-program-observer-20261021-r1-isolated-source.json') | ConvertFrom-Json
foreach($mode in @('isolated','published')){
    $native=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('d-gc-program-observer-20261021-r1-'+$mode+'-native.json')) | ConvertFrom-Json
    if($native.exit -ne 0 -or -not $native.postcheck -or $native.source_sha256 -ne $manifest.source_sha256){throw 'Successful terminal validation receipt missing'}
}
Test-DIndexSourceSnapshot -Root (Join-Path $resolved 'source') -Manifest $manifest
foreach($pin in @($manifest.files | Where-Object {$_.path -like 'backend/internal/systembackupgcmetadata/*' -or $_.path -in @('backend/go.mod','backend/go.sum')})){
    if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $pin.path)).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Published input changed before cleanup'}
}
Remove-Item -LiteralPath $resolved -Recurse -Force
if(Test-Path -LiteralPath $resolved){throw 'Owned artifacts remain'}
[ordered]@{kind='d_gc_program_observer_owned_cleanup';owner=$name;absolute_owner=$resolved;removed=$true;process_terminal=$true;source_postcheck=$true;source_sha256=$manifest.source_sha256;dependencies_installed=$false;retained='logs, manifests and review evidence outside owner';recorded_utc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $receipt -Encoding utf8NoBOM
Write-Output ('CLEANED observer-source-cache-tmp-telemetry='+$name)
