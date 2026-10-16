[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._-]+$')][string]$KubeContext,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')][string]$Namespace,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')][string]$ClaimName,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$')][string]$ExpectedStorageClass,
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9.-]+$')][string]$ExpectedCSIDriver,
    [Parameter(Mandatory=$true)][ValidateRange(4096,9223372036854775807)][long]$MinCapacityBytes,
    [ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')][string]$DeploymentName='',
    [ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')][string]$ManagerContainerName='',
    [string]$JournalMountPath='',
    [string]$ExpectedManagerImage=''
)

$ErrorActionPreference='Stop'
if($DeploymentName){
    if(-not $ManagerContainerName -or $JournalMountPath -notmatch '^/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+$' -or
        @($JournalMountPath.Split('/')) -contains '..' -or @($JournalMountPath.Split('/')) -contains '.' -or
        $ExpectedManagerImage -notmatch '^[A-Za-z0-9./:_-]+@sha256:[a-f0-9]{64}$') { throw 'Deployment preflight requires reviewed container, fixed mount path and immutable image' }
}elseif($ManagerContainerName -or $JournalMountPath -or $ExpectedManagerImage){throw 'Manager inputs require DeploymentName'}
$auditUidPattern='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

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
    @($claim.spec.accessModes).Count -ne 1 -or @($claim.spec.accessModes) -notcontains 'ReadWriteOncePod') {
    throw 'Audit PVC is not an exact Bound single-pod writer claim'
}
$claimUid=[string]$claim.metadata.uid
if ($claimUid -notmatch $auditUidPattern) { throw 'Audit PVC UID is invalid' }
$storageClass=Get-KubeJson -Arguments @('--context',$KubeContext,'get','storageclass',$ExpectedStorageClass,'-o','json')
if($storageClass.metadata.name -ne $ExpectedStorageClass -or $storageClass.metadata.uid -notmatch $auditUidPattern -or
    $storageClass.provisioner -ne $ExpectedCSIDriver -or $storageClass.reclaimPolicy -ne 'Retain') { throw 'Audit StorageClass driver or Retain policy is not reviewed' }
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
    $volume.spec.persistentVolumeReclaimPolicy -ne 'Retain' -or
    @($volume.spec.accessModes).Count -ne 1 -or @($volume.spec.accessModes) -notcontains 'ReadWriteOncePod') {
    throw 'Audit PV binding or CSI single-pod writer identity is invalid'
}
$volumeCapacity=Convert-KubeQuantity ([string]$volume.spec.capacity.storage)
if ($volumeCapacity -lt $MinCapacityBytes -or $volumeCapacity -lt $capacity) {
    throw 'Audit PV capacity is below the bound PVC capacity'
}
$volumeUid=[string]$volume.metadata.uid
if ($volumeUid -notmatch $auditUidPattern) { throw 'Audit PV UID is invalid' }
$allClaims=Get-KubeJson -Arguments @('--context',$KubeContext,'get','pvc','--all-namespaces','-o','json')
if($allClaims.items -isnot [array] -or $allClaims.metadata.continue){throw 'Complete all-namespace PVC inventory is required'}
if(@($allClaims.items | Where-Object {$_.metadata.uid -eq $claimUid -and $_.metadata.name -eq $ClaimName -and $_.metadata.namespace -eq $Namespace}).Count -ne 1){throw 'Audit PVC missing or duplicated in global inventory'}
foreach ($other in @($allClaims.items)) {
    if (($other.metadata.uid -ne $claimUid -or $other.metadata.name -ne $ClaimName -or $other.metadata.namespace -ne $Namespace) -and $other.spec.volumeName -eq $volume.metadata.name) {
        throw 'Another PVC is bound to the audit PV'
    }
}

