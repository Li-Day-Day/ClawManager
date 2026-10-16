[CmdletBinding()]
param(
    [switch]$Remote,
    [switch]$SecurityOnly,
    [switch]$MaintenanceReceiptsOnly,
    [switch]$BackfillServiceOnly,
    [switch]$BackfillRowGuards,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
if($BackfillServiceOnly){if($SecurityOnly){throw 'Backfill service and writer security profiles must be selected separately'};$MaintenanceReceiptsOnly=$true}
if($MaintenanceReceiptsOnly -and $SecurityOnly){throw 'Maintenance receipt storage and writer security profiles must be selected separately'}
$writerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$writerOwner=Join-Path $writerRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$writerFrozen=Join-Path $writerOwner 'source'
$writerManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($writerManifest) -ne [IO.Path]::GetFullPath((Join-Path $writerRoot 'docs/evidence')) -or (Test-Path -LiteralPath $writerManifest)){throw 'Manifest must be a new docs/evidence file'}
$writerPreviousPath=$env:PATH
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
try {
    [IO.Directory]::CreateDirectory($writerOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $writerOwner 'owner.txt'),[IO.Path]::GetFileName($writerOwner))
    $writerSnapshot=New-DIndexSourceSnapshot -Root $writerRoot -Destination $writerFrozen
    $writerStream=[IO.File]::Open($writerManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$writerBytes=[Text.Encoding]::UTF8.GetBytes(($writerSnapshot|ConvertTo-Json -Depth 6));$writerStream.Write($writerBytes,0,$writerBytes.Length)}finally{$writerStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-writer-frozen=yes source_sha256='+$writerSnapshot.source_sha256+' files='+$writerSnapshot.files.Count)
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    Push-Location $writerFrozen
    try {
        & (Join-Path $writerFrozen 'scripts/system-backup-a-evidence-dispatch.test.ps1')
        & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1')
        & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -SecurityOnly
        & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -MaintenanceReceiptsOnly
        & (Join-Path $writerFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -BackfillServiceOnly
        & (Join-Path $writerFrozen 'scripts/system-backup-a-evidence-validation.ps1') -ConfigWriterOnly -ConfigWriterSecurityOnly:$SecurityOnly -ConfigMaintenanceReceiptOnly:$MaintenanceReceiptsOnly -ConfigBackfillServiceOnly:$BackfillServiceOnly -BackfillRowGuards:$BackfillRowGuards -BuildParallelism $BuildParallelism -Remote:$Remote -SshTarget $SshTarget
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
