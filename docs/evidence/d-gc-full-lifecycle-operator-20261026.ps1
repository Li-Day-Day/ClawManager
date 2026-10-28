[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ReviewedSourcePath,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [switch]$Remote,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$ReviewedSourcePath=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReviewedSourcePath)
$SourceManifestPath=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourceManifestPath)
$lifecycleRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$lifecycleHelper=Join-Path $PSScriptRoot 'd-gc-full-lifecycle-source-20261026.mjs'
$lifecycleOwner=Join-Path $lifecycleRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$lifecycleSource=Join-Path $lifecycleOwner 'source'
$lifecycleExit=1
try {
    [IO.Directory]::CreateDirectory($lifecycleOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $lifecycleOwner 'owner.txt'),[IO.Path]::GetFileName($lifecycleOwner))
    Write-Output ('LOCAL_OWNER config-writer-source='+$lifecycleOwner)
    # Exact A-reviewed inventory and adapter pins are checked before any Go,
    # SSH, or copying into a new immutable source. Never patch an old snapshot.
    & node $lifecycleHelper capture $lifecycleRoot $lifecycleOwner $SourceManifestPath $ReviewedSourcePath
    if($LASTEXITCODE -ne 0){throw 'Lifecycle source differs from reviewed inputs; execution not started'}
    Push-Location $lifecycleSource
    try {
        & (Join-Path $lifecycleSource 'scripts/system-backup-a-evidence-validation.ps1') -ConfigWriterOnly -ConfigDownloadGCFullCollectOnly -Remote:$Remote -BuildParallelism $BuildParallelism -SshTarget $SshTarget
        & node $lifecycleHelper check $lifecycleRoot $lifecycleOwner $SourceManifestPath
        if($LASTEXITCODE -ne 0){throw 'Lifecycle frozen source changed during execution'}
        Write-Output ('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested='+[bool]$Remote)
        $lifecycleExit=0
    } finally {Pop-Location}
} finally {
    if(Test-Path -LiteralPath $lifecycleOwner){
        $lifecycleResolved=(Resolve-Path -LiteralPath $lifecycleOwner).Path
        if([IO.Path]::GetDirectoryName($lifecycleResolved) -ne $lifecycleRoot -or [IO.Path]::GetFileName($lifecycleResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
            ((Get-Item -Force -LiteralPath $lifecycleResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            [IO.File]::ReadAllText((Join-Path $lifecycleResolved 'owner.txt')) -ne [IO.Path]::GetFileName($lifecycleResolved)){throw 'Refusing cleanup outside exact lifecycle owner'}
        Remove-Item -LiteralPath $lifecycleResolved -Recurse -Force
    }
    Write-Output ('LOCAL_CLEANUP config-writer-source-owned='+$lifecycleOwner+' removed='+(-not(Test-Path -LiteralPath $lifecycleOwner)))
    Write-Output ('gc_full_lifecycle_exit='+$lifecycleExit)
}
