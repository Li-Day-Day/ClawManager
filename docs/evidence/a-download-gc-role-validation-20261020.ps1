[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run)
$ErrorActionPreference='Stop'
$gcRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gcPrefix=Join-Path $PSScriptRoot ('a-download-gc-role-'+$Run)
foreach($gcSuffix in @('-native.txt','-source.json')){if(Test-Path -LiteralPath ($gcPrefix+$gcSuffix)){throw 'Refusing existing GC role evidence'}}
$gcTelemetryBefore=$env:GOTELEMETRY
$gcExit=1
Start-Transcript -LiteralPath ($gcPrefix+'-native.txt') -NoClobber|Out-Null
try {
    $env:GOTELEMETRY='off'
    Write-Output 'START GC restricted-role local preparation; remote=not-run dependencies-installed=no role-approval=no production-approval=no'
    & (Join-Path $gcRoot 'scripts/system-backup-d-config-writer-validation.ps1') -DownloadGCRoleOnly -BuildParallelism 1 -SourceManifestPath ($gcPrefix+'-source.json')
    $gcExit=0
} finally {
    $env:GOTELEMETRY=$gcTelemetryBefore
    Write-Output ('a_download_gc_role_local_exit='+$gcExit)
    Stop-Transcript|Out-Null
}
