[CmdletBinding()]
param([int[]]$Runs = @(74,75,76,77,78))
$ErrorActionPreference='Stop'
$taskCleanupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskCleanupRecord=Join-Path $PSScriptRoot 'd-download-gc-task-cleanup-20261020.json'
if(Test-Path -LiteralPath $taskCleanupRecord){throw 'Refusing to replace cleanup evidence'}
$taskCleanupPaths=@()
foreach($taskCleanupRun in $Runs){
    $taskCleanupNative=Join-Path $PSScriptRoot ('d-download-gc-task-20261020-r'+$taskCleanupRun+'-native.txt')
    $taskCleanupText=[IO.File]::ReadAllText($taskCleanupNative)
    if($taskCleanupText -notmatch '(?m)^d_admission_native_exit=[01]\r?$' -or $taskCleanupText -notmatch '(?m)^CLEANED snapshot=True\r?$'){throw 'Native run has not confirmed terminal cleanup'}
    $taskCleanupMatch=[regex]::Match($taskCleanupText,'(?m)^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\r?$')
    if(-not $taskCleanupMatch.Success){throw 'Missing exact frozen owner'}
    $taskCleanupPath=[IO.Path]::GetFullPath($taskCleanupMatch.Groups[1].Value.Trim())
    if([IO.Path]::GetDirectoryName($taskCleanupPath) -ne $taskCleanupRoot -or [IO.Path]::GetFileName($taskCleanupPath) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Snapshot owner outside intended workspace'}
    if(Test-Path -LiteralPath $taskCleanupPath){throw 'Snapshot remains despite native cleanup; inspect before any recursive delete'}
    $taskCleanupPaths+=@{path=$taskCleanupPath;kind='snapshot';run=$taskCleanupRun;absent=$true}
}
$taskCleanupOwner=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-gc-task-cache-owner-20261020-r74.json') -Raw|ConvertFrom-Json
$taskCleanupCache=[IO.Path]::GetFullPath($taskCleanupOwner.owner)
if([IO.Path]::GetDirectoryName($taskCleanupCache) -ne $taskCleanupRoot -or [IO.Path]::GetFileName($taskCleanupCache) -ne '.tmp-d-admission-gc-task-20261020-r74' -or $taskCleanupOwner.marker -ne 'd-download-gc-task-20261020-r74'){throw 'Cache is not this exact owned run'}
if(Test-Path -LiteralPath $taskCleanupCache){
    if((Resolve-Path -LiteralPath $taskCleanupCache).Path -ne $taskCleanupCache -or ((Get-Item -Force -LiteralPath $taskCleanupCache).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $taskCleanupCache 'owner.txt')) -ne $taskCleanupOwner.marker){throw 'Cache ownership or path verification failed'}
    if(Get-ChildItem -LiteralPath $taskCleanupCache -Force -Recurse -Attributes ReparsePoint){throw 'Refusing cache cleanup containing a reparse point'}
    Remove-Item -LiteralPath $taskCleanupCache -Recurse -Force
}
if(Test-Path -LiteralPath $taskCleanupCache){throw 'Owned cache cleanup failed'}
$taskCleanupPaths+=@{path=$taskCleanupCache;kind='owned_cache';absent=$true}
@{kind='d_download_gc_task_local_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');paths=$taskCleanupPaths;dependencies_installed=$false;remote_run=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $taskCleanupRecord -Encoding utf8
Write-Output ('CLEANED task-eligibility-owned-paths='+$taskCleanupPaths.Count+' dependencies-installed=no remote-run=no')
