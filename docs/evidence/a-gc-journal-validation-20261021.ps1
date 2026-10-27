$ErrorActionPreference='Stop'
$journalRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$journalCacheOwner=Join-Path $journalRoot '.tmp-d-admission-a-gc-journal-20261021-r1'
$journalCleanup=Join-Path $PSScriptRoot 'a-gc-journal-cleanup-20261021-r1.json'
if((Test-Path -LiteralPath $journalCacheOwner) -or (Test-Path -LiteralPath $journalCleanup)){throw 'Refusing to replace journal validation ownership/evidence'}
[IO.Directory]::CreateDirectory((Join-Path $journalCacheOwner 'cache'))|Out-Null
[IO.File]::WriteAllText((Join-Path $journalCacheOwner 'owner.txt'),'a-gc-journal-20261021-r1')
$journalExit=1
try {
    Push-Location $journalRoot
    try {
        $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
        & powershell -NoProfile -File scripts/system-backup-d-download-admission-native-validation.ps1 `
            -EvidencePrefix a-gc-journal-20261021-r1-focused `
            -ExistingOwnedCache (Join-Path $journalCacheOwner 'cache') -BuildParallelism 1 `
            -TestRunPattern '^Test(JournaledGC|GCRuntime|GCAuthority|DownloadFailureJournal|RecoveryAuditJournal)'
        if($LASTEXITCODE -ne 0){throw 'Focused GC journal validation failed'}
        & powershell -NoProfile -File scripts/system-backup-d-download-admission-native-validation.ps1 `
            -EvidencePrefix a-gc-journal-20261021-r1-full `
            -ExistingOwnedCache (Join-Path $journalCacheOwner 'cache') -BuildParallelism 1 `
            -IncludeRead -IncludeProducer -IncludeProducerOwnerProbe
        if($LASTEXITCODE -ne 0){throw 'Complete GC journal validation failed'}
        $journalExit=0
    } finally {Pop-Location}
} finally {
    $journalResolved=(Resolve-Path -LiteralPath $journalCacheOwner).Path
    if([IO.Path]::GetDirectoryName($journalResolved) -cne $journalRoot -or [IO.Path]::GetFileName($journalResolved) -cne '.tmp-d-admission-a-gc-journal-20261021-r1' -or [IO.File]::ReadAllText((Join-Path $journalResolved 'owner.txt')) -cne 'a-gc-journal-20261021-r1'){throw 'Journal cache owner escaped exact run'}
    $journalItems=@(Get-Item -Force -LiteralPath $journalResolved)+@(Get-ChildItem -Force -LiteralPath $journalResolved -Recurse)
    foreach($journalItem in $journalItems){if($journalItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected journal cache owner'}}
    Remove-Item -LiteralPath $journalResolved -Recurse -Force
    if(Test-Path -LiteralPath $journalResolved){throw 'Journal build cache remains'}
    [IO.File]::WriteAllText($journalCleanup,([ordered]@{kind='a_gc_journal_owned_cache_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');path=$journalResolved;exists=$false;validation_exit=$journalExit;dependencies_installed=$false;remote_executed=$false}|ConvertTo-Json)+"`n")
    Write-Output ('GC_JOURNAL_VALIDATION_EXIT='+$journalExit+' CACHE_REMOVED=True')
}
