[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._-]+$')][string]$KubeContext,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')][string]$Namespace,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')][string]$ClaimName,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$')][string]$ExpectedStorageClass,
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9.-]+$')][string]$ExpectedCSIDriver,
    [Parameter(Mandatory=$true)][ValidateRange(4096,9223372036854775807)][long]$MinCapacityBytes
)

$ErrorActionPreference='Stop'

function Get-KubeJson {
    param([string[]]$Arguments)
    $outputText=& kubectl @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('kubectl read failed: '+($Arguments -join ' ')) }
    try { return ($outputText | Out-String | ConvertFrom-Json) }
    catch { throw ('kubectl returned invalid JSON: '+($Arguments -join ' ')) }
}

function Convert-KubeQuantity {
    param([string]$Quantity)
    if ($Quantity -notmatch '^([0-9]+)(Ki|Mi|Gi|Ti|K|M|G|T)?$') { throw 'Unsupported PVC capacity quantity' }
    $unit=$Matches[2]
    $factor=switch ($unit) {
        'Ki' { 1024L }
        'Mi' { 1048576L }
        'Gi' { 1073741824L }
        'Ti' { 1099511627776L }
        'K'  { 1000L }
        'M'  { 1000000L }
        'G'  { 1000000000L }
        'T'  { 1000000000000L }
        default { 1L }
    }
    $size=[System.Numerics.BigInteger]::Parse($Matches[1]) * [System.Numerics.BigInteger]$factor
    if ($size -gt [long]::MaxValue) { throw 'PVC capacity is outside supported range' }
    return [long]$size
}

$claim=Get-KubeJson -Arguments @('--context',$KubeContext,'--namespace',$Namespace,'get','pvc',$ClaimName,'-o','json')
if ($claim.metadata.name -ne $ClaimName -or $claim.metadata.namespace -ne $Namespace -or
    $claim.status.phase -ne 'Bound' -or [string]::IsNullOrWhiteSpace($claim.spec.volumeName) -or
    $claim.spec.storageClassName -ne $ExpectedStorageClass -or
    ($claim.spec.volumeMode -and $claim.spec.volumeMode -ne 'Filesystem') -or
    @($claim.spec.accessModes) -notcontains 'ReadWriteOncePod') {
    throw 'Audit PVC is not an exact Bound single-pod writer claim'
}
$claimUid=[string]$claim.metadata.uid
if ($claimUid -notmatch '^[0-9a-f-]{36}$') { throw 'Audit PVC UID is invalid' }
$capacity=Convert-KubeQuantity ([string]$claim.status.capacity.storage)
$requestedCapacity=Convert-KubeQuantity ([string]$claim.spec.resources.requests.storage)
if ($capacity -lt $MinCapacityBytes -or $requestedCapacity -lt $MinCapacityBytes -or
    $capacity -lt $requestedCapacity) { throw 'Audit PVC capacity is below the requested minimum or its own request' }

$volume=Get-KubeJson -Arguments @('--context',$KubeContext,'get','pv',([string]$claim.spec.volumeName),'-o','json')
if ($volume.metadata.name -ne $claim.spec.volumeName -or $volume.status.phase -ne 'Bound' -or $volume.spec.claimRef.uid -ne $claimUid -or
    $volume.spec.claimRef.name -ne $ClaimName -or $volume.spec.claimRef.namespace -ne $Namespace -or
    $volume.spec.csi.driver -ne $ExpectedCSIDriver -or
    [string]::IsNullOrWhiteSpace($volume.spec.csi.volumeHandle) -or
    $volume.spec.storageClassName -ne $claim.spec.storageClassName -or
    ($volume.spec.volumeMode -and $volume.spec.volumeMode -ne 'Filesystem') -or
    @($volume.spec.accessModes) -notcontains 'ReadWriteOncePod') {
    throw 'Audit PV binding or CSI single-pod writer identity is invalid'
}
$volumeCapacity=Convert-KubeQuantity ([string]$volume.spec.capacity.storage)
if ($volumeCapacity -lt $MinCapacityBytes -or $volumeCapacity -lt $capacity) {
    throw 'Audit PV capacity is below the bound PVC capacity'
}
$volumeUid=[string]$volume.metadata.uid
if ($volumeUid -notmatch '^[0-9a-f-]{36}$') { throw 'Audit PV UID is invalid' }
$allClaims=Get-KubeJson -Arguments @('--context',$KubeContext,'--namespace',$Namespace,'get','pvc','-o','json')
foreach ($other in @($allClaims.items)) {
    if ($other.metadata.name -ne $ClaimName -and $other.spec.volumeName -eq $volume.metadata.name) {
        throw 'Another PVC is bound to the audit PV'
    }
}
$allVolumes=Get-KubeJson -Arguments @('--context',$KubeContext,'get','pv','-o','json')
foreach ($other in @($allVolumes.items)) {
    if ($other.metadata.name -ne $volume.metadata.name -and
        $other.spec.csi.driver -eq $ExpectedCSIDriver -and
        $other.spec.csi.volumeHandle -eq $volume.spec.csi.volumeHandle) {
        throw 'Another PV aliases the audit CSI volume'
    }
}

[pscustomobject]@{
    result='STORAGE_PREFLIGHT_PASS_NOT_PRODUCTION_ACCEPTANCE'
    namespace=$Namespace
    pvc=$ClaimName
    pvc_uid=$claimUid
    pv=[string]$volume.metadata.name
    pv_uid=$volumeUid
    storage_class=[string]$volume.spec.storageClassName
    csi_driver=[string]$volume.spec.csi.driver
    csi_volume_handle=[string]$volume.spec.csi.volumeHandle
    capacity_bytes=$capacity
    access_mode='ReadWriteOncePod'
} | ConvertTo-Json -Compress
