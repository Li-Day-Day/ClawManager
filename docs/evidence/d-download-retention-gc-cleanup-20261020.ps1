[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$gcCleanupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\','/')
$gcCleanupPaths=@()
foreach($gcCleanupRun in @(63,64,65,66,67,68,69,70,71)){
    $gcCleanupLog=Join-Path $PSScriptRoot ('d-download-retention-gc-20261020-r'+$gcCleanupRun+'-native.txt')
    $gcCleanupText=Get-Content -LiteralPath $gcCleanupLog -Raw
    if($gcCleanupText -notmatch 'd_admission_native_exit=[01]'){throw 'Validation has not reached a terminal state'}
    $gcCleanupMatch=[regex]::Match($gcCleanupText,'(?m)^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\r?$')
    if(-not $gcCleanupMatch.Success){throw 'Missing exact snapshot owner'}
    $gcCleanupPath=[IO.Path]::GetFullPath($gcCleanupMatch.Groups[1].Value.Trim())
    if([IO.Path]::GetDirectoryName($gcCleanupPath) -ine $gcCleanupRoot -or [IO.Path]::GetFileName($gcCleanupPath) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Snapshot owner is outside the workspace'}
    # Each wrapper removes its own snapshot after the process exits. A leftover
    # requires investigation rather than deleting an unverified live checkout.
    if(Test-Path -LiteralPath $gcCleanupPath){throw ('Unexpected remaining snapshot: '+$gcCleanupPath)}
    $gcCleanupPaths+=@([ordered]@{path=$gcCleanupPath;absent=$true;kind='wrapper_snapshot';run=$gcCleanupRun})
}
$gcCleanupCache=[IO.Path]::GetFullPath((Join-Path $gcCleanupRoot '.tmp-d-admission-retention-gc-20261020-r63'))
if([IO.Path]::GetDirectoryName($gcCleanupCache) -ine $gcCleanupRoot -or [IO.Path]::GetFileName($gcCleanupCache) -cne '.tmp-d-admission-retention-gc-20261020-r63'){throw 'Cache owner is outside the intended directory'}
if(Test-Path -LiteralPath $gcCleanupCache){
    if((Get-Item -LiteralPath $gcCleanupCache -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Cache owner is redirected'}
    if((Get-Content -LiteralPath (Join-Path $gcCleanupCache 'owner.txt') -Raw).Trim() -cne 'd-download-retention-gc-20261020-r63'){throw 'Cache marker mismatch'}
    foreach($gcCleanupItem in Get-ChildItem -LiteralPath $gcCleanupCache -Force -Recurse){
        if($gcCleanupItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing to traverse redirected cache entry'}
    }
    Remove-Item -LiteralPath $gcCleanupCache -Recurse -Force
}
$gcCleanupPaths+=@([ordered]@{path=$gcCleanupCache;absent=(-not (Test-Path -LiteralPath $gcCleanupCache));kind='shared_owned_cache'})
$gcCleanupReport=[ordered]@{kind='d_retention_gc_validation_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');dependencies_installed=$false;remote_run=$false;paths=$gcCleanupPaths}
$gcCleanupReport|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-retention-gc-cleanup-20261020.json') -Encoding utf8
if(@($gcCleanupPaths|Where-Object {-not $_.absent}).Count){throw 'Owned cache cleanup incomplete'}
Write-Output ('CLEANED gc-owned-paths='+$gcCleanupPaths.Count+' dependencies-installed=no remote=no')
