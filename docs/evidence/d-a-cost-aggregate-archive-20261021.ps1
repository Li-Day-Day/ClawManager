$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-fcbe917bab97480c984627d1268b3d9d'
$owner=(Resolve-Path -LiteralPath (Join-Path $root $name)).Path
if([IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.Path]::GetFileName($owner) -ne $name -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne $name){throw 'Wrong cost draft owner'}
if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cost owner'}
if(@(Get-ChildItem -LiteralPath $owner -Force -Recurse|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}|Select-Object -First 1).Count){throw 'Redirected draft child'}
if(@(Get-ChildItem -LiteralPath $owner -Force|Where-Object {$_.Name -notin @('source','owner.txt')}).Count){throw 'Unexpected cost owner files'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$basePath=Join-Path $PSScriptRoot 'd-a-cost-aggregate-base-20261021.json';$base=Get-Content -Raw -LiteralPath $basePath|ConvertFrom-Json
$source=Join-Path $owner 'source';$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$before=@{};foreach($p in $base.files){$before[$p.path]=$p}
$changes=@(foreach($p in $pins){if(-not $before.ContainsKey($p.path) -or $before[$p.path].sha256 -ne $p.sha256){[ordered]@{path=$p.path;before_sha256=$(if($before.ContainsKey($p.path)){$before[$p.path].sha256}else{$null});after_sha256=$p.sha256;size=$p.size;content=[IO.File]::ReadAllText((Join-Path $source $p.path))}}})
if($changes.Count -ne 12 -or $pins.Count -ne $base.files.Count+1){throw 'Unexpected draft file set'}
$out=Join-Path $PSScriptRoot 'd-a-cost-aggregate-unverified-draft-20261021.json';if(Test-Path -LiteralPath $out){throw 'Draft archive exists'}
$digest=Get-DIndexPinDigest -Pins $pins
[ordered]@{kind='d_a_cost_aggregate_unverified_draft';status='incomplete_not_compiled_not_tested_not_published';base_manifest='d-a-cost-aggregate-base-20261021.json';base_manifest_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $basePath).Hash.ToLowerInvariant();base_source_sha256=$base.source_sha256;candidate_source_sha256=$digest;changes=$changes;dependencies_installed=$false;remote=$false;production_approved=$false;remaining=@('finish independent fixtures and regression tests','fix nullable SQL violation aggregation before testing','rebase catalog/fixture inputs onto the 081 repair','validate complete ordinary and tagged scope before any publication')}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
$saved=Get-Content -Raw -LiteralPath $out|ConvertFrom-Json
foreach($p in $saved.changes){$h=[Security.Cryptography.SHA256]::Create();try{$hash=([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($p.content)))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()};if($hash -ne $p.after_sha256){throw 'Draft archive bytes changed'}}
$after=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source);if((Get-DIndexPinDigest -Pins $after) -ne $digest){throw 'Draft changed during archival'}
Remove-Item -LiteralPath $owner -Recurse -Force
if(Test-Path -LiteralPath $owner){throw 'Draft source remains'}
[ordered]@{kind='d_a_cost_draft_cleanup';absolute_owner=$owner;archive='d-a-cost-aggregate-unverified-draft-20261021.json';archive_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $out).Hash.ToLowerInvariant();unverified_changes=$saved.changes.Count;removed=$true;test_or_build_started=$false;published=$false;dependencies_installed=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-draft-cleanup-20261021.json') -Encoding utf8NoBOM
Write-Output 'COST_DRAFT archived=12 unverified=yes published=no exact_owned_source_removed=yes'
