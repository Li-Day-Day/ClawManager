[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$engine = Join-Path $PSHOME 'pwsh.exe'
$validator = Join-Path $PSScriptRoot 'system-backup-a-producer-adapter-validation.ps1'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$localLog = Join-Path $root "docs/evidence/a-d-producer-history-local-$stamp.txt"
$remoteLog = Join-Path $root "docs/evidence/a-d-producer-history-remote-$stamp.txt"

function Invoke-Validation([string[]]$Arguments, [string]$LogPath) {
    & $engine -NoProfile -ExecutionPolicy Bypass -File $validator @Arguments 2>&1 |
        Tee-Object -FilePath $LogPath
    if ($LASTEXITCODE -ne 0) {
        throw "Validation failed (exit $LASTEXITCODE); log: $LogPath"
    }
}

try {
    Invoke-Validation -Arguments @('-MySQLService') -LogPath $localLog
    $snapshotLine = Get-Content -LiteralPath $localLog |
        Select-String '^SNAPSHOT manifest=(.+) files=\d+$' |
        Select-Object -Last 1
    if (-not $snapshotLine) { throw "Snapshot manifest not found; log: $localLog" }
    $snapshotPath = $snapshotLine.Matches[0].Groups[1].Value
    $snapshot = Get-Content -LiteralPath $snapshotPath -Raw | ConvertFrom-Json
    if ($snapshot.status -ne 'passed_snapshot_only' -or
        @($snapshot.live_drift_after_validation).Count -ne 0) {
        throw "Source changed during local validation; no remote contact. Snapshot: $snapshotPath"
    }
    Invoke-Validation -Arguments @('-MySQLService', '-Remote', '-ExpectedSnapshot', $snapshotPath) -LogPath $remoteLog
    Write-Host "LOCAL_LOG=$localLog"
    Write-Host "REMOTE_LOG=$remoteLog"
} catch {
    Write-Host "STOPPED: $($_.Exception.Message)"
    exit 1
}
