$ErrorActionPreference='Stop'
$producerRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$producerRuns=@('d-download-producer-seed-20261019-r55','d-download-producer-seed-20261019-r56','d-download-producer-packages-20261020-r57','d-download-producer-packages-20261020-r58','d-download-producer-packages-20261020-r59')
$producerPaths=@()
foreach($producerRun in $producerRuns){
    $producerNative=Get-Content -LiteralPath (Join-Path $PSScriptRoot ($producerRun+'-native.txt')) -Raw
    $producerPath=[regex]::Match($producerNative,'owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})').Groups[1].Value
    if(-not $producerPath -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($producerPath)) -ne $producerRoot -or (Test-Path -LiteralPath $producerPath)){throw 'Producer source owner escaped workspace or remains present'}
    if($producerRun -eq $producerRuns[0] -and ($producerNative -notmatch 'd_admission_native_exit=1' -or $producerNative -notmatch 'CLEANED snapshot=True')){throw 'r55 lacks terminal failure/cleanup evidence'}
    if($producerRun -in @($producerRuns[2],$producerRuns[3]) -and ($producerNative -notmatch 'd_admission_native_exit=1' -or $producerNative -notmatch 'CLEANED snapshot=True')){throw 'Failed package/probe round lacks terminal cleanup evidence'}
    if($producerRun -eq $producerRuns[4] -and ($producerNative -notmatch 'd_admission_native_exit=0' -or $producerNative -notmatch 'CLEANED snapshot=True' -or $producerNative -notmatch 'FROZEN_UNIT_POSTCHECK pass=yes' -or $producerNative -notmatch 'FROZEN_POSTCHECK pass=yes')){throw 'r59 lacks successful unit/probe postcheck and cleanup'}
    $producerPaths+=@($producerPath)
}
$producerInterrupted=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-interrupted-r56-cleanup-20261020.json') -Raw|ConvertFrom-Json
if($producerInterrupted.exists -or -not $producerInterrupted.original_tool_handle_missing -or -not $producerInterrupted.original_native_pid_absent -or $producerInterrupted.path -ne $producerPaths[1] -or $producerInterrupted.full_source_postcheck_pass){throw 'r56 incomplete cleanup scope was not preserved accurately'}
$producerOwner=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-cache-owner-20261019-r55.json') -Raw|ConvertFrom-Json
$producerExpected=Join-Path $producerRoot '.tmp-d-admission-producer-owner-20261019-r55'
$producerResolved=(Resolve-Path -LiteralPath $producerOwner.path).Path
if($producerResolved -ne $producerExpected -or [IO.Path]::GetDirectoryName($producerResolved) -ne $producerRoot -or $producerOwner.cache -ne (Join-Path $producerResolved 'cache') -or ((Get-Item -Force -LiteralPath $producerResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $producerResolved 'owner.txt')) -ne [IO.Path]::GetFileName($producerResolved)){throw 'Producer external cache is not the exact owned directory'}
if(@(Get-ChildItem -LiteralPath $producerResolved -Force -Recurse -Attributes ReparsePoint).Count){throw 'Producer cache contains redirected children'}
$producerOutput=Join-Path $PSScriptRoot 'd-download-producer-cleanup-20261020.json'
if(Test-Path -LiteralPath $producerOutput){throw 'Refusing existing cleanup receipt'}
Remove-Item -LiteralPath $producerResolved -Recurse -Force
$producerStatuses=@(@($producerPaths)+@($producerResolved)|ForEach-Object {[ordered]@{path=$_;exists=(Test-Path -LiteralPath $_)}})
if(@($producerStatuses|Where-Object {$_.exists}).Count){throw 'Producer cleanup incomplete'}
[IO.File]::WriteAllText($producerOutput,([ordered]@{kind='d_producer_download_cleanup';runs=$producerRuns;directories=$producerStatuses;all_absent=$true;all_own_sessions_terminal=$true;dependencies_installed=$false;remote_executed_by_d=$false;r56_full_frozen_postcheck_not_claimed=$true}|ConvertTo-Json -Depth 6))
Write-Output ('CLEANED producer exact_owned_directories='+$producerStatuses.Count+' dependencies_installed=no')
