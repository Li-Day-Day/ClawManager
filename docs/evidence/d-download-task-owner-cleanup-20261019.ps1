$ErrorActionPreference='Stop'
$taskOwnerWorkspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$taskOwnerRecord=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-task-owner-run-owner-20261019-r28.json') | ConvertFrom-Json
$taskOwnerRuns=@('d-download-task-owner-focused-20261019-r28','d-download-task-owner-focused-20261019-r29','d-download-task-owner-focused-20261019-r30','d-download-task-owner-focused-20261019-r31','d-download-task-owner-packages-20261019-r32')
$taskOwnerDirectories=[Collections.Generic.List[string]]::new()
foreach($taskOwnerRun in $taskOwnerRuns){
    $taskOwnerNative=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ($taskOwnerRun+'-native.txt'))
    if($taskOwnerNative -notmatch 'd_admission_native_exit=[01]' -or $taskOwnerNative -notmatch 'CLEANED snapshot=True'){throw 'Run is not terminal and cleaned'}
    $taskOwnerMatch=[regex]::Match($taskOwnerNative,'owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})')
    if(-not $taskOwnerMatch.Success){throw 'Missing exact snapshot identity'}
    $taskOwnerSnapshot=[IO.Path]::GetFullPath($taskOwnerMatch.Groups[1].Value)
    if([IO.Path]::GetDirectoryName($taskOwnerSnapshot) -ne $taskOwnerWorkspace -or [IO.Path]::GetFileName($taskOwnerSnapshot) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Snapshot escapes workspace'}
    if(Test-Path -LiteralPath $taskOwnerSnapshot){throw 'Native wrapper did not remove its snapshot'}
    $taskOwnerDirectories.Add($taskOwnerSnapshot)
}
$taskOwnerExpected=Join-Path $taskOwnerWorkspace '.tmp-d-admission-task-owner-20261019-r28'
$taskOwnerResolved=(Resolve-Path -LiteralPath $taskOwnerRecord.path).Path
if($taskOwnerResolved -ne $taskOwnerExpected -or [IO.Path]::GetDirectoryName($taskOwnerResolved) -ne $taskOwnerWorkspace -or $taskOwnerRecord.marker -ne [IO.Path]::GetFileName($taskOwnerExpected)){throw 'Cache is not this exact owned directory'}
if(((Get-Item -Force -LiteralPath $taskOwnerResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $taskOwnerResolved 'owner.txt')) -ne $taskOwnerRecord.marker){throw 'Invalid cache marker or redirected directory'}
if(@(Get-ChildItem -Force -Recurse -LiteralPath $taskOwnerResolved -Attributes ReparsePoint).Count -ne 0){throw 'Owned cache contains redirected children'}
Remove-Item -LiteralPath $taskOwnerResolved -Recurse -Force
$taskOwnerDirectories.Add($taskOwnerResolved)
$taskOwnerAbsent=@($taskOwnerDirectories | ForEach-Object {[ordered]@{path=$_;exists=(Test-Path -LiteralPath $_)}})
if(@($taskOwnerAbsent | Where-Object {$_.exists}).Count -ne 0){throw 'Owned cleanup remains incomplete'}
$taskOwnerOutput=Join-Path $PSScriptRoot 'd-download-task-owner-cleanup-20261019.json'
if(Test-Path -LiteralPath $taskOwnerOutput){throw 'Refusing to replace cleanup evidence'}
[IO.File]::WriteAllText($taskOwnerOutput,([ordered]@{kind='d_download_task_owner_cleanup';cache_path=$taskOwnerResolved;runs=$taskOwnerRuns;directories=$taskOwnerAbsent;all_absent=$true;dependencies_installed=$false;all_own_sessions_terminal=$true}|ConvertTo-Json -Depth 6))
Write-Output ('CLEANED exact_owned_directories='+$taskOwnerAbsent.Count+' dependencies_installed=no')
