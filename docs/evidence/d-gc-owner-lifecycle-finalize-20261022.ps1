$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$receiptPath=Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-preparation-20261022.json'
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-review-20261022.mjs') --precleanup
if($LASTEXITCODE -ne 0){throw 'Post-publication validation failed; preserve owner'}
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner)
$expected='.tmp-d-index-cache-3d426c330a554ab298d97639612abb42'
if([IO.Path]::GetFileName($owner) -cne $expected -or [IO.Path]::GetDirectoryName($owner) -cne $root){throw 'Wrong cleanup directory'}
$item=Get-Item -LiteralPath $owner -Force
if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected cleanup directory'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne $expected){throw 'Wrong cleanup marker'}
$children=@(Get-ChildItem -LiteralPath $owner -Recurse -Force)
foreach($entry in $children){if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $entry.FullName.StartsWith($owner+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Redirected cleanup child'}}
$count=@($children|Where-Object{-not $_.PSIsContainer}).Count
Remove-Item -LiteralPath $owner -Recurse -Force
if(Test-Path -LiteralPath $owner){throw 'Incomplete cleanup'}
$cleanup='docs/evidence/d-gc-owner-lifecycle-cleanup-20261022.json'
[ordered]@{kind='d_gc_owner_lifecycle_exact_owner_cleanup';owner=$owner;removed=$true;files_removed=$count;source_removed=$true;cache_removed=$true;tmp_removed=$true;telemetry_removed=$true;test_build_artifacts_removed=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $root $cleanup) -Encoding utf8NoBOM
$r=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
$r.status='locally_validated_published_cleaned_actual_mysql_pending'
$r|Add-Member -NotePropertyName cleanup -NotePropertyValue $cleanup
$extra=@($cleanup,'docs/evidence/d-gc-owner-lifecycle-review-20261022.mjs','docs/evidence/d-gc-owner-lifecycle-publish-20261022.ps1','docs/evidence/d-gc-owner-lifecycle-finalize-20261022.ps1')
foreach($suffix in @('-dispatch.stdout','-dispatch.stderr','-full.stdout','-full.stderr','-native.json')){$extra+=('docs/evidence/d-gc-owner-lifecycle-20261022-published'+$suffix)}
foreach($p in $extra){$file=Join-Path $root $p;$r.evidence+=@([pscustomobject]@{path=$p;size=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()})}
$r|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-review-20261022.mjs') --check
if($LASTEXITCODE -ne 0){throw 'Final lifecycle review failed'}
Write-Output ('GC_OWNER_LIFECYCLE_CLEANED removed=True files='+$count+' dependencies-installed=no actual-mysql=not-run')
