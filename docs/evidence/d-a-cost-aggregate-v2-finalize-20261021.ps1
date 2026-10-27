param([ValidateSet('publish','cleanup')][string]$Action)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096'
$owner=[IO.Path]::GetFullPath((Join-Path $root $name))
if([IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.Path]::GetFileName($owner) -ne $name -or (Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne $name){throw 'Wrong owned directory'}
$source=Join-Path $owner 'source'
$receiptPath=Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-preparation-20261021.json'
$receipt=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($receipt.kind -ne 'd_a_cost_aggregate_preparation' -or $receipt.changes.Count -ne 14){throw 'Wrong receipt'}
foreach($run in $receipt.validation.stages){$n=Get-Content -LiteralPath (Join-Path $root $run.native.path) -Raw|ConvertFrom-Json;if($n.exit -ne 0 -or -not$n.source_postcheck -or $n.source_sha256 -ne $receipt.source_sha256){throw 'Validation not complete'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$full=@($receipt.validation.stages|Where-Object stage -eq 'full')[0]
$manifest=Get-Content -LiteralPath (Join-Path $root $full.source.path) -Raw|ConvertFrom-Json
function Hash([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Target([string]$relative){
 $p=[IO.Path]::GetFullPath((Join-Path $root $relative));if(-not$p.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Target escapes workspace'}
 $cursor=[IO.Path]::GetDirectoryName($p)
 while($cursor -ne $root){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication parent'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
 if((Test-Path -LiteralPath $p) -and (Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication file'}
 return $p
}
if($Action -eq 'publish'){
 if($receipt.status -ne 'locally_validated_pending_guarded_publication'){throw 'Wrong publication lifecycle'}
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 $current=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
 $map=@{};foreach($p in $manifest.files){$map[$p.path]=$p}
 $currentMap=@{};foreach($p in $current){$currentMap[$p.path]=$p}
 $owned=@($receipt.changes|ForEach-Object path)
 $tagged=@($receipt.validation.stages|Where-Object stage -eq 'tagged')[0]
 $dirs=@($tagged.local_dependency_directories)
 if($dirs.Count -eq 0){throw 'Missing compiled local dependency scope'}
 $unowned=@()
 $concurrentPath=Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-concurrent-publish-review-v3-20261021.json'
 $concurrent=Get-Content -LiteralPath $concurrentPath -Raw|ConvertFrom-Json
 $liveOnlyPattern='^scripts/system-backup-a-live-chain(?:[-.][a-z0-9.-]+)?\.(?:mjs|ps1|sh)$'
 if($concurrent.status -ne 'source_assessment_preserve_unowned_not_test_acceptance' -or $concurrent.frozen_source_sha256 -ne $receipt.source_sha256 -or $concurrent.allowed_path_pattern -ne $liveOnlyPattern -or $concurrent.tested_node_closure_references_live_tools -ne $false -or $concurrent.compiled_go_source_references_live_tools -ne $false){throw 'Wrong concurrent source assessment'}
 foreach($relative in @(@($map.Keys)+@($currentMap.Keys)|Sort-Object -Unique)){
  if($owned -contains $relative){continue}
  $expected=if($map.ContainsKey($relative)){$map[$relative].sha256}else{$null}
  $actual=if($currentMap.ContainsKey($relative)){$currentMap[$relative].sha256}else{$null}
  if($expected -eq $actual){continue}
  $critical=$relative -in @('backend/go.mod','backend/go.sum') -or $relative.StartsWith('contracts/') -or $relative.StartsWith('scripts/') -or $relative -match '^docs/[^/]+\.sql$' -or $relative -eq 'docs/system-backup-restore-schema-inventory.json'
  foreach($d in $dirs){if($relative.StartsWith($d+'/',[StringComparison]::OrdinalIgnoreCase)){$critical=$true}}
  if($critical){
   if($relative -notmatch $liveOnlyPattern -or $actual -notmatch '^[0-9a-f]{64}$'){throw ('Concurrent validation-input change needs review: '+$relative)}
  }
  $unowned+=@{path=$relative;frozen_sha256=$expected;published_sha256=$actual}
 }
 $extra=Get-Content -LiteralPath (Join-Path $root $receipt.node_extra_inputs.path) -Raw|ConvertFrom-Json
 if($concurrent.frontend_read_scope.Count -ne 1 -or $concurrent.frontend_read_scope[0] -ne 'frontend/src/types/systemBackupContract.ts'){throw 'Wrong frontend dependency assessment'}
 $extraDifferences=@()
 foreach($p in $extra.files){
  $actual=if(Test-Path -LiteralPath (Join-Path $root $p.path)){Hash (Join-Path $root $p.path)}else{$null}
  if($actual -eq $p.sha256){continue}
  if($p.path.StartsWith('frontend/') -and $p.path -notin $concurrent.frontend_read_scope){$extraDifferences+=@{path=$p.path;frozen_sha256=$p.sha256;observed_sha256=$actual};continue}
  throw ('Concurrent extra input changed: '+$p.path)
 }
 foreach($p in $receipt.changes){
  $dst=Target $p.path;$src=Join-Path $source $p.path
  if((Hash $src) -ne $p.after_sha256){throw 'Candidate bytes changed'}
  if($null -eq $p.before_sha256){if(Test-Path -LiteralPath $dst){throw ('New target occupied: '+$p.path)}}elseif((Hash $dst) -ne $p.before_sha256){throw ('Concurrent target changed: '+$p.path)}
 }
 foreach($p in $receipt.changes){
  $dst=Target $p.path
  if($null -ne $p.before_sha256 -and (Hash $dst) -ne $p.before_sha256){throw 'Target changed at publication boundary'}
  [IO.File]::WriteAllBytes($dst,[IO.File]::ReadAllBytes((Join-Path $source $p.path)))
  if((Hash $dst) -ne $p.after_sha256){throw 'Publication digest mismatch'}
 }
 $publishedPins=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
 $published=[ordered]@{kind='d_a_cost_aggregate_published_context';source_sha256=(Get-DIndexPinDigest -Pins $publishedPins);frozen_source_sha256=$receipt.source_sha256;files=$publishedPins;unowned_differences=$unowned;unowned_extra_differences=$extraDifferences;context_is_observation_not_test_snapshot=$true;owned_files=$owned;dependencies_installed=$false;remote=$false}
 $contextPath=Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-published-context-20261021.json'
 if(Test-Path -LiteralPath $contextPath){throw 'Published context exists'}
 $published|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $contextPath -Encoding utf8NoBOM
 $receipt.status='locally_validated_published_pending_cleanup'
 $receipt|Add-Member -NotePropertyName publication -NotePropertyValue @{context='docs/evidence/d-a-cost-aggregate-v2-published-context-20261021.json';context_sha256=(Hash $contextPath);published_source_sha256=$published.source_sha256;exact_frozen_context=($published.source_sha256 -eq $receipt.source_sha256);unowned_differences=$unowned;unowned_extra_differences=$extraDifferences;concurrent_review_path='docs/evidence/d-a-cost-aggregate-v2-concurrent-publish-review-v3-20261021.json';concurrent_review_sha256=(Hash $concurrentPath);owned_files=14;module_and_compiled_dependency_scope_checked=$true}
 $receipt|ConvertTo-Json -Depth 15|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
 Write-Output ('COST_PUBLISHED files=14 exact_context='+($published.source_sha256 -eq $receipt.source_sha256)+' unowned_differences='+$unowned.Count)
}else{
 if($receipt.status -ne 'locally_validated_published_pending_cleanup'){throw 'Wrong cleanup lifecycle'}
 foreach($p in $receipt.changes){if((Hash (Target $p.path)) -ne $p.after_sha256){throw 'Published source changed before cleanup'}}
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 $items=@(Get-ChildItem -LiteralPath $owner -Force -Recurse)
 if(@($items|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -ne 0){throw 'Redirected owned artifact'}
 $files=@($items|Where-Object {-not $_.PSIsContainer})
 $ownedBytes=($files|Measure-Object -Property Length -Sum).Sum
 foreach($item in $items){if($item.Attributes -band [IO.FileAttributes]::ReadOnly){$item.Attributes=$item.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly)}}
 Remove-Item -LiteralPath $owner -Recurse -Force
 if(Test-Path -LiteralPath $owner){throw 'Owned artifacts remain'}
 $cleanupPath=Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-cleanup-20261021.json'
 [ordered]@{kind='d_a_cost_aggregate_cleanup';owner=$owner;removed=$true;owned_files_removed=$files.Count;owned_bytes_removed=$ownedBytes;published_files=14;dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $cleanupPath -Encoding utf8NoBOM
 $receipt.status='locally_validated_published_cleaned_actual_mysql_pending'
 $receipt|Add-Member -NotePropertyName cleanup -NotePropertyValue @{path='docs/evidence/d-a-cost-aggregate-v2-cleanup-20261021.json';sha256=(Hash $cleanupPath);removed=$true}
 $receipt|ConvertTo-Json -Depth 15|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
 Write-Output 'COST_CLEANED owner=True dependencies_installed=False remote=False'
}