$deploymentUid=$null;$writerPodUid=$null
if($DeploymentName){
    $deployment=Get-KubeJson -Arguments @('--context',$KubeContext,'--namespace',$Namespace,'get','deployment',$DeploymentName,'-o','json')
    $deploymentUid=[string]$deployment.metadata.uid
    if($deployment.metadata.name -ne $DeploymentName -or $deployment.metadata.namespace -ne $Namespace -or
        $deploymentUid -notmatch $auditUidPattern -or $deployment.metadata.deletionTimestamp -or $deployment.metadata.generation -lt 1 -or
        $deployment.spec.replicas -ne 1 -or $deployment.spec.strategy.type -ne 'Recreate' -or
        $deployment.status.observedGeneration -ne $deployment.metadata.generation){throw 'Manager deployment is not the reviewed single-writer Recreate generation'}
    $auditVolumes=@($deployment.spec.template.spec.volumes | Where-Object {$_.persistentVolumeClaim.claimName -eq $ClaimName})
    if($auditVolumes.Count -ne 1 -or $auditVolumes[0].persistentVolumeClaim.readOnly -eq $true){throw 'Manager must bind exactly one writable dedicated audit claim'}
    $auditVolumeName=[string]$auditVolumes[0].name
    function Assert-AuditContainerMounts {
        param($PodSpec)
        $manager=@($PodSpec.containers | Where-Object {$_.name -eq $ManagerContainerName})
        if($manager.Count -ne 1 -or $manager[0].image -ne $ExpectedManagerImage){throw 'Manager image or container identity differs'}
        $mounts=@($manager[0].volumeMounts | Where-Object {$_.name -eq $auditVolumeName})
        if($mounts.Count -ne 1 -or $mounts[0].mountPath -ne $JournalMountPath -or $mounts[0].readOnly -eq $true -or
            $mounts[0].subPath -or $mounts[0].subPathExpr -or ($mounts[0].mountPropagation -and $mounts[0].mountPropagation -ne 'None')){throw 'Manager audit mount path or writable identity differs'}
        foreach($container in @($PodSpec.containers)+@($PodSpec.initContainers)+@($PodSpec.ephemeralContainers)){
            foreach($mount in @($container.volumeMounts)){
                if($mount.name -eq $auditVolumeName -and -not [object]::ReferenceEquals($container,$manager[0]) -and $mount.readOnly -ne $true){throw 'Another container can write the management journal'}
            }
        }
    }
    Assert-AuditContainerMounts $deployment.spec.template.spec
    $pods=Get-KubeJson -Arguments @('--context',$KubeContext,'get','pods','--all-namespaces','-o','json')
    if($pods.items -isnot [array] -or $pods.metadata.continue){throw 'Complete Pod inventory is required'}
    $live=@($pods.items | Where-Object {
        $_.metadata.namespace -eq $Namespace -and $_.status.phase -notin @('Succeeded','Failed') -and
        @($_.spec.volumes | Where-Object {$_.persistentVolumeClaim.claimName -eq $ClaimName}).Count -gt 0
    })
    if($live.Count -ne 1 -or $live[0].status.phase -ne 'Running' -or $live[0].metadata.deletionTimestamp){throw 'Audit claim has no unique running non-terminating writer; old/unknown writers must be fenced'}
    $pod=$live[0];$writerPodUid=[string]$pod.metadata.uid
    if($writerPodUid -notmatch $auditUidPattern){throw 'Manager Pod UID invalid'}
    $podVolumes=@($pod.spec.volumes | Where-Object {$_.persistentVolumeClaim.claimName -eq $ClaimName})
    if($podVolumes.Count -ne 1 -or $podVolumes[0].name -ne $auditVolumeName -or $podVolumes[0].persistentVolumeClaim.readOnly -eq $true){throw 'Actual manager Pod audit claim differs'}
    Assert-AuditContainerMounts $pod.spec
    $rsOwner=@($pod.metadata.ownerReferences | Where-Object {$_.controller -eq $true -and $_.kind -eq 'ReplicaSet'})
    if($rsOwner.Count -ne 1){throw 'Manager Pod has no exact ReplicaSet controller'}
    $rs=Get-KubeJson -Arguments @('--context',$KubeContext,'--namespace',$Namespace,'get','replicaset',([string]$rsOwner[0].name),'-o','json')
    $parent=@($rs.metadata.ownerReferences | Where-Object {$_.controller -eq $true -and $_.kind -eq 'Deployment'})
    if($rs.metadata.uid -ne $rsOwner[0].uid -or $rs.metadata.name -ne $rsOwner[0].name -or $rs.metadata.namespace -ne $Namespace -or $parent.Count -ne 1 -or
        $parent[0].uid -ne $deploymentUid -or $parent[0].name -ne $DeploymentName){throw 'Manager Pod controller chain differs from deployment'}
}
$allVolumes=Get-KubeJson -Arguments @('--context',$KubeContext,'get','pv','-o','json')
if($allVolumes.items -isnot [array] -or $allVolumes.metadata.continue){throw 'Complete PV inventory is required'}
if(@($allVolumes.items | Where-Object {$_.metadata.uid -eq $volumeUid -and $_.metadata.name -eq $volume.metadata.name}).Count -ne 1){throw 'Audit PV missing or duplicated in inventory'}
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
    storage_class_uid=[string]$storageClass.metadata.uid
    reclaim_policy='Retain'
    csi_driver=[string]$volume.spec.csi.driver
    csi_volume_handle=[string]$volume.spec.csi.volumeHandle
    capacity_bytes=$capacity
    access_mode='ReadWriteOncePod'
    deployment_preflight_checked=[bool]$DeploymentName
    deployment_uid=$deploymentUid
    writer_pod_uid=$writerPodUid
} | ConvertTo-Json -Compress
