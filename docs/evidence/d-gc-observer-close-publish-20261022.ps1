$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$receiptPath=Join-Path $PSScriptRoot 'd-gc-observer-close-preparation-20261022.json'
$r=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($r.status -cne 'locally_validated_unpublished'){throw 'Wrong publication state'}
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-observer-close-base-20261022.json') -Raw|ConvertFrom-Json
$catalog='backend/internal/systembackupgcmetadata/catalog.go'
$test='backend/internal/systembackupgcmetadata/connection_close_test.go'
if($r.changed_files.Count -ne 2 -or ($r.changed_files.path -join '|') -cne ($catalog+'|'+$test)){throw 'Wrong publication set'}
$dir=Join-Path $root 'backend/internal/systembackupgcmetadata'
if(@(Get-ChildItem -LiteralPath $dir -File -Force).Count -ne 4){throw 'Concurrent package source set changed'}
$cursor=$dir
while($true){
 if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication path'}
 if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)
}
foreach($p in $base.files){
 $file=Join-Path $root $p.path
 if((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected input'}
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.sha256){throw ('Concurrent input change '+$p.path)}
}
function HashBytes([byte[]]$bytes){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
$pin=$r.changed_files|Where-Object path -CEQ $catalog
$stream=[IO.File]::Open((Join-Path $root $catalog),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
 $memory=[IO.MemoryStream]::new()
 try{$stream.CopyTo($memory);$before=$memory.ToArray()}finally{$memory.Dispose()}
 if((HashBytes $before) -cne $pin.before_sha256){throw 'Concurrent catalog change'}
 foreach($item in $r.changed_files){if((HashBytes ([Convert]::FromBase64String($item.tested_bytes_base64))) -cne $item.after_sha256){throw 'Tested bytes changed'}}
 $new=$r.changed_files|Where-Object path -CEQ $test
 $newBytes=[Convert]::FromBase64String($new.tested_bytes_base64)
 $newStream=[IO.File]::Open((Join-Path $root $test),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$newStream.Write($newBytes,0,$newBytes.Length);$newStream.Flush($true)}finally{$newStream.Dispose()}
 $bytes=[Convert]::FromBase64String($pin.tested_bytes_base64)
 $stream.Position=0;$stream.SetLength(0);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
}finally{$stream.Dispose()}
foreach($p in $r.changed_files){if((Get-FileHash -LiteralPath (Join-Path $root $p.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.after_sha256){throw 'Published bytes changed'}}
$r.status='locally_validated_published_postcheck_pending'
$r|Add-Member -NotePropertyName published_utc -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o')
$r|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
Write-Output 'OBSERVER_CLOSE_PUBLISHED files=2 actual_mysql=not_run freeze=not_enabled'
