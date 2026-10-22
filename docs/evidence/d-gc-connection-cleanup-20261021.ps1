param([switch]$ValidationSessionsTerminal)
$ErrorActionPreference='Stop'
if(-not $ValidationSessionsTerminal){throw 'Confirm target/full/published tool handles terminal first'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-83cd6bed3e644a098defa87b015f3b43'
$owner=(Resolve-Path -LiteralPath (Join-Path $root $name)).Path
$out=Join-Path $PSScriptRoot 'd-gc-connection-cleanup-20261021.json'
if(Test-Path -LiteralPath $out){throw 'Refusing existing cleanup receipt'}
if([IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.Path]::GetFileName($owner) -ne $name -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne $name){throw 'Wrong exact owned cleanup path'}
if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
if(@(Get-ChildItem -LiteralPath $owner -Force -Recurse|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}|Select-Object -First 1).Count){throw 'Redirected owned child'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-connection-20261021-r2-full-source.json')|ConvertFrom-Json
foreach($stage in @('target','full','published')){
    $native=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('d-gc-connection-20261021-r2-'+$stage+'-native.json'))|ConvertFrom-Json
    if($native.exit -ne 0 -or -not$native.source_postcheck -or $native.source_sha256 -ne $manifest.source_sha256){throw 'Successful matching validation missing'}
}
Test-DIndexSourceSnapshot -Root (Join-Path $owner 'source') -Manifest $manifest
$names=@('download_retention_gc.go','download_retention_gc_test.go','download_retention_gc_connection.go','download_retention_gc_connection_test.go','system_publish_runtime_test.go')
$paths=@($names|ForEach-Object{'backend/internal/systembackupevidence/'+$_})+@('backend/go.mod','backend/go.sum')
foreach($pin in $manifest.files){if($paths -contains $pin.path){if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $pin.path)).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Published source changed before cleanup'}}}
Remove-Item -LiteralPath $owner -Recurse -Force
if(Test-Path -LiteralPath $owner){throw 'Owned artifacts remain'}
[ordered]@{kind='d_gc_connection_owned_cleanup';owner=$name;absolute_owner=$owner;removed=$true;source_postcheck=$true;process_terminal=$true;source_sha256=$manifest.source_sha256;dependencies_installed=$false;retained='logs, source manifests and review evidence';recorded_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output ('CLEANED gc-connection-source-cache-tmp-telemetry='+$name)
