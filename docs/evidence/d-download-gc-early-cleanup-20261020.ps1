[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$gcEarlyCleanupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\','/')
$gcEarlyCleanupPaths=@()
foreach($gcEarlyCleanupRun in @(72,73)){
    $gcEarlyCleanupText=Get-Content -LiteralPath (Join-Path $PSScriptRoot ('d-download-gc-early-20261020-r'+$gcEarlyCleanupRun+'-native.txt')) -Raw
    if($gcEarlyCleanupText -notmatch 'd_admission_native_exit=0'){throw 'Run has not successfully terminated'}
    $gcEarlyCleanupMatch=[regex]::Match($gcEarlyCleanupText,'(?m)^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\r?$')
    if(-not $gcEarlyCleanupMatch.Success){throw 'Missing snapshot owner'}
    $gcEarlyCleanupPath=[IO.Path]::GetFullPath($gcEarlyCleanupMatch.Groups[1].Value.Trim())
    if([IO.Path]::GetDirectoryName($gcEarlyCleanupPath) -ine $gcEarlyCleanupRoot -or [IO.Path]::GetFileName($gcEarlyCleanupPath) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Owner outside intended workspace'}
    if(Test-Path -LiteralPath $gcEarlyCleanupPath){throw ('Wrapper snapshot unexpectedly remains: '+$gcEarlyCleanupPath)}
    $gcEarlyCleanupPaths+=@([ordered]@{path=$gcEarlyCleanupPath;kind='snapshot';run=$gcEarlyCleanupRun;absent=$true})
}
$gcEarlyCleanupCache=[IO.Path]::GetFullPath((Join-Path $gcEarlyCleanupRoot '.tmp-d-admission-gc-early-20261020-r72'))
if([IO.Path]::GetDirectoryName($gcEarlyCleanupCache) -ine $gcEarlyCleanupRoot -or [IO.Path]::GetFileName($gcEarlyCleanupCache) -cne '.tmp-d-admission-gc-early-20261020-r72'){throw 'Wrong cache target'}
if(Test-Path -LiteralPath $gcEarlyCleanupCache){
    if((Get-Item -LiteralPath $gcEarlyCleanupCache -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache owner'}
    if((Get-Content -LiteralPath (Join-Path $gcEarlyCleanupCache 'owner.txt') -Raw).Trim() -cne 'd-download-gc-early-20261020-r72'){throw 'Cache ownership marker differs'}
    foreach($gcEarlyCleanupItem in Get-ChildItem -LiteralPath $gcEarlyCleanupCache -Recurse -Force){if($gcEarlyCleanupItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache child'}}
    Remove-Item -LiteralPath $gcEarlyCleanupCache -Recurse -Force
}
$gcEarlyCleanupPaths+=@([ordered]@{path=$gcEarlyCleanupCache;kind='owned_cache';absent=(-not(Test-Path -LiteralPath $gcEarlyCleanupCache))})
[ordered]@{kind='d_download_gc_early_local_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');paths=$gcEarlyCleanupPaths;dependencies_installed=$false;remote_run=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-gc-early-cleanup-20261020.json') -Encoding utf8
if(@($gcEarlyCleanupPaths|Where-Object {-not $_.absent}).Count){throw 'Cleanup incomplete'}
Write-Output ('CLEANED gc-early-owned-paths='+$gcEarlyCleanupPaths.Count+' dependencies-installed=no remote=no')
