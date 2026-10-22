$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$receiptPath=Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-preparation-20261022.json'
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-review-20261022.mjs') --before-publish
if($LASTEXITCODE -ne 0){throw 'Concurrent input change; preserve shared files'}
$r=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
$existing='backend/internal/systembackupbusinessa/restore_rows_mysql_test.go'
$new=@('backend/internal/systembackupbusinessa/cost_snapshot_hook_test.go','backend/internal/systembackupbusinessa/cost_snapshot_concurrent_mysql_test.go')
if($r.changed_files.Count -ne 3 -or ($r.changed_files.path -join '|') -cne ((@($existing)+$new) -join '|')){throw 'Wrong publication set'}
$dir=Join-Path $root 'backend/internal/systembackupbusinessa'
$cursor=$dir
while($true){
 if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication directory'}
 if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)
}
function HashBytes([byte[]]$b){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
$pin=$r.changed_files|Where-Object path -CEQ $existing
if((Get-Item -LiteralPath (Join-Path $root $existing) -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected original test'}
$stream=[IO.File]::Open((Join-Path $root $existing),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
 $memory=[IO.MemoryStream]::new()
 try{$stream.CopyTo($memory);$before=$memory.ToArray()}finally{$memory.Dispose()}
 if((HashBytes $before) -cne $pin.before_sha256){throw 'Concurrent existing probe change'}
 foreach($p in $r.changed_files){if((HashBytes ([Convert]::FromBase64String($p.tested_bytes_base64))) -cne $p.after_sha256){throw 'Candidate byte mismatch'}}
 foreach($name in $new){
  $p=$r.changed_files|Where-Object path -CEQ $name
  $bytes=[Convert]::FromBase64String($p.tested_bytes_base64)
  $created=[IO.File]::Open((Join-Path $root $name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$created.Write($bytes,0,$bytes.Length);$created.Flush($true)}finally{$created.Dispose()}
 }
 $bytes=[Convert]::FromBase64String($pin.tested_bytes_base64)
 $stream.Position=0;$stream.SetLength(0);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
}finally{$stream.Dispose()}
foreach($p in $r.changed_files){if((Get-FileHash -LiteralPath (Join-Path $root $p.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.after_sha256){throw 'Published bytes changed'}}
$r.status='locally_validated_published_postcheck_pending_actual_mysql'
$r|Add-Member -NotePropertyName published_utc -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o')
$r|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
Write-Output 'COST_SNAPSHOT_PUBLISHED test-files=3 production-files=0 actual_mysql=not_run'
