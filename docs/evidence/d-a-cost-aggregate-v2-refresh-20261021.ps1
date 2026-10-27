$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner)){throw 'Wrong owner'}
$source=Join-Path $owner 'source'
$out=Join-Path $PSScriptRoot 'd-a-cost-aggregate-v3-base-20261021.json'
$refreshOut=Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-concurrent-refresh-20261021.json'
if((Test-Path -LiteralPath $out) -or (Test-Path -LiteralPath $refreshOut)){throw 'Refresh evidence exists'}
$native=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-20261021-r1-full-native.json') -Raw|ConvertFrom-Json
if(-not $native.source_postcheck){throw 'First run did not finish its source postcheck'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$first=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-20261021-r1-full-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $first
$original=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-base-20261021.json') -Raw|ConvertFrom-Json
$draft=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-unverified-draft-20261021.json') -Raw|ConvertFrom-Json
$owned=@($draft.changes|ForEach-Object path)+@('backend/internal/systembackupbusinessa/cost_aggregate_test.go','scripts/system-backup-contract-artifacts.test.mjs')
$old=@{};foreach($p in $original.files){$old[$p.path]=$p}
foreach($p in $owned){$dst=Join-Path $root $p;if($old.ContainsKey($p)){if((Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash.ToLowerInvariant() -ne $old[$p].sha256){throw ('Concurrent owned conflict '+$p)}}elseif(Test-Path -LiteralPath $dst){throw ('New owned path occupied '+$p)}}
$pins=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
$next=@{};foreach($p in $pins){$next[$p.path]=$p}
$changes=@()
foreach($p in $first.files){
 if($owned -contains $p.path -or $next.ContainsKey($p.path)){continue}
 $dst=[IO.Path]::GetFullPath((Join-Path $source $p.path))
 if(-not $dst.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Private removal escapes owner'}
 (Get-Item -LiteralPath $dst).IsReadOnly=$false
 Remove-Item -LiteralPath $dst -Force
 $changes+=@{path=$p.path;before_sha256=$p.sha256;after_sha256=$null}
}
foreach($p in $pins){
 if($owned -contains $p.path){continue}
 $src=Join-Path $root $p.path;$dst=Join-Path $source $p.path
 $prior=if(Test-Path -LiteralPath $dst){(Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash.ToLowerInvariant()}else{$null}
 if($prior -eq $p.sha256){continue}
 if((Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Source changed during refresh'}
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dst))|Out-Null
 if(Test-Path -LiteralPath $dst){(Get-Item -LiteralPath $dst).IsReadOnly=$false}
 [IO.File]::WriteAllBytes($dst,[IO.File]::ReadAllBytes($src))
 if((Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Private refresh digest mismatch'}
 (Get-Item -LiteralPath $dst).IsReadOnly=$true
 $changes+=@{path=$p.path;before_sha256=$prior;after_sha256=$p.sha256}
}
$base=[ordered]@{kind='d_index_group_source_snapshot';version=1;source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins}
$base|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
$extraOld=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-extra-inputs-20261021.json') -Raw|ConvertFrom-Json
$extra=Get-DIndexInputPins -Root $root -Files @($extraOld.files|ForEach-Object path)
foreach($p in $extra){$dst=Join-Path $source $p.path;if(Test-Path -LiteralPath $dst){(Get-Item -LiteralPath $dst).IsReadOnly=$false};[IO.File]::WriteAllBytes($dst,[IO.File]::ReadAllBytes((Join-Path $root $p.path)));(Get-Item -LiteralPath $dst).IsReadOnly=$true}
$copied=Get-DIndexInputPins -Root $source -Files @($extra|ForEach-Object path)
if((Get-DIndexPinDigest -Pins $copied) -ne (Get-DIndexPinDigest -Pins $extra)){throw 'Extra inputs changed during refresh'}
[ordered]@{kind='d_a_cost_node_extra_inputs';source_sha256=(Get-DIndexPinDigest -Pins $extra);files=$extra}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-v3-extra-inputs-20261021.json') -Encoding utf8NoBOM
[ordered]@{kind='d_a_cost_concurrent_refresh';original_base_source_sha256=$original.source_sha256;next_base_source_sha256=$base.source_sha256;first_run_exit=$native.exit;first_run_postcheck=$native.source_postcheck;refreshed=$changes;owned_paths_preserved=$owned;dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $refreshOut -Encoding utf8NoBOM
Write-Output ('COST_REFRESH files='+$pins.Count+' changed='+$changes.Count+' base='+$base.source_sha256)
