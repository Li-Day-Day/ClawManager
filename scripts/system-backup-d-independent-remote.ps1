[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')]
    [string]$SshTarget
)

$ErrorActionPreference='Stop'
$runner=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw 'Validation runner is missing' }

# Each profile gets its own isolated namespace and run-owned MySQL database.
# Stop on the first failure so its original output and cleanup identity remain
# visible; never reinterpret an earlier profile's PASS as this profile's PASS.
$profiles=@('D','A','Schema','ADeployment','Manager','Authority','AManager','ARead','ABootstrap','ARevoke')
try {
    foreach ($profile in $profiles) {
        Write-Output "BEGIN d-independent-remote profile=$profile"
        & $runner -ProducerRecoveryOnly -RecoveryTest $profile -Remote -SshTarget $SshTarget
        Write-Output "PASS d-independent-remote profile=$profile"
    }
    Write-Output ('PASS d-independent-remote profiles='+($profiles -join ','))
    Write-Output 'EXIT_CODE=0'
} catch {
    Write-Output 'EXIT_CODE=1'
    throw
}
