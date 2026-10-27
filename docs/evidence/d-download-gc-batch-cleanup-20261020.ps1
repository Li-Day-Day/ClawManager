$ErrorActionPreference='Stop'
$batchRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$batchOutput=Join-Path $PSScriptRoot 'd-download-gc-batch-cleanup-20261020.json'
if(Test-Path -LiteralPath $batchOutput){throw 'Refusing to overwrite cleanup evidence'}
$batchPaths=@()
foreach($batchRevision in @('r1','r3')){
    $batchNative=[IO.File]::ReadAllText((Join-Path $PSScriptRoot ('d-download-gc-batch-20261020-'+$batchRevision+'-native.txt')))
    if($batchNative -notmatch 'd_admission_native_exit=0' -or $batchNative -notmatch 'CLEANED snapshot=True'){throw 'Native run did not report terminal successful cleanup'}
    $batchMatches=[regex]::Matches($batchNative,'(?m)^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\r?$')
    if($batchMatches.Count -ne 1){throw 'Ambiguous native source owner'}
    $batchOwner=$batchMatches[0].Groups[1].Value.Trim()
    if([IO.Path]::GetDirectoryName($batchOwner) -cne $batchRoot -or [IO.Path]::GetFileName($batchOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Unexpected native source ownership path'}
    if(Test-Path -LiteralPath $batchOwner){throw 'Inspect native cleanup failure before deleting a residual source directory'}
    $batchPaths+=@{path=$batchOwner;exists=$false;cleanup='native finally; independently absent'}
}
$batchInterrupted=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-gc-batch-r2-interruption-20261021.json') -Raw | ConvertFrom-Json
if($batchInterrupted.status -cne 'interrupted_after_focused_and_windows_probe' -or -not $batchInterrupted.tool_handle_missing -or @($batchInterrupted.matching_processes).Count -ne 0 -or $batchInterrupted.exists -or (Test-Path -LiteralPath $batchInterrupted.owner)){throw 'Interrupted r2 cleanup was not independently established'}
$batchPaths+=@{path=$batchInterrupted.owner;exists=$false;cleanup='interruption checked, exact source pins and marker verified, manually removed; original exit remains unknown'}
$batchCacheOwner=Join-Path $batchRoot '.tmp-d-admission-gc-batch-20261020-r1'
if(-not (Test-Path -LiteralPath $batchCacheOwner)){throw 'Owned batch cache missing before cleanup receipt'}
$batchResolved=(Resolve-Path -LiteralPath $batchCacheOwner).Path
if([IO.Path]::GetDirectoryName($batchResolved) -cne $batchRoot -or [IO.Path]::GetFileName($batchResolved) -cne '.tmp-d-admission-gc-batch-20261020-r1' -or ((Get-Item -Force -LiteralPath $batchResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $batchResolved 'owner.txt')) -cne 'gc-batch-20261020-r1'){throw 'Refusing cleanup outside this exact marked workspace cache'}
$batchCache=Join-Path $batchResolved 'cache'
if((Test-Path -LiteralPath $batchCache) -and ((Get-Item -Force -LiteralPath $batchCache).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected batch cache'}
Remove-Item -LiteralPath $batchResolved -Recurse -Force
if(Test-Path -LiteralPath $batchResolved){throw 'Batch cache remains after cleanup'}
$batchPaths+=@{path=$batchResolved;exists=$false;cleanup='exact resolved path and run marker checked; removed'}
$batchRecord=@{kind='d_download_retention_gc_batch_owned_cleanup';recorded_at=(Get-Date).ToUniversalTime().ToString('o');paths=$batchPaths;dependencies_installed=$false;remote_run=$false;scope='Three native source/binary/temp directories and the one explicitly marked shared build cache. Logs and evidence retained; no other task directories enumerated for deletion.'}
$batchStream=[IO.File]::Open($batchOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$batchBytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($batchRecord|ConvertTo-Json -Depth 8)+"`n");$batchStream.Write($batchBytes,0,$batchBytes.Length)}finally{$batchStream.Dispose()}
Write-Output 'PASS batch-owned-cleanup directories=4 all-absent=yes dependencies-installed=no remote=no'
