$ErrorActionPreference='Stop'
$retentionRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$retentionRuns=@('d-download-result-retention-focused-20261019-r46','d-download-result-retention-packages-20261019-r47')
$retentionSnapshots=@(foreach($retentionRun in $retentionRuns){
    $retentionLog=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ($retentionRun+'-native.txt'))
    if($retentionLog -notmatch 'd_admission_native_exit=0' -or $retentionLog -notmatch 'CLEANED snapshot=True'){throw 'Result retention run is not terminal and clean'}
    $retentionSnapshot=[regex]::Match($retentionLog,'owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})').Groups[1].Value
    if([string]::IsNullOrEmpty($retentionSnapshot) -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($retentionSnapshot)) -ne $retentionRoot -or (Test-Path -LiteralPath $retentionSnapshot)){throw 'Result retention source snapshot is invalid or remains present'}
    $retentionSnapshot
})
$retentionRecord=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-result-retention-run-owner-20261019-r46.json') | ConvertFrom-Json
$retentionExpected=Join-Path $retentionRoot '.tmp-d-admission-result-retention-20261019-r46'
$retentionResolved=(Resolve-Path -LiteralPath $retentionRecord.path).Path
if($retentionResolved -ne $retentionExpected -or [IO.Path]::GetDirectoryName($retentionResolved) -ne $retentionRoot -or $retentionRecord.cache -ne (Join-Path $retentionExpected 'cache')){throw 'Result retention cache escapes the exact owned directory'}
if(((Get-Item -LiteralPath $retentionResolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $retentionResolved 'owner.txt')) -ne [IO.Path]::GetFileName($retentionExpected)){throw 'Result retention cache marker or path is redirected'}
if(@(Get-ChildItem -LiteralPath $retentionResolved -Force -Recurse -Attributes ReparsePoint).Count){throw 'Result retention cache contains redirected children'}
$retentionOutput=Join-Path $PSScriptRoot 'd-download-result-retention-cleanup-20261019.json'
if(Test-Path -LiteralPath $retentionOutput){throw 'Refusing to replace cleanup evidence'}
Remove-Item -LiteralPath $retentionResolved -Recurse -Force
$retentionStatus=@(@($retentionSnapshots)+@($retentionResolved)|ForEach-Object {[ordered]@{path=$_;exists=(Test-Path -LiteralPath $_)}})
if(@($retentionStatus|Where-Object {$_.exists}).Count){throw 'Result retention cleanup incomplete'}
[IO.File]::WriteAllText($retentionOutput,([ordered]@{kind='d_download_result_retention_cleanup';runs=$retentionRuns;directories=$retentionStatus;all_absent=$true;all_own_sessions_terminal=$true;dependencies_installed=$false;actual_mysql=$false}|ConvertTo-Json -Depth 6))
Write-Output ('CLEANED result_retention_exact_owned_directories='+$retentionStatus.Count+' dependencies_installed=no')
