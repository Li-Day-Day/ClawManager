$ErrorActionPreference='Stop'
$finalOwnerRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$finalOwnerPrevious=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-owner-cleanup-20261019.json')|ConvertFrom-Json
$finalOwnerRecord=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-owner-run-owner-20261019-r39.json')|ConvertFrom-Json
$finalOwnerNative=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-owner-packages-20261019-r45-native.txt')
if($finalOwnerNative -notmatch 'd_admission_native_exit=0' -or $finalOwnerNative -notmatch 'CLEANED snapshot=True'){throw 'Final producer validation is not terminal and clean'}
$finalOwnerSnapshot=[regex]::Match($finalOwnerNative,'owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})').Groups[1].Value
$finalOwnerRefresh=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-owner-source-refresh-20261019-r38.txt')
$finalOwnerRefreshPath=[regex]::Match($finalOwnerRefresh,'REFRESH_CLEANED path=([^\r\n]+) absent=True').Groups[1].Value
$finalOwnerNewRuns=@('d-download-producer-owner-packages-20261019-r39','d-download-producer-owner-focused-20261019-r40','d-download-producer-owner-focused-20261019-r41','d-download-producer-owner-focused-20261019-r42','d-download-producer-owner-packages-20261019-r43','d-download-producer-owner-focused-20261019-r44','d-download-producer-owner-packages-20261019-r45')
$finalOwnerNewSnapshots=@(foreach($run in $finalOwnerNewRuns){
    $log=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ($run+'-native.txt'))
    if($log -notmatch 'd_admission_native_exit=[01]' -or $log -notmatch 'CLEANED snapshot=True'){throw 'Producer run has no terminal/cleaned evidence'}
    [regex]::Match($log,'owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})').Groups[1].Value
})
$finalOwnerAbsent=@($finalOwnerPrevious.directories|ForEach-Object {$_.path})+$finalOwnerNewSnapshots+@($finalOwnerRefreshPath)
foreach($finalOwnerPath in $finalOwnerAbsent){
    if([string]::IsNullOrEmpty($finalOwnerPath) -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($finalOwnerPath)) -ne $finalOwnerRoot){throw 'Prior cleanup identity escapes workspace'}
    if(Test-Path -LiteralPath $finalOwnerPath){throw 'Previously cleaned or snapshot directory is present'}
}
$finalOwnerExpected=Join-Path $finalOwnerRoot '.tmp-d-admission-producer-owner-20261019-r39'
$finalOwnerResolved=(Resolve-Path -LiteralPath $finalOwnerRecord.path).Path
if($finalOwnerResolved -ne $finalOwnerExpected -or [IO.Path]::GetDirectoryName($finalOwnerResolved) -ne $finalOwnerRoot -or $finalOwnerRecord.marker -ne [IO.Path]::GetFileName($finalOwnerExpected)){throw 'Final cache is not this exact owned directory'}
if(((Get-Item -Force -LiteralPath $finalOwnerResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $finalOwnerResolved 'owner.txt')) -ne $finalOwnerRecord.marker){throw 'Invalid final cache marker or redirected directory'}
if(@(Get-ChildItem -Force -Recurse -LiteralPath $finalOwnerResolved -Attributes ReparsePoint).Count -ne 0){throw 'Redirected final cache child'}
Remove-Item -LiteralPath $finalOwnerResolved -Recurse -Force
$finalOwnerAbsent+=@($finalOwnerResolved)
$finalOwnerStatus=@($finalOwnerAbsent|ForEach-Object {[ordered]@{path=$_;exists=(Test-Path -LiteralPath $_)}})
if(@($finalOwnerStatus|Where-Object {$_.exists}).Count -ne 0){throw 'Final cleanup incomplete'}
$finalOwnerOutput=Join-Path $PSScriptRoot 'd-download-producer-owner-cleanup-20261019-r45.json'
if(Test-Path -LiteralPath $finalOwnerOutput){throw 'Refusing to replace final cleanup evidence'}
[IO.File]::WriteAllText($finalOwnerOutput,([ordered]@{kind='d_download_producer_owner_final_cleanup';cache_path=$finalOwnerResolved;runs=@($finalOwnerPrevious.runs)+$finalOwnerNewRuns;directories=$finalOwnerStatus;source_only_refresh_failed_closed=$true;all_absent=$true;all_own_sessions_terminal=$true;dependencies_installed=$false}|ConvertTo-Json -Depth 7))
Write-Output ('CLEANED cumulative_exact_owned_directories='+$finalOwnerStatus.Count+' dependencies_installed=no')
