[CmdletBinding()]
param(
    [switch]$Remote,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [string]$OutputDirectory=''
)
$ErrorActionPreference='Stop'
$groupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$groupEvidence=[IO.Path]::GetFullPath((Join-Path $groupRoot 'docs/evidence'))
Get-Command node -ErrorAction Stop | Out-Null
# Local mode runs the shared seed/vet and Linux compilation once, never SSH.
if(-not $Remote){
    if($OutputDirectory){throw 'OutputDirectory is only used for remote evidence'}
    & (Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1') -AdminReadOnly -AdminReadIndexCandidate -AdminReadIndexVariant page -BuildParallelism $BuildParallelism
    if(-not $?){throw 'Grouped index local gate failed'}
    Write-Output 'LOCAL_PASS grouped-index-seed-and-compile=yes variants=page,status,all real_mysql=not_run'
    return
}
if(-not $OutputDirectory){$OutputDirectory=Join-Path $groupEvidence ('d-index-groups-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))}
$groupOutput=[IO.Path]::GetFullPath($OutputDirectory)
if([IO.Path]::GetDirectoryName($groupOutput) -ne $groupEvidence -or [IO.Path]::GetFileName($groupOutput) -notmatch '^d-index-groups-[A-Za-z0-9-]+$'){throw 'Grouped evidence directory must be a new docs/evidence/d-index-groups-* directory'}
if(Test-Path -LiteralPath $groupOutput){throw 'Refusing to overwrite existing grouped evidence'}
if((Get-Item -LiteralPath $groupEvidence -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected grouped evidence directory'}
[IO.Directory]::CreateDirectory($groupOutput) | Out-Null
$groupPlan=@(@(1,'page'),@(1,'status'),@(1,'all'),@(2,'all'),@(2,'status'),@(2,'page'))
$groupInputs=@()
$groupCacheRoot=Join-Path $groupRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$groupFrozenRoot=Join-Path $groupCacheRoot 'source'
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
try{
[IO.Directory]::CreateDirectory($groupCacheRoot) | Out-Null
[IO.File]::WriteAllText((Join-Path $groupCacheRoot 'owner.txt'),[IO.Path]::GetFileName($groupCacheRoot))
$groupSnapshot=New-DIndexSourceSnapshot -Root $groupRoot -Destination $groupFrozenRoot
[IO.File]::WriteAllText((Join-Path $groupOutput 'source-snapshot.json'),($groupSnapshot | ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$groupNestedCache=Join-Path $groupFrozenRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$groupCache=Join-Path $groupNestedCache 'cache'
[IO.Directory]::CreateDirectory($groupCache) | Out-Null
[IO.File]::WriteAllText((Join-Path $groupNestedCache 'owner.txt'),[IO.Path]::GetFileName($groupNestedCache))
$groupRunPins=$null
foreach($groupStep in $groupPlan){
    Test-DIndexSourceSnapshot -Root $groupFrozenRoot -Manifest $groupSnapshot
    $groupRound=[int]$groupStep[0]; $groupVariant=[string]$groupStep[1]
    $groupLog=Join-Path $groupOutput ('r'+$groupRound+'-'+$groupVariant+'.txt')
    if(Test-Path -LiteralPath $groupLog){throw 'Refusing to overwrite transcript'}
    Start-Transcript -Path $groupLog | Out-Null
    try{
        Write-Output "D_INDEX_GROUP_BEGIN round=$groupRound variant=$groupVariant"
        Write-Output ('D_INDEX_GROUP_SOURCE_SHA256='+$groupSnapshot.source_sha256)
        & (Join-Path $groupFrozenRoot 'scripts/system-backup-a-evidence-validation.ps1') -AdminReadOnly -AdminReadIndexCandidate -AdminReadIndexVariant $groupVariant -IndexSuiteCache $groupCache -Remote -BuildParallelism $BuildParallelism -SshTarget $SshTarget
        if(-not $?){throw 'Grouped index remote gate failed'}
        Write-Output 'D_ADMIN_READ_INDEX_REMOTE_EXIT=0'
        Write-Output "D_INDEX_GROUP_END round=$groupRound variant=$groupVariant exit=0"
    }finally{Stop-Transcript | Out-Null}
    # Parse each complete receipt before starting the next remote run.
    Test-DIndexSourceSnapshot -Root $groupFrozenRoot -Manifest $groupSnapshot
    & node (Join-Path $groupFrozenRoot 'scripts/system-backup-d-index-group-report.mjs') --run $groupRound $groupVariant $groupLog | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Grouped index receipt rejected; remaining runs not started'}
    $groupText=[IO.File]::ReadAllText($groupLog)
    $groupObservedPins=@(foreach($pinPattern in @('PASS a-admin-read-mysql binary_sha256=([a-f0-9]{64})','PASS d-admin-read-live-http-mysql binary_sha256=([a-f0-9]{64})','PASS d-admin-read-index-candidate-mysql binary_sha256=([a-f0-9]{64})')){[regex]::Match($groupText,$pinPattern).Groups[1].Value}) -join ':'
    if($null -eq $groupRunPins){$groupRunPins=$groupObservedPins}elseif($groupRunPins -ne $groupObservedPins){throw 'Grouped binary drift; remaining runs not started'}
    $groupInputs+=$groupLog
}
& node (Join-Path $groupFrozenRoot 'scripts/system-backup-d-index-group-report.mjs') (Join-Path $groupOutput 'report.json') @groupInputs
if($LASTEXITCODE -ne 0){throw 'Grouped comparison rejected; raw transcripts retained'}
}finally{
    if(Test-Path -LiteralPath $groupCacheRoot){
        $groupResolved=(Resolve-Path -LiteralPath $groupCacheRoot).Path
        if([IO.Path]::GetDirectoryName($groupResolved) -ne $groupRoot -or [IO.Path]::GetFileName($groupResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $groupResolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing grouped cache cleanup outside owned directory'}
        Remove-Item -LiteralPath $groupResolved -Recurse -Force
    }
    if(Test-Path -LiteralPath $groupCacheRoot){throw 'Grouped build cache cleanup unverified'}
    Write-Output 'CLEANED grouped-index-build-cache=True'
}
$groupReceipt=[ordered]@{
    kind='d_index_group_suite_completion'; rounds=2; runs=6; exit=0; production_approved=$false
    local_build_cache_cleaned=(-not (Test-Path -LiteralPath $groupCacheRoot))
    local_build_cache_directory=[IO.Path]::GetFileName($groupCacheRoot)
    source_snapshot_sha256=(Get-FileHash -LiteralPath (Join-Path $groupOutput 'source-snapshot.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    report_sha256=(Get-FileHash -LiteralPath (Join-Path $groupOutput 'report.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    transcripts=@($groupInputs | ForEach-Object {[ordered]@{name=[IO.Path]::GetFileName($_);sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})
}
$groupReceiptPath=Join-Path $groupOutput 'suite-complete.json'
$groupReceiptStream=[IO.File]::Open($groupReceiptPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try{
    $groupReceiptBytes=[Text.Encoding]::UTF8.GetBytes(($groupReceipt | ConvertTo-Json -Depth 5)+"`n")
    $groupReceiptStream.Write($groupReceiptBytes,0,$groupReceiptBytes.Length)
}finally{$groupReceiptStream.Dispose()}
& node (Join-Path $PSScriptRoot 'system-backup-d-index-group-verify.mjs') $groupOutput
if($LASTEXITCODE -ne 0){throw 'Suite completion/report/transcript verification failed'}
Write-Output "PASS grouped-index-remote rounds=2 runs=6 report=$groupOutput/report.json production_approval=no"
