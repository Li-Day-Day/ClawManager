[CmdletBinding()]
param(
    [switch]$Remote,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$proofRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$proofOwner=Join-Path $proofRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$proofFrozen=Join-Path $proofOwner 'source'
$proofManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($proofManifest) -ne [IO.Path]::GetFullPath((Join-Path $proofRoot 'docs/evidence')) -or (Test-Path -LiteralPath $proofManifest)){throw 'Manifest must be a new docs/evidence file'}
$proofPreviousPath=$env:PATH
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
try {
    [IO.Directory]::CreateDirectory($proofOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $proofOwner 'owner.txt'),[IO.Path]::GetFileName($proofOwner))
    $proofSnapshot=New-DIndexSourceSnapshot -Root $proofRoot -Destination $proofFrozen
    $proofStream=[IO.File]::Open($proofManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$proofBytes=[Text.Encoding]::UTF8.GetBytes(($proofSnapshot|ConvertTo-Json -Depth 6));$proofStream.Write($proofBytes,0,$proofBytes.Length)}finally{$proofStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-proof-frozen=yes source_sha256='+$proofSnapshot.source_sha256+' files='+$proofSnapshot.files.Count)
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    Push-Location $proofFrozen
    try {
        & (Join-Path $proofFrozen 'scripts/system-backup-a-evidence-dispatch.test.ps1')
        & (Join-Path $proofFrozen 'scripts/system-backup-a-evidence-validation.ps1') -ConfigProofOnly -BuildParallelism $BuildParallelism -Remote:$Remote -SshTarget $SshTarget
        Test-DIndexSourceSnapshot -Root $proofFrozen -Manifest $proofSnapshot
        Write-Output ('LOCAL_PASS config-proof-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested='+[bool]$Remote)
    } finally {Pop-Location}
} finally {
    $env:PATH=$proofPreviousPath
    if(Test-Path -LiteralPath $proofOwner){
        $proofResolved=(Resolve-Path -LiteralPath $proofOwner).Path
        if([IO.Path]::GetDirectoryName($proofResolved) -ne $proofRoot -or [IO.Path]::GetFileName($proofResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
            ((Get-Item -Force -LiteralPath $proofResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            [IO.File]::ReadAllText((Join-Path $proofResolved 'owner.txt')) -ne [IO.Path]::GetFileName($proofResolved)){throw 'Refusing config proof cleanup outside owned source directory'}
        Remove-Item -Recurse -Force -LiteralPath $proofResolved
    }
    Write-Output ('LOCAL_CLEANUP config-proof-source-owned='+$proofOwner+' removed='+(-not(Test-Path -LiteralPath $proofOwner)))
}
