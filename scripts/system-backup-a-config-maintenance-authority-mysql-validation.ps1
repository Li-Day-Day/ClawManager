[CmdletBinding()]
param(
    [switch]$Remote,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$authorityProbeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$authorityProbeOwner=Join-Path $authorityProbeRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$authorityProbeFrozen=Join-Path $authorityProbeOwner 'source'
$authorityProbeManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($authorityProbeManifest) -ne [IO.Path]::GetFullPath((Join-Path $authorityProbeRoot 'docs/evidence')) -or (Test-Path -LiteralPath $authorityProbeManifest)){throw 'Manifest must be a new docs/evidence file'}
$authorityProbePreviousPath=$env:PATH
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
try {
    [IO.Directory]::CreateDirectory($authorityProbeOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $authorityProbeOwner 'owner.txt'),[IO.Path]::GetFileName($authorityProbeOwner))
    $authorityProbeSnapshot=New-DIndexSourceSnapshot -Root $authorityProbeRoot -Destination $authorityProbeFrozen
    $authorityProbeStream=[IO.File]::Open($authorityProbeManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$authorityProbeBytes=[Text.Encoding]::UTF8.GetBytes(($authorityProbeSnapshot|ConvertTo-Json -Depth 6));$authorityProbeStream.Write($authorityProbeBytes,0,$authorityProbeBytes.Length)}finally{$authorityProbeStream.Dispose()}
    Write-Output ('LOCAL_SOURCE a-maintenance-authority-frozen=yes source_sha256='+$authorityProbeSnapshot.source_sha256+' files='+$authorityProbeSnapshot.files.Count)
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    Push-Location $authorityProbeFrozen
    try {
        & (Join-Path $authorityProbeFrozen 'scripts/system-backup-a-evidence-dispatch.test.ps1')
        & (Join-Path $authorityProbeFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1')
        & (Join-Path $authorityProbeFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -SecurityOnly
        & (Join-Path $authorityProbeFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -MaintenanceReceiptsOnly
        & (Join-Path $authorityProbeFrozen 'scripts/system-backup-d-config-writer-dispatch.test.ps1') -BackfillServiceOnly
        & (Join-Path $authorityProbeFrozen 'scripts/system-backup-a-config-maintenance-authority-dispatch.test.ps1')
        & (Join-Path $authorityProbeFrozen 'scripts/system-backup-a-evidence-validation.ps1') -ConfigWriterOnly -ConfigMaintenanceReceiptOnly -ConfigMaintenanceAuthorityOnly -BuildParallelism $BuildParallelism -Remote:$Remote -SshTarget $SshTarget
        Test-DIndexSourceSnapshot -Root $authorityProbeFrozen -Manifest $authorityProbeSnapshot
        Write-Output ('LOCAL_PASS a-maintenance-authority-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested='+[bool]$Remote)
    } finally {Pop-Location}
} finally {
    $env:PATH=$authorityProbePreviousPath
    if(Test-Path -LiteralPath $authorityProbeOwner){
        $authorityProbeResolved=(Resolve-Path -LiteralPath $authorityProbeOwner).Path
        if([IO.Path]::GetDirectoryName($authorityProbeResolved) -ne $authorityProbeRoot -or [IO.Path]::GetFileName($authorityProbeResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
            ((Get-Item -Force -LiteralPath $authorityProbeResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            [IO.File]::ReadAllText((Join-Path $authorityProbeResolved 'owner.txt')) -ne [IO.Path]::GetFileName($authorityProbeResolved)){throw 'Refusing authority probe cleanup outside owned source directory'}
        Remove-Item -Recurse -Force -LiteralPath $authorityProbeResolved
    }
    Write-Output ('LOCAL_CLEANUP a-maintenance-authority-source-owned='+$authorityProbeOwner+' removed='+(-not(Test-Path -LiteralPath $authorityProbeOwner)))
}
