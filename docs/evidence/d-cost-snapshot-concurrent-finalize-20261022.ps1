$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$receiptPath=Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-preparation-20261022.json'
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-review-20261022.mjs') --precleanup
if($LASTEXITCODE -ne 0){throw 'Publication postcheck failed; retain exact owner'}
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-base-20261022.json') -Raw|ConvertFrom-Json
$expected='.tmp-d-index-cache-8155571ac24945128752f25b204346f0'
$owner=[IO.Path]::GetFullPath($base.owner)
if([IO.Path]::GetFileName($owner) -cne $expected -or [IO.Path]::GetDirectoryName($owner) -cne $root){throw 'Unexpected cleanup directory'}
$item=Get-Item -LiteralPath $owner -Force
if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected cleanup directory'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne $expected){throw 'Wrong cleanup owner marker'}
$descendants=@(Get-ChildItem -LiteralPath $owner -Recurse -Force)
foreach($entry in $descendants){
 if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cleanup child'}
 if(-not $entry.FullName.StartsWith($owner+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Cleanup child escaped owner'}
}
$count=@($descendants|Where-Object{-not $_.PSIsContainer}).Count
Remove-Item -LiteralPath $owner -Recurse -Force
if(Test-Path -LiteralPath $owner){throw 'Owner cleanup incomplete'}
$cleanupRelative='docs/evidence/d-cost-snapshot-concurrent-cleanup-20261022.json'
[ordered]@{kind='d_cost_snapshot_concurrent_exact_owner_cleanup';owner=$owner;removed=$true;files_removed=$count;source_removed=$true;cache_removed=$true;tmp_removed=$true;telemetry_removed=$true;windows_linux_probe_and_migration_binaries_removed=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $root $cleanupRelative) -Encoding utf8NoBOM
$r=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
$r.status='locally_validated_published_cleaned_actual_mysql_pending'
$r|Add-Member -NotePropertyName cleanup -NotePropertyValue $cleanupRelative
$extra=@($cleanupRelative,'docs/evidence/d-cost-snapshot-concurrent-publish-20261022.ps1','docs/evidence/d-cost-snapshot-concurrent-finalize-20261022.ps1','docs/evidence/d-cost-snapshot-concurrent-review-20261022.mjs')
foreach($suffix in @('source.json','native.json','full-business.stdout','full-business.stderr')){$extra+=('docs/evidence/d-cost-snapshot-concurrent-20261022-published-'+$suffix)}
foreach($p in $extra){$file=Join-Path $root $p;$r.evidence+=@([pscustomobject]@{path=$p;size=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()})}
$r|ConvertTo-Json -Depth 14|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-review-20261022.mjs') --check
if($LASTEXITCODE -ne 0){throw 'Final cost receipt review failed'}
Write-Output ('COST_SNAPSHOT_CLEANED removed=True files='+$count+' dependencies-installed=no actual-mysql=not-run')
