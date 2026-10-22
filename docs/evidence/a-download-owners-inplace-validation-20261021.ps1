$ErrorActionPreference='Stop'
$inplaceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$inplaceCacheRoot=[IO.Path]::GetFullPath((Join-Path $inplaceRoot '.tmp-d-admission-a-owner-inplace-20261021-r2'))
$inplaceCache=Join-Path $inplaceCacheRoot 'cache'
$inplaceOwner='a-owner-inplace-20261021-r2'
if([IO.Path]::GetDirectoryName($inplaceCacheRoot) -ne $inplaceRoot -or (Test-Path -LiteralPath $inplaceCacheRoot)){throw 'Refusing non-new or external cache'}
[IO.Directory]::CreateDirectory($inplaceCache)|Out-Null
[IO.File]::WriteAllText((Join-Path $inplaceCacheRoot 'owner.txt'),$inplaceOwner)
$inplaceExit=1
$inplaceRuns=@()
$inplaceSourceDigest=$null
try {
    foreach($inplaceAttempt in @(2,3)){
        $inplacePrefix='a-download-owners-inplace-fixture-20261021-r'+$inplaceAttempt
        Write-Output ('INPLACE_PREPARATION attempt='+$inplaceAttempt+' offline=yes shared_cache=own bounded_infrastructure_retry_only=yes')
        & (Get-Command powershell).Source -NoProfile -File (Join-Path $inplaceRoot 'scripts/system-backup-d-download-admission-native-validation.ps1') `
            -EvidencePrefix $inplacePrefix -ExistingOwnedCache $inplaceCache -IncludeDownloadProbe -TaggedOwnerSeedsOnly `
            -TestRunPattern '^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$' -BuildParallelism 1
        $inplaceNativeExit=$LASTEXITCODE
        $inplaceStem=Join-Path $inplaceRoot ('docs/evidence/'+$inplacePrefix)
        $inplaceManifest=Get-Content -Raw -LiteralPath ($inplaceStem+'-source.json')|ConvertFrom-Json
        if($null -eq $inplaceSourceDigest){$inplaceSourceDigest=$inplaceManifest.source_sha256}
        if($inplaceSourceDigest -cne $inplaceManifest.source_sha256){throw 'Retry frozen source changed; do not accept as the same preparation'}
        $inplaceRuns+=@([ordered]@{prefix=$inplacePrefix;exit=$inplaceNativeExit;source_sha256=$inplaceManifest.source_sha256})
        if($inplaceNativeExit -eq 0){$inplaceExit=0;break}
        $inplaceNative=[IO.File]::ReadAllText($inplaceStem+'-native.txt')
        $inplaceCompilerPath=$inplaceStem+'-linux-probe-stderr.txt'
        $inplaceKnownInfrastructure=$false
        if(Test-Path -LiteralPath $inplaceCompilerPath){
            $inplaceCompiler=[IO.File]::ReadAllText($inplaceCompilerPath).Trim()
            $inplaceKnownInfrastructure=$inplaceCompiler -match '^[A-Za-z0-9_./-]+: [^\r\n]+\\(?:compile|asm)\.exe: exit status 0xc0000043$'
        }
        foreach($inplaceMarker in @('NATIVE_EXIT focused_packages=0','FROZEN_UNIT_POSTCHECK pass=yes','NATIVE_PROBE stage=tagged-seed exit=0','NATIVE_PROBE stage=windows-probe exit=0','NATIVE_PROBE stage=detached-seed exit=0','NATIVE_PROBE stage=linux-probe exit=1','CLEANED snapshot=True','d_admission_native_exit=1')){
            if(-not $inplaceNative.Contains($inplaceMarker)){$inplaceKnownInfrastructure=$false}
        }
        $inplaceEvents=@(Get-Content -LiteralPath ($inplaceStem+'.jsonl')|ForEach-Object {$_|ConvertFrom-Json})
        if(@($inplaceEvents|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -ne 0){$inplaceKnownInfrastructure=$false}
        if(-not $inplaceKnownInfrastructure -or $inplaceAttempt -eq 3){throw 'Preparation failed; no business, unknown-build or unbounded retry allowed'}
        Write-Output 'INPLACE_RETRY reason=known-windows-compiler-0xc0000043 same_frozen_source_required=yes business_retry=no'
    }
} finally {
    if([IO.Path]::GetDirectoryName($inplaceCacheRoot) -ne $inplaceRoot -or
       ((Get-Item -LiteralPath $inplaceCacheRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
       [IO.File]::ReadAllText((Join-Path $inplaceCacheRoot 'owner.txt')) -cne $inplaceOwner){throw 'Cache identity changed; refusing recursive cleanup'}
    Remove-Item -LiteralPath $inplaceCacheRoot -Recurse -Force
    $inplaceCleanup=[ordered]@{kind='a_inplace_fixture_validation_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');path=$inplaceCacheRoot;exists=(Test-Path -LiteralPath $inplaceCacheRoot);wrapper_exit=$inplaceExit;runs=$inplaceRuns;dependencies_installed=$false;remote_executed=$false}
    $inplaceCleanupPath=Join-Path $inplaceRoot 'docs/evidence/a-download-owners-inplace-fixture-retry-cleanup-20261021.json'
    if(Test-Path -LiteralPath $inplaceCleanupPath){throw 'Refusing existing cleanup evidence'}
    [IO.File]::WriteAllText($inplaceCleanupPath,($inplaceCleanup|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output ('INPLACE_CACHE_CLEANED absent='+(-not $inplaceCleanup.exists)+' wrapper_exit='+$inplaceExit)
}
exit $inplaceExit
