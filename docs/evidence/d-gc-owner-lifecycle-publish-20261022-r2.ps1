$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$receiptPath=Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-preparation-20261022-r2.json'
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-review-20261022-r2.mjs') --before-publish
if($LASTEXITCODE -ne 0){throw 'Publication preimages or input scope changed'}
$r=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
$expected=@('backend/internal/systembackupevidence/download_gc_owner_lifecycle_wire_test.go','backend/internal/systembackupevidence/download_gc_owner_lifecycle_mysql_test.go','scripts/system-backup-d-download-gc-freeze-phase.sh','scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1')
if(($r.changed_files.path -join '|') -cne ($expected -join '|')){throw 'Wrong publication set'}
foreach($directory in @('backend/internal/systembackupevidence','scripts')){
 $cursor=Join-Path $root $directory
 while($true){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication directory'};if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)}
}
function HashBytes([byte[]]$b){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
$opened=[Collections.Generic.List[object]]::new()
try{
 foreach($p in $r.changed_files){
  $bytes=[Convert]::FromBase64String($p.tested_bytes_base64)
  if((HashBytes $bytes) -cne $p.after_sha256){throw 'Candidate archive mismatch'}
  if(-not $p.before_exists){continue}
  $file=Join-Path $root $p.path
  if((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected original target'}
  $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $opened.Add([pscustomobject]@{pin=$p;stream=$stream})
  $memory=[IO.MemoryStream]::new();try{$stream.CopyTo($memory);$before=$memory.ToArray()}finally{$memory.Dispose()}
  if((HashBytes $before) -cne $p.before_sha256){throw 'Concurrent target change; preserve shared files'}
 }
 foreach($p in $r.changed_files|Where-Object{-not $_.before_exists}){
  $bytes=[Convert]::FromBase64String($p.tested_bytes_base64)
  $stream=[IO.File]::Open((Join-Path $root $p.path),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 }
 foreach($entry in $opened){$bytes=[Convert]::FromBase64String($entry.pin.tested_bytes_base64);$entry.stream.Position=0;$entry.stream.SetLength(0);$entry.stream.Write($bytes,0,$bytes.Length);$entry.stream.Flush($true)}
}finally{foreach($entry in $opened){$entry.stream.Dispose()}}
foreach($p in $r.changed_files){if((Get-FileHash -LiteralPath (Join-Path $root $p.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.after_sha256){throw 'Published target changed'}}
$r.status='locally_validated_published_postcheck_pending'
$r|Add-Member -NotePropertyName published_utc -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o')
$r|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
Write-Output 'GC_OWNER_LIFECYCLE_PUBLISHED test-files=2 scripts=2 freeze-adapter=not-wired actual-mysql=not-run'
