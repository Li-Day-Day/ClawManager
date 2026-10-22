[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')][string[]]$Namespace=@('clawmanager-zhanghui08-system'),
    [string]$OutputPath='',
    [switch]$InspectDatabase,
    [ValidatePattern('^[0-9a-f-]{36}$')][string]$ExpectedNamespaceUid='',
    [ValidatePattern('^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$')][string]$MySqlPod='',
    [ValidatePattern('^[0-9a-f-]{36}$')][string]$ExpectedMySqlPodUid='',
    [ValidatePattern('^[A-Za-z0-9_]{1,64}$')][string]$Database='clawmanager',
    [switch]$StateOnly,
    [ValidatePattern('^[0-9a-f-]{36}$')][string]$ExpectedServerUuid='',
    [ValidatePattern('^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$')][string]$AppPod='',
    [ValidatePattern('^[0-9a-f-]{36}$')][string]$ExpectedAppPodUid=''
)
$ErrorActionPreference='Stop'
$aChainRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($Namespace.Count -lt 1 -or $Namespace.Count -gt 16) { throw 'Select one to sixteen existing test namespaces' }
foreach ($aChainNS in $Namespace) { if ($aChainNS.Length -gt 63) { throw 'Invalid namespace length' } }
if($InspectDatabase -and (-not $ExpectedNamespaceUid -or -not $MySqlPod -or -not $ExpectedMySqlPodUid)){throw 'Database observation requires namespace and MySQL Pod UID pins'}
if(-not $InspectDatabase -and ($ExpectedNamespaceUid -or $MySqlPod -or $ExpectedMySqlPodUid)){throw 'Database pins require InspectDatabase'}
if($StateOnly -and (-not $InspectDatabase -or -not $ExpectedServerUuid)){throw 'StateOnly requires pinned database observation and server UUID'}
if(($AppPod -or $ExpectedAppPodUid) -and (-not $StateOnly -or -not $AppPod -or -not $ExpectedAppPodUid)){throw 'Runtime metadata requires StateOnly and both app Pod pins'}
if(-not $StateOnly -and $ExpectedServerUuid){throw 'Server UUID pin requires StateOnly'}
$aChainScript=Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.sh'
$aChainBytes=[IO.File]::ReadAllBytes($aChainScript)
$aChainHash=[Security.Cryptography.SHA256]::Create()
try { $aChainDigest=([BitConverter]::ToString($aChainHash.ComputeHash($aChainBytes))).Replace('-','').ToLowerInvariant() }
finally { $aChainHash.Dispose() }
if (-not $OutputPath) {
    $aChainID=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
    $OutputPath=Join-Path $aChainRoot ('docs/evidence/a-live-chain-inventory-'+$aChainID+'.txt')
}
$aChainOutput=[IO.Path]::GetFullPath($OutputPath)
# Reserve the exact output exclusively before contacting the remote host.
$aChainFile=[IO.File]::Open($aChainOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$aChainWriter=New-Object IO.StreamWriter($aChainFile,(New-Object Text.UTF8Encoding($false)))
try {
    $aChainWriter.WriteLine('inventory_script_sha256='+$aChainDigest)
    $aChainWriter.Flush()
    $aChainPayload=[Text.Encoding]::UTF8.GetString($aChainBytes).Replace("`r`n","`n")
    if($StateOnly){$aChainPayload="set -eu`na_live_state_only=1`necho 'A_LIVE_CHAIN_INVENTORY version=1 mode=state_only'`n"}
    if($InspectDatabase){
        $aChainDBScript=Join-Path $PSScriptRoot 'system-backup-a-live-chain-db-inventory.sh'
        $aChainDBRaw=[IO.File]::ReadAllText($aChainDBScript).Replace("`r`n","`n")
        $aChainPayload += "`na_live_db_ns='"+$Namespace[0]+"'`na_live_db_ns_uid='"+$ExpectedNamespaceUid+"'`na_live_db_pod='"+$MySqlPod+"'`na_live_db_pod_uid='"+$ExpectedMySqlPodUid+"'`na_live_db_name='"+$Database+"'`n"+$aChainDBRaw+"`n"
    }
    if($StateOnly){
        $aChainStateRaw=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-live-chain-state.sh')).Replace("`r`n","`n")
        $aChainPayload += "a_live_db_server='"+$ExpectedServerUuid+"'`na_live_app_pod='"+$AppPod+"'`na_live_app_uid='"+$ExpectedAppPodUid+"'`n"+$aChainStateRaw+"`n"
    }
    $aChainPayloadHasher=[Security.Cryptography.SHA256]::Create()
    try {$aChainWriter.WriteLine('inventory_payload_sha256='+([BitConverter]::ToString($aChainPayloadHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($aChainPayload)))).Replace('-','').ToLowerInvariant())}
    finally {$aChainPayloadHasher.Dispose()}
    $aChainWriter.Flush()
    # Windows PowerShell appends CRLF when piping even an LF-only string to a
    # native process. Strip CR remotely, including that final appended line.
    $aChainRemote="tr -d '\015' | bash -s -- "+($Namespace -join ' ')
    $aChainExit=1
    $aChainLines=@($aChainPayload | & ssh -- $SshTarget $aChainRemote)
    $aChainExit=$LASTEXITCODE
    foreach ($aChainLine in $aChainLines) { $aChainWriter.WriteLine([string]$aChainLine); Write-Host $aChainLine }
    $aChainWriter.WriteLine('inventory_ssh_exit='+$aChainExit)
    $aChainWriter.Flush()
    if ($aChainExit -ne 0) { throw 'Read-only inventory failed; retain the partial public receipt' }
} finally { $aChainWriter.Dispose(); Write-Host ('Public receipt: '+$aChainOutput) }
