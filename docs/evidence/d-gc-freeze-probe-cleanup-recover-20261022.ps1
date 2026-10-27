$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$name='.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
$owner=[IO.Path]::GetFullPath((Join-Path $root $name))
$record=Join-Path $PSScriptRoot 'd-gc-freeze-probe-cleanup-20261021.json'
if(Test-Path -LiteralPath $record){throw 'Existing cleanup receipt'}
$r=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-preparation-20261021.json') -Raw|ConvertFrom-Json
if($r.status -cne 'locally_validated_published_actual_mysql_pending'){throw 'Publication not verified'}
foreach($revision in @(8,9)){
 $v=Get-Content -LiteralPath (Join-Path $PSScriptRoot ("d-gc-freeze-probe-20261021-r$revision-native.json")) -Raw|ConvertFrom-Json
 if($v.exit -ne 0 -or $v.source_postcheck -ne $true){throw 'Validation not successfully terminal'}
}
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-freeze-probe-review-v9-20261021.mjs') --check
if($LASTEXITCODE -ne 0){throw 'Published proof changed'}
$resolved=(Resolve-Path -LiteralPath $owner).Path
if($resolved -cne $owner -or [IO.Path]::GetDirectoryName($resolved) -cne $root -or [IO.Path]::GetFileName($resolved) -cne $name){throw 'Unsafe cleanup location'}
if([IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne $name){throw 'Owner marker mismatch'}
if((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
$items=@(Get-ChildItem -LiteralPath $resolved -Force -Recurse)
if(@($items|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -ne 0){throw 'Redirected descendant'}
$count=@($items|Where-Object{-not $_.PSIsContainer}).Count
Remove-Item -LiteralPath $resolved -Recurse -Force
if(Test-Path -LiteralPath $resolved){throw 'CLEANUP_PENDING exact owner'}
[ordered]@{kind='d_gc_freeze_prerequisite_cleanup';owner=$resolved;removed=$true;files_removed=$count;validation_native_exit=0;source_cache_tmp_telemetry_windows_linux_migration_binaries_removed=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;production_approved=$false;recovery_after_publication=$true;previous_native_handle_missing=54674;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $record -Encoding utf8NoBOM
Write-Output 'FREEZE_CLEANED exact-owner=yes build-cache=yes tmp=yes binaries=yes dependencies-installed=no'
