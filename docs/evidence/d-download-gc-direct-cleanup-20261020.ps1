[CmdletBinding()]
param([int[]]$Runs = @(79,80,81,82,83,84,85,86,87))
$ErrorActionPreference='Stop'
$directCleanupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$directCleanupRecord=Join-Path $PSScriptRoot 'd-download-gc-direct-cleanup-20261020.json'
if(Test-Path -LiteralPath $directCleanupRecord){throw 'Refusing to replace cleanup evidence'}
$directCleanupPaths=@()
foreach($directCleanupRun in $Runs){
    $directCleanupNative=Join-Path $PSScriptRoot ('d-download-gc-direct-20261020-r'+$directCleanupRun+'-native.txt')
    $directCleanupText=[IO.File]::ReadAllText($directCleanupNative)
    if($directCleanupText -notmatch '(?m)^d_admission_native_exit=[01]\r?$' -or $directCleanupText -notmatch '(?m)^CLEANED snapshot=True\r?$'){throw 'Native run has not confirmed terminal cleanup'}
    $directCleanupMatch=[regex]::Match($directCleanupText,'(?m)^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\r?$')
    if(-not $directCleanupMatch.Success){throw 'Missing exact frozen owner'}
    $directCleanupPath=[IO.Path]::GetFullPath($directCleanupMatch.Groups[1].Value.Trim())
    if([IO.Path]::GetDirectoryName($directCleanupPath) -ne $directCleanupRoot -or [IO.Path]::GetFileName($directCleanupPath) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Snapshot owner outside intended workspace'}
    if(Test-Path -LiteralPath $directCleanupPath){throw 'Snapshot remains despite native cleanup; inspect before any recursive delete'}
    $directCleanupPaths+=@{path=$directCleanupPath;kind='snapshot';run=$directCleanupRun;absent=$true}
}
$directCleanupOwner=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-gc-direct-cache-owner-20261020-r79.json') -Raw|ConvertFrom-Json
$directCleanupCache=[IO.Path]::GetFullPath($directCleanupOwner.owner)
if([IO.Path]::GetDirectoryName($directCleanupCache) -ne $directCleanupRoot -or [IO.Path]::GetFileName($directCleanupCache) -ne '.tmp-d-admission-gc-direct-20261020-r79' -or $directCleanupOwner.marker -ne 'd-download-gc-direct-20261020-r79'){throw 'Cache is not this exact owned run'}
if(Test-Path -LiteralPath $directCleanupCache){
    if((Resolve-Path -LiteralPath $directCleanupCache).Path -ne $directCleanupCache -or ((Get-Item -Force -LiteralPath $directCleanupCache).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $directCleanupCache 'owner.txt')) -ne $directCleanupOwner.marker){throw 'Cache ownership or path verification failed'}
    if(Get-ChildItem -LiteralPath $directCleanupCache -Force -Recurse -Attributes ReparsePoint){throw 'Refusing cache cleanup containing a reparse point'}
    Remove-Item -LiteralPath $directCleanupCache -Recurse -Force
}
if(Test-Path -LiteralPath $directCleanupCache){throw 'Owned cache cleanup failed'}
$directCleanupPaths+=@{path=$directCleanupCache;kind='owned_cache';absent=$true}
@{kind='d_download_gc_direct_local_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');paths=$directCleanupPaths;dependencies_installed=$false;remote_run=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $directCleanupRecord -Encoding utf8
Write-Output ('CLEANED direct-reference-owned-paths='+$directCleanupPaths.Count+' dependencies-installed=no remote-run=no')
