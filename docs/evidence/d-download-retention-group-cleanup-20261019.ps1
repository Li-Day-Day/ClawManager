$ErrorActionPreference='Stop'
$groupRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$groupRuns=@('d-download-retention-group-focused-20261019-r48','d-download-retention-group-focused-20261019-r49','d-download-retention-group-packages-20261019-r50','d-download-retention-group-packages-20261019-r51','d-download-retention-group-packages-20261019-r52')
$groupSnapshots=@(foreach($groupRun in $groupRuns){
    $groupLog=Get-Content -LiteralPath (Join-Path $PSScriptRoot ($groupRun+'-native.txt')) -Raw
    $groupExit=[regex]::Match($groupLog,'d_admission_native_exit=([01])').Groups[1].Value
    if($groupExit -eq '' -or $groupLog -notmatch 'CLEANED snapshot=True'){throw 'Group validation lacks terminal cleanup evidence'}
    if($groupRun -in @($groupRuns[1],$groupRuns[3],$groupRuns[4]) -and $groupExit -ne '0'){throw 'Latest group validation did not pass'}
    $groupSnapshot=[regex]::Match($groupLog,'owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})').Groups[1].Value
    if([string]::IsNullOrEmpty($groupSnapshot) -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($groupSnapshot)) -ne $groupRoot -or (Test-Path -LiteralPath $groupSnapshot)){throw 'Group snapshot escapes workspace or remains present'}
    $groupSnapshot
})
$groupRecord=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-retention-group-run-owner-20261019-r48.json') -Raw|ConvertFrom-Json
$groupExpected=Join-Path $groupRoot '.tmp-d-admission-retention-group-20261019-r48'
$groupResolved=(Resolve-Path -LiteralPath $groupRecord.path).Path
if($groupResolved -ne $groupExpected -or [IO.Path]::GetDirectoryName($groupResolved) -ne $groupRoot -or $groupRecord.cache -ne (Join-Path $groupExpected 'cache')){throw 'Group cache does not match exact owned directory'}
if(((Get-Item -LiteralPath $groupResolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $groupResolved 'owner.txt')) -ne [IO.Path]::GetFileName($groupExpected)){throw 'Group cache marker or path is redirected'}
if(@(Get-ChildItem -LiteralPath $groupResolved -Force -Recurse -Attributes ReparsePoint).Count){throw 'Group cache has redirected children'}
$groupOutput=Join-Path $PSScriptRoot 'd-download-retention-group-cleanup-20261019.json'
if(Test-Path -LiteralPath $groupOutput){throw 'Refusing existing cleanup receipt'}
Remove-Item -LiteralPath $groupResolved -Recurse -Force
$groupStatus=@(@($groupSnapshots)+@($groupResolved)|ForEach-Object {[ordered]@{path=$_;exists=(Test-Path -LiteralPath $_)}})
if(@($groupStatus|Where-Object {$_.exists}).Count){throw 'Group cleanup incomplete'}
[IO.File]::WriteAllText($groupOutput,([ordered]@{kind='d_download_retention_group_cleanup';runs=$groupRuns;directories=$groupStatus;all_absent=$true;all_own_sessions_terminal=$true;dependencies_installed=$false;actual_mysql_executed_by_this_run=$false}|ConvertTo-Json -Depth 6))
Write-Output ('CLEANED group_exact_owned_directories='+$groupStatus.Count+' dependencies_installed=no')
