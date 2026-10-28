[CmdletBinding()]
param(
    [switch]$Remote,
    [switch]$SecurityOnly,
    [switch]$NonceTimeOnly,
    [switch]$DownloadMFAOnly,
    [switch]$DownloadAdmissionOnly,
    [switch]$DownloadOwnersOnly,
    [switch]$DownloadTaskChainOnly,
    [switch]$DownloadProducerOnly,
    [switch]$DownloadGCRoleOnly,
    [switch]$DownloadGCTaskOnly,
    [switch]$DownloadGCFreezeOnly,
    [switch]$DownloadGCFullProfileOnly,
    [switch]$DownloadGCFullCollectOnly,
    [switch]$MaintenanceReceiptsOnly,
    [switch]$BackfillServiceOnly,
    [switch]$BackfillRowGuards,
    [switch]$RequireReviewedOwnerBaseline,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
if($DownloadGCFullCollectOnly){if($DownloadGCFullProfileOnly -or $DownloadGCFreezeOnly){throw 'Full Collect, Full profile and historical freeze profiles must be selected separately'};$DownloadGCFullProfileOnly=$true}
if($DownloadGCFullProfileOnly){if($DownloadGCFreezeOnly){throw 'Full-profile and historical freeze profiles must be selected separately'};$DownloadGCFreezeOnly=$true}
if($RequireReviewedOwnerBaseline -and (-not $Remote -or -not ($DownloadOwnersOnly -or $DownloadGCRoleOnly))){throw 'RequireReviewedOwnerBaseline requires an owner or GC role remote profile'}
if($DownloadGCFreezeOnly -and ($DownloadGCTaskOnly -or $DownloadGCRoleOnly -or $DownloadProducerOnly -or $DownloadTaskChainOnly -or $DownloadOwnersOnly -or $DownloadAdmissionOnly -or $DownloadMFAOnly -or $NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadGCFreezeOnly requires an exclusive validation profile'}
if($DownloadGCTaskOnly -and ($DownloadGCRoleOnly -or $DownloadProducerOnly -or $DownloadTaskChainOnly -or $DownloadOwnersOnly -or $DownloadAdmissionOnly -or $DownloadMFAOnly -or $NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadGCTaskOnly requires an exclusive validation profile'}
if($DownloadGCRoleOnly -and ($DownloadProducerOnly -or $DownloadTaskChainOnly -or $DownloadOwnersOnly -or $DownloadAdmissionOnly -or $DownloadMFAOnly -or $NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadGCRoleOnly requires an exclusive validation profile'}
if($DownloadProducerOnly -and ($DownloadTaskChainOnly -or $DownloadOwnersOnly -or $DownloadAdmissionOnly -or $DownloadMFAOnly -or $NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadProducerOnly requires an exclusive validation profile'}
if($DownloadTaskChainOnly -and ($DownloadOwnersOnly -or $DownloadAdmissionOnly -or $DownloadMFAOnly -or $NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadTaskChainOnly requires an exclusive validation profile'}
if($DownloadOwnersOnly -and ($DownloadAdmissionOnly -or $DownloadMFAOnly -or $NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadOwnersOnly requires an exclusive validation profile'}
if($DownloadAdmissionOnly -and ($DownloadMFAOnly -or $NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadAdmissionOnly requires an exclusive validation profile'}
if($DownloadMFAOnly -and ($NonceTimeOnly -or $SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'DownloadMFAOnly requires an exclusive validation profile'}
if($NonceTimeOnly -and ($SecurityOnly -or $MaintenanceReceiptsOnly -or $BackfillServiceOnly -or $BackfillRowGuards)){throw 'NonceTimeOnly requires an exclusive validation profile'}
if($BackfillServiceOnly){if($SecurityOnly){throw 'Backfill service and writer security profiles must be selected separately'};$MaintenanceReceiptsOnly=$true}
if($MaintenanceReceiptsOnly -and $SecurityOnly){throw 'Maintenance receipt storage and writer security profiles must be selected separately'}
$writerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$writerOwner=Join-Path $writerRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$writerFrozen=Join-Path $writerOwner 'source'
function Resolve-ConfigWriterManifestPath {
    param([string]$Path,[string]$Root)
    if([string]::IsNullOrWhiteSpace($Path)){throw 'Manifest path must not be empty'}
    # Set-Location does not update the .NET process directory in Windows
    # PowerShell. Resolve relative input against the caller's PowerShell path.
    $manifestProvider=$null;$manifestDrive=$null
    $resolved=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path,[ref]$manifestProvider,[ref]$manifestDrive)
    if($manifestProvider.Name -ne 'FileSystem'){throw 'Manifest must use the FileSystem provider'}
    $resolved=[IO.Path]::GetFullPath($resolved)
    if([IO.Path]::GetDirectoryName($resolved) -ne [IO.Path]::GetFullPath((Join-Path $Root 'docs/evidence'))){throw 'Manifest must be directly inside this repository docs/evidence directory'}
    if(Test-Path -LiteralPath $resolved){throw 'Manifest already exists; choose a new filename for this run'}
    return $resolved
}
$writerManifest=Resolve-ConfigWriterManifestPath -Path $SourceManifestPath -Root $writerRoot
$writerPreviousPath=$env:PATH
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
try {
    [IO.Directory]::CreateDirectory($writerOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $writerOwner 'owner.txt'),[IO.Path]::GetFileName($writerOwner))
    Write-Output ('LOCAL_OWNER config-writer-source='+$writerOwner)
    $writerSnapshot=New-AConfigProofSourceSnapshot -Root $writerRoot -Owner $writerOwner -MaxAttempts 3
    $writerStream=[IO.File]::Open($writerManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$writerBytes=[Text.Encoding]::UTF8.GetBytes(($writerSnapshot|ConvertTo-Json -Depth 6));$writerStream.Write($writerBytes,0,$writerBytes.Length)}finally{$writerStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-writer-frozen=yes source_sha256='+$writerSnapshot.source_sha256+' files='+$writerSnapshot.files.Count)
    if($RequireReviewedOwnerBaseline){
        # The early operator check cannot authorize a later snapshot retry.
        # Check the exact successful immutable capture, never the live tree.
        $writerBaselineGate=Join-Path $writerRoot 'docs/evidence/a-download-retest-source-preflight-20261021.mjs'
        if(-not (Test-Path -LiteralPath $writerBaselineGate -PathType Leaf)){throw 'Reviewed owner baseline checker unavailable; no test or SSH started'}
        $writerGatePreviousEncoding=$OutputEncoding
        try {
            $OutputEncoding=[Text.UTF8Encoding]::new($false)
            $writerGateOutput=@(($writerSnapshot|ConvertTo-Json -Depth 8 -Compress)|& node $writerBaselineGate)
            $writerGateExit=$LASTEXITCODE
        } finally {$OutputEncoding=$writerGatePreviousEncoding}
        $writerGateOutput|Write-Output
        if($writerGateExit -ne 0){throw 'Frozen ordinary source requires a reviewed owner baseline; no test or SSH started'}
        $writerGateResult=($writerGateOutput -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop
        if($writerGateResult -is [Array] -or $writerGateResult.status -cne 'ready_for_original_snapshot_gate' -or
            $writerGateResult.reviewed_source_sha256 -notmatch '^[a-f0-9]{64}$' -or
            $writerGateResult.actual_sql -isnot [bool] -or $writerGateResult.actual_sql -or
            $writerGateResult.tests_started -isnot [bool] -or $writerGateResult.tests_started){throw 'Invalid reviewed owner baseline decision; no test or SSH started'}
        Write-Output ('LOCAL_PASS owner-baseline-frozen=yes source_sha256='+$writerSnapshot.source_sha256+' reviewed_source_sha256='+$writerGateResult.reviewed_source_sha256)
    }
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    Push-Location $writerFrozen
    try {
        & (Join-Path $writerFrozen 'scripts/system-backup-a-evidence-dispatch.test.ps1')
        if($DownloadGCFullCollectOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-d-download-gc-full-collect-dispatch.test.ps1')
        } elseif($DownloadGCFullProfileOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-d-download-gc-full-profile-dispatch.test.ps1')
        } elseif($DownloadGCFreezeOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1')
        } elseif($DownloadGCTaskOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-d-download-gc-task-dispatch.test.ps1')
        } elseif($DownloadGCRoleOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-a-download-gc-role-dispatch.test.ps1')
        } elseif($DownloadProducerOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-d-download-producer-dispatch.test.ps1')
        } elseif($DownloadTaskChainOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-d-download-task-chain-dispatch.test.ps1')
        } elseif($DownloadOwnersOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-a-download-owners-dispatch.test.ps1')
        } elseif($DownloadAdmissionOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-a-download-admission-dispatch.test.ps1')
        } elseif($DownloadMFAOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-a-download-mfa-dispatch.test.ps1')
        } elseif($NonceTimeOnly){
            & (Join-Path $writerFrozen 'scripts/system-backup-a-nonce-acceptance-dispatch.test.ps1')
        } else {
            & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1')
            & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -SecurityOnly
            & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -MaintenanceReceiptsOnly
            & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -BackfillServiceOnly
        }
        & (Join-Path $writerFrozen 'scripts/system-backup-a-evidence-validation.ps1') -ConfigWriterOnly -ConfigWriterSecurityOnly:$SecurityOnly -ConfigNonceTimeOnly:$NonceTimeOnly -ConfigDownloadMFAOnly:$DownloadMFAOnly -ConfigDownloadAdmissionOnly:$DownloadAdmissionOnly -ConfigDownloadOwnersOnly:$DownloadOwnersOnly -ConfigDownloadTaskChainOnly:$DownloadTaskChainOnly -ConfigDownloadProducerOnly:$DownloadProducerOnly -ConfigDownloadGCRoleOnly:$DownloadGCRoleOnly -ConfigDownloadGCTaskOnly:$DownloadGCTaskOnly -ConfigDownloadGCFreezeOnly:($DownloadGCFreezeOnly -and -not $DownloadGCFullProfileOnly) -ConfigDownloadGCFullProfileOnly:($DownloadGCFullProfileOnly -and -not $DownloadGCFullCollectOnly) -ConfigDownloadGCFullCollectOnly:$DownloadGCFullCollectOnly -ConfigMaintenanceReceiptOnly:$MaintenanceReceiptsOnly -ConfigBackfillServiceOnly:$BackfillServiceOnly -BackfillRowGuards:$BackfillRowGuards -BuildParallelism $BuildParallelism -Remote:$Remote -SshTarget $SshTarget
        Test-DIndexSourceSnapshot -Root $writerFrozen -Manifest $writerSnapshot
        Write-Output ('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested='+[bool]$Remote)
    } finally {Pop-Location}
} finally {
    $env:PATH=$writerPreviousPath
    if(Test-Path -LiteralPath $writerOwner){
        $writerResolved=(Resolve-Path -LiteralPath $writerOwner).Path
        if([IO.Path]::GetDirectoryName($writerResolved) -ne $writerRoot -or [IO.Path]::GetFileName($writerResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
            ((Get-Item -Force -LiteralPath $writerResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            [IO.File]::ReadAllText((Join-Path $writerResolved 'owner.txt')) -ne [IO.Path]::GetFileName($writerResolved)){throw 'Refusing config writer cleanup outside owned source directory'}
        Remove-Item -Recurse -Force -LiteralPath $writerResolved
    }
    Write-Output ('LOCAL_CLEANUP config-writer-source-owned='+$writerOwner+' removed='+(-not(Test-Path -LiteralPath $writerOwner)))
}
