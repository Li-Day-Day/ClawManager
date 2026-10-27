$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$owner=Join-Path $root '.tmp-d-index-cache-d8299479984a4e9bbd38d90d5761c67d'
$receiptPath=Join-Path $PSScriptRoot 'd-gc-observer-close-preparation-20261022.json'
$cleanupPath=Join-Path $PSScriptRoot 'd-gc-observer-close-cleanup-20261022.json'
if(Test-Path -LiteralPath $cleanupPath){throw 'Existing cleanup record'}
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-observer-close-review-20261022.mjs') --precleanup
if($LASTEXITCODE -ne 0){throw 'Published validation incomplete or input drift'}
$resolved=(Resolve-Path -LiteralPath $owner).Path
if($resolved -cne $owner -or [IO.Path]::GetDirectoryName($resolved) -cne $root -or [IO.Path]::GetFileName($resolved) -cne '.tmp-d-index-cache-d8299479984a4e9bbd38d90d5761c67d'){throw 'Unsafe cleanup target'}
if([IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved)){throw 'Wrong owner marker'}
if((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
$items=@(Get-ChildItem -LiteralPath $resolved -Recurse -Force)
if(@($items|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -ne 0){throw 'Redirected descendant'}
$count=@($items|Where-Object{-not $_.PSIsContainer}).Count
Remove-Item -LiteralPath $resolved -Recurse -Force
if(Test-Path -LiteralPath $resolved){throw 'CLEANUP_PENDING exact observer owner'}
[ordered]@{kind='d_gc_observer_close_cleanup';owner=$resolved;removed=$true;files_removed=$count;source_cache_tmp_telemetry_binaries_removed=$true;dependencies_installed=$false;remote_executed=$false;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $cleanupPath -Encoding utf8NoBOM
$r=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
$r.status='locally_validated_published_cleaned'
$extra=@('d-gc-observer-close-cleanup-20261022.json','d-gc-observer-close-publish-20261022.ps1','d-gc-observer-close-finalize-20261022.ps1','d-gc-observer-close-review-20261022.mjs')+@('-source.json','-native.json','.jsonl','.stderr'|ForEach-Object{'d-gc-observer-close-20261022-v2-published'+$_})
foreach($name in $extra){$file=Join-Path $PSScriptRoot $name;$r.evidence+=@([pscustomobject]@{path=('docs/evidence/'+$name);sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item -LiteralPath $file).Length})}
$r|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
Write-Output ('OBSERVER_CLOSE_CLEANED exact-owner=yes files='+$count+' dependencies-installed=no')
