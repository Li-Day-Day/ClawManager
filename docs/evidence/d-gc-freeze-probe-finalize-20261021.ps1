$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
$receiptPath=Join-Path $PSScriptRoot 'd-gc-freeze-probe-preparation-20261021.json'
$cleanupPath=Join-Path $PSScriptRoot 'd-gc-freeze-probe-cleanup-20261021.json'
if(Test-Path -LiteralPath $cleanupPath){throw 'Cleanup record already exists'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Owner mismatch'}
$receipt=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($receipt.status -ne 'locally_validated_unpublished_actual_mysql_pending'){throw 'Wrong publication state'}
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-freeze-probe-concurrent-review-20261021.mjs') --revision=9 --check
if($LASTEXITCODE -ne 0){throw 'Concurrent dependency closure changed; preserve current files'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r9-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root (Join-Path $owner 'source') -Manifest $manifest
function HashBytes([byte[]]$Bytes){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
$allowed=@('backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go','scripts/system-backup-d-download-gc-freeze-phase.sh','scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1','backend/internal/systembackupevidence/download_output_deadline_a_test.go','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-config-writer-validation.ps1')
$firstObservation=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-prepublish-current-20261021.json') -Raw|ConvertFrom-Json
$observation=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-prepublish-current-v2-20261021.json') -Raw|ConvertFrom-Json
$baseObservation=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-base-v4-20261021.json') -Raw|ConvertFrom-Json
$buildScope=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-concurrent-scope-20261021-r9.json') -Raw|ConvertFrom-Json
$buildScopePaths=@($buildScope.files|ForEach-Object path)
$outside=@((@($baseObservation.refreshed_unowned_paths)+@($firstObservation.changes|ForEach-Object path)+@($observation.changes|ForEach-Object path))|Where-Object{$_ -cnotin $buildScopePaths}|Sort-Object -Unique)
$checkedFiles=@(Get-DIndexSourceFiles -Root $root|Where-Object{$_ -cnotin $allowed -and $_ -cnotin $outside})
$expectedFiles=@($observation.files|Where-Object{$_.path -cnotin $allowed -and $_.path -cnotin $outside})
if(($checkedFiles -join "`n") -cne (@($expectedFiles|ForEach-Object path) -join "`n")){throw 'Unreviewed current source set changed'}
if((Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $root -Files $checkedFiles)) -cne (Get-DIndexPinDigest -Pins $expectedFiles)){throw 'Unreviewed current source bytes changed'}
if($receipt.changed_files.Count -ne 6){throw 'Wrong publication set'}
foreach($p in $allowed){if(@($receipt.changed_files|Where-Object path -CEQ $p).Count -ne 1){throw 'Wrong publication identity'}}
foreach($p in $allowed){
 $target=[IO.Path]::GetFullPath((Join-Path $root $p))
 if(-not $target.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Publication path escapes workspace'}
 $cursor=[IO.Path]::GetDirectoryName($target)
 while($true){
  if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication directory'}
  if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)
 }
 if((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected publication file'}
}
$streams=@{};$published=[Collections.Generic.List[string]]::new()
try{
 # Lock both existing shared scripts before writing any leaf. A changed file
 # fails this run; the saved before images are never used to overwrite it.
 foreach($pin in @($receipt.changed_files|Where-Object before_exists)){
  $file=Join-Path $root $pin.path
  $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $streams[$pin.path]=$stream
  $memory=[IO.MemoryStream]::new();try{$stream.CopyTo($memory);$bytes=$memory.ToArray()}finally{$memory.Dispose()}
  if((HashBytes $bytes) -cne $pin.before_sha256){throw ('Concurrent publication conflict '+$pin.path)}
 }
 foreach($p in $allowed){
  $pin=$receipt.changed_files|Where-Object path -CEQ $p
  $bytes=[Convert]::FromBase64String($pin.tested_bytes_base64)
  if((HashBytes $bytes) -cne $pin.after_sha256){throw 'Candidate bytes changed'}
  if($pin.before_exists){$stream=$streams[$p];$stream.Position=0;$stream.SetLength(0);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}
  else{$stream=[IO.File]::Open((Join-Path $root $p),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
  $published.Add($p)
 }
}finally{foreach($stream in $streams.Values){$stream.Dispose()}}
foreach($pin in $receipt.changed_files){if((Get-FileHash -LiteralPath (Join-Path $root $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.after_sha256){throw ('Published bytes changed '+$pin.path)}}
$receipt.status='locally_validated_published_actual_mysql_pending'
$receipt|Add-Member -NotePropertyName published_utc -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o')
$receipt|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
Write-Output ('FREEZE_PUBLISHED files='+$published.Count+' actual_mysql=not_run production_approval=no')
# The validation session must already be terminal before invoking this file.
# The resolved exact owner, all parents and every descendant must be local.
$resolved=(Resolve-Path -LiteralPath $owner).Path
if($resolved -cne $owner -or [IO.Path]::GetDirectoryName($resolved) -cne $root -or [IO.Path]::GetFileName($resolved) -cne '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e' -or (Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unsafe cleanup target'}
if(@(Get-ChildItem -LiteralPath $resolved -Force -Recurse|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -ne 0){throw 'Redirected cleanup descendant'}
$deletedCount=@(Get-ChildItem -LiteralPath $resolved -Force -Recurse -File).Count
Remove-Item -LiteralPath $resolved -Recurse -Force
if(Test-Path -LiteralPath $resolved){throw 'CLEANUP_PENDING exact freeze owner'}
[ordered]@{kind='d_gc_freeze_prerequisite_cleanup';owner=$resolved;removed=$true;files_removed=$deletedCount;validation_native_exit=0;source_cache_tmp_telemetry_windows_linux_migration_binaries_removed=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;production_approved=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $cleanupPath -Encoding utf8NoBOM
Write-Output 'FREEZE_CLEANED exact-owner=yes build-cache=yes tmp=yes binaries=yes dependencies-installed=no'
