$ErrorActionPreference='Stop'
# Execute the real read-only script with bounded Kubernetes JSON snapshots.
# This function shadows kubectl; no cluster or external command is contacted.
$auditFixtureJson=@'
{
 "pvc":{"metadata":{"name":"audit","namespace":"isolated","uid":"11111111-1111-4111-8111-111111111111"},"spec":{"volumeName":"audit-pv","storageClassName":"audit-retain","volumeMode":"Filesystem","accessModes":["ReadWriteOncePod"],"resources":{"requests":{"storage":"1Gi"}}},"status":{"phase":"Bound","capacity":{"storage":"1Gi"}}},
 "sc":{"metadata":{"name":"audit-retain","uid":"22222222-2222-4222-8222-222222222222"},"provisioner":"reviewed.example.csi","reclaimPolicy":"Retain"},
 "pv":{"metadata":{"name":"audit-pv","uid":"33333333-3333-4333-8333-333333333333"},"spec":{"claimRef":{"name":"audit","namespace":"isolated","uid":"11111111-1111-4111-8111-111111111111"},"storageClassName":"audit-retain","persistentVolumeReclaimPolicy":"Retain","volumeMode":"Filesystem","accessModes":["ReadWriteOncePod"],"capacity":{"storage":"1Gi"},"csi":{"driver":"reviewed.example.csi","volumeHandle":"independent-audit-volume"}},"status":{"phase":"Bound"}},
 "deployment":{"metadata":{"name":"manager","namespace":"isolated","uid":"44444444-4444-4444-8444-444444444444","generation":2},"spec":{"replicas":1,"strategy":{"type":"Recreate"},"template":{"spec":{"containers":[{"name":"manager","image":"example.test/manager@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","volumeMounts":[{"name":"audit-volume","mountPath":"/audit","readOnly":false}]}],"volumes":[{"name":"audit-volume","persistentVolumeClaim":{"claimName":"audit"}}]}}},"status":{"observedGeneration":2}},
 "pods":{"items":[{"metadata":{"name":"manager-pod","namespace":"isolated","uid":"55555555-5555-4555-8555-555555555555","ownerReferences":[{"kind":"ReplicaSet","name":"manager-rs","uid":"66666666-6666-4666-8666-666666666666","controller":true}]},"spec":{"containers":[{"name":"manager","image":"example.test/manager@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","volumeMounts":[{"name":"audit-volume","mountPath":"/audit","readOnly":false}]}],"volumes":[{"name":"audit-volume","persistentVolumeClaim":{"claimName":"audit"}}]},"status":{"phase":"Running"}}]},
 "rs":{"metadata":{"name":"manager-rs","namespace":"isolated","uid":"66666666-6666-4666-8666-666666666666","ownerReferences":[{"kind":"Deployment","name":"manager","uid":"44444444-4444-4444-8444-444444444444","controller":true}]}}
}
'@
function New-AuditFixture {
    $data=$auditFixtureJson | ConvertFrom-Json
    $data | Add-Member -NotePropertyName claims -NotePropertyValue ([pscustomobject]@{items=@($data.pvc)})
    $data | Add-Member -NotePropertyName volumes -NotePropertyValue ([pscustomobject]@{items=@($data.pv)})
    return $data
}
function kubectl {
    $arguments=@($args)
    if($arguments -notcontains 'get'){throw 'Preflight attempted a Kubernetes mutation'}
    $global:recoveryAuditFixtureCalls+=($arguments -join ' ')
    $get=[array]::IndexOf($arguments,'get');$resource=[string]$arguments[$get+1];$name=[string]$arguments[$get+2]
    $body=switch($resource){
        'pvc' {if($name -eq 'audit'){$global:recoveryAuditFixtureData.pvc}else{if($arguments -notcontains '--all-namespaces'){throw 'PVC aliases not checked across namespaces'};$global:recoveryAuditFixtureData.claims}}
        'pv' {if($name -eq 'audit-pv'){$global:recoveryAuditFixtureData.pv}else{$global:recoveryAuditFixtureData.volumes}}
        'storageclass' {$global:recoveryAuditFixtureData.sc}
        'deployment' {$global:recoveryAuditFixtureData.deployment}
        'pods' {$global:recoveryAuditFixtureData.pods}
        'replicaset' {$global:recoveryAuditFixtureData.rs}
        default {throw 'Unexpected kubectl read'}
    }
    $global:LASTEXITCODE=0
    Write-Verbose ('Fixture read resource='+$resource+' name='+$name+' returned='+$body.metadata.name)
    return ($body | ConvertTo-Json -Depth 30 -Compress)
}
function Invoke-AuditFixture([bool]$Manager=$true){
    $parameters=@{KubeContext='reviewed';Namespace='isolated';ClaimName='audit';ExpectedStorageClass='audit-retain';ExpectedCSIDriver='reviewed.example.csi';MinCapacityBytes=1073741824}
    if($Manager){$parameters.DeploymentName='manager';$parameters.ManagerContainerName='manager';$parameters.JournalMountPath='/audit';$parameters.ExpectedManagerImage='example.test/manager@sha256:'+('a'*64)}
    return (& (Join-Path $PSScriptRoot 'system-backup-d-recovery-audit-storage-preflight.ps1') @parameters | ConvertFrom-Json)
}
$global:recoveryAuditFixtureCalls=@();$global:recoveryAuditFixtureData=New-AuditFixture
$result=Invoke-AuditFixture
if($result.result -ne 'STORAGE_PREFLIGHT_PASS_NOT_PRODUCTION_ACCEPTANCE' -or -not $result.deployment_preflight_checked -or $result.writer_pod_uid -ne $global:recoveryAuditFixtureData.pods.items[0].metadata.uid){throw 'Valid manager snapshot rejected'}
Write-Output 'PASS exact manager chain, mounted claim, Retain and single writer'
$global:recoveryAuditFixtureData=New-AuditFixture
if((Invoke-AuditFixture $false).deployment_preflight_checked){throw 'Storage-only result claimed manager validation'}
Write-Output 'PASS storage-only scope stays explicit'
$cases=@(
    @{Name='PVC block mode';Change={$global:recoveryAuditFixtureData.pvc.spec.volumeMode='Block'}},
    @{Name='malformed UID';Change={$global:recoveryAuditFixtureData.pvc.metadata.uid='-'*36}},
    @{Name='mixed access modes';Change={$global:recoveryAuditFixtureData.pvc.spec.accessModes+=@('ReadWriteMany')}},
    @{Name='wrong CSI';Change={$global:recoveryAuditFixtureData.sc.provisioner='wrong.csi'}},
    @{Name='StorageClass Delete';Change={$global:recoveryAuditFixtureData.sc.reclaimPolicy='Delete'}},
    @{Name='PV Delete';Change={$global:recoveryAuditFixtureData.pv.spec.persistentVolumeReclaimPolicy='Delete'}},
    @{Name='capacity insufficient';Change={$global:recoveryAuditFixtureData.pvc.status.capacity.storage='512Mi'}},
    @{Name='request above capacity';Change={$global:recoveryAuditFixtureData.pvc.spec.resources.requests.storage='2Gi'}},
    @{Name='cross-namespace PVC alias';Change={$other=$auditFixtureJson | ConvertFrom-Json;$other.pvc.metadata.namespace='other';$other.pvc.metadata.uid='77777777-7777-4777-8777-777777777777';$global:recoveryAuditFixtureData.claims.items+=@($other.pvc)}},
    @{Name='PV CSI alias';Change={$other=$auditFixtureJson | ConvertFrom-Json;$other.pv.metadata.name='alias-pv';$global:recoveryAuditFixtureData.volumes.items+=@($other.pv)}},
    @{Name='partial PVC inventory';Change={$global:recoveryAuditFixtureData.claims | Add-Member metadata ([pscustomobject]@{continue='more'})}},
    @{Name='missing PV inventory';Change={$global:recoveryAuditFixtureData.volumes.items=@()}},
    @{Name='two replicas';Change={$global:recoveryAuditFixtureData.deployment.spec.replicas=2}},
    @{Name='RollingUpdate';Change={$global:recoveryAuditFixtureData.deployment.spec.strategy.type='RollingUpdate'}},
    @{Name='stale generation';Change={$global:recoveryAuditFixtureData.deployment.status.observedGeneration=1}},
    @{Name='missing generation';Change={$global:recoveryAuditFixtureData.deployment.metadata.PSObject.Properties.Remove('generation')}},
    @{Name='terminating deployment';Change={$global:recoveryAuditFixtureData.deployment.metadata | Add-Member deletionTimestamp '2026-10-14T00:00:00Z'}},
    @{Name='wrong template image';Change={$global:recoveryAuditFixtureData.deployment.spec.template.spec.containers[0].image='mutable:latest'}},
    @{Name='wrong actual image';Change={$global:recoveryAuditFixtureData.pods.items[0].spec.containers[0].image='mutable:latest'}},
    @{Name='mount path drift';Change={$global:recoveryAuditFixtureData.pods.items[0].spec.containers[0].volumeMounts[0].mountPath='/other'}},
    @{Name='subPath alias';Change={$global:recoveryAuditFixtureData.deployment.spec.template.spec.containers[0].volumeMounts[0] | Add-Member subPath 'journal'}},
    @{Name='sidecar writer';Change={$global:recoveryAuditFixtureData.deployment.spec.template.spec.containers+=@([pscustomobject]@{name='sidecar';volumeMounts=@([pscustomobject]@{name='audit-volume';mountPath='/audit';readOnly=$false})})}},
    @{Name='second live Pod';Change={$other=$auditFixtureJson | ConvertFrom-Json;$other.pods.items[0].metadata.name='old-manager';$global:recoveryAuditFixtureData.pods.items+=@($other.pods.items[0])}},
    @{Name='unknown old writer';Change={$other=$auditFixtureJson | ConvertFrom-Json;$other.pods.items[0].status.phase='Unknown';$global:recoveryAuditFixtureData.pods.items+=@($other.pods.items[0])}},
    @{Name='terminating writer';Change={$global:recoveryAuditFixtureData.pods.items[0].metadata | Add-Member deletionTimestamp '2026-10-14T00:00:00Z'}},
    @{Name='wrong controller';Change={$global:recoveryAuditFixtureData.rs.metadata.ownerReferences[0].uid='77777777-7777-4777-8777-777777777777'}}
    @{Name='wrong ReplicaSet name';Change={$global:recoveryAuditFixtureData.rs.metadata.name='wrong-rs'}}
)
foreach($case in $cases){
    $global:recoveryAuditFixtureData=New-AuditFixture
    & $case.Change
    $rejected=$false
    try{$null=Invoke-AuditFixture}catch{$rejected=$true}
    if(-not $rejected){throw ('Invalid snapshot accepted: '+$case.Name)}
    Write-Output ('PASS rejects '+$case.Name)
}
Write-Output ('PASS audit preflight fixtures cases='+($cases.Count+2)+' cluster_actions=none products=none')
