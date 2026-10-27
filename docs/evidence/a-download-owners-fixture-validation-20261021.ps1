$ErrorActionPreference='Stop'
$repairRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$repairCacheRoot=[IO.Path]::GetFullPath((Join-Path $repairRoot '.tmp-d-admission-a-owner-fixture-20261021-r2'))
$repairCache=Join-Path $repairCacheRoot 'cache'
if([IO.Path]::GetDirectoryName($repairCacheRoot) -ne $repairRoot -or
   (Get-Item -LiteralPath $repairCacheRoot).Attributes -band [IO.FileAttributes]::ReparsePoint -or
   [IO.File]::ReadAllText((Join-Path $repairCacheRoot 'owner.txt')) -ne 'a-owner-fixture-20261021-r2'){
    throw 'Refusing external cache outside this exact repair run'
}
$repairExit=1
try {
    & (Join-Path $repairRoot 'scripts/system-backup-d-download-admission-native-validation.ps1') `
        -EvidencePrefix 'a-download-owners-fixture-repair-20261021-r2' `
        -ExistingOwnedCache $repairCache -IncludeDownloadProbe -TaggedOwnerSeedsOnly `
        -TestRunPattern '^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$' `
        -BuildParallelism 1
    $repairExit=0
} finally {
    # The native runner removes its own source/binaries. This caller owns only
    # the explicitly marked cache copied from the superseded r1 build.
    if([IO.Path]::GetDirectoryName($repairCacheRoot) -ne $repairRoot -or
       [IO.File]::ReadAllText((Join-Path $repairCacheRoot 'owner.txt')) -ne 'a-owner-fixture-20261021-r2'){
        throw 'Repair cache owner changed; manual review required'
    }
    Remove-Item -LiteralPath $repairCacheRoot -Recurse -Force
    $repairCleanup=[ordered]@{kind='a_owner_fixture_repair_cache_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');path=$repairCacheRoot;exists=(Test-Path -LiteralPath $repairCacheRoot);wrapper_exit=$repairExit;dependencies_installed=$false;remote_executed=$false}
    $repairCleanupPath=Join-Path $repairRoot 'docs/evidence/a-download-owners-fixture-repair-20261021-r2-cleanup.json'
    if(Test-Path -LiteralPath $repairCleanupPath){throw 'Refusing cleanup evidence overwrite'}
    [IO.File]::WriteAllText($repairCleanupPath,($repairCleanup|ConvertTo-Json)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output ('REPAIR_CACHE_CLEANUP absent='+(-not $repairCleanup.exists)+' wrapper_exit='+$repairExit)
}
