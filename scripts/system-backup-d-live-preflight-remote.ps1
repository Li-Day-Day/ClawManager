# Operator-run interactive SSH. Default reviews are read-only apart from scratch.
# ReportMountProbe creates and cleans a disposable namespace/PVC and test Pods.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [ValidatePattern('^[A-Za-z0-9@._:-]+$')][string]$KubeContext='kubernetes-admin@kubernetes',
    [ValidatePattern('^[a-z0-9][a-z0-9-]+$')][string]$Namespace='clawmanager-zhanghui08-system',
    [ValidatePattern('^[a-f0-9-]{36}$')][string]$NamespaceUID='337cfe30-2c17-4b8e-b32a-760778b8098e',
    [switch]$CheckOnly,
    [switch]$UpgradeReview,
    [switch]$LonghornReview,
    [switch]$HostDiagnostics,
    [switch]$HostStorageDetails,
    [switch]$ReportMountProbe,
    [switch]$PrepareReportVolume,
    [switch]$PrepareCapacityAccount
)
$ErrorActionPreference='Stop'
if($PrepareCapacityAccount -and ($PrepareReportVolume -or $ReportMountProbe -or $LonghornReview -or $UpgradeReview -or $HostDiagnostics -or $HostStorageDetails)){throw 'Choose account preparation separately'}
if($ReportMountProbe){$LonghornReview=$true;$HostDiagnostics=$true;$HostStorageDetails=$true}
if($PrepareReportVolume){
    if($ReportMountProbe){throw 'Choose permanent preparation or disposable probe'}
    $LonghornReview=$true;$HostDiagnostics=$true;$HostStorageDetails=$true
    $liveExtra=''
}
if($UpgradeReview -and $LonghornReview){throw 'Choose one read-only review mode'}
if($HostDiagnostics -and -not $LonghornReview){throw 'HostDiagnostics requires LonghornReview'}
if($HostStorageDetails -and -not $HostDiagnostics){throw 'HostStorageDetails requires HostDiagnostics'}
$liveExtra=if($HostDiagnostics){' --host-diagnostics'}else{''}
if($HostStorageDetails){$liveExtra+=' --host-storage-details'}
if($PrepareReportVolume){$liveExtra=''}
$liveRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$liveImage='10.130.14.23:5000/clawmanager@sha256:d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e'
$liveRegistry=Get-Content -LiteralPath (Join-Path $liveRoot 'contracts/system-backup/v12/schema-registry.json') -Raw | ConvertFrom-Json
Push-Location $liveRoot
try {
    $liveComputedRaw=& node --input-type=module -e 'import {computeMigrationCatalog} from "./scripts/system-backup-contract-check.mjs"; console.log(JSON.stringify(computeMigrationCatalog()));'
    if($LASTEXITCODE -ne 0){throw 'Current migration catalog calculation failed'}
    $liveComputed=$liveComputedRaw | ConvertFrom-Json
    if($liveComputed.hash -ne $liveRegistry.migration_catalog.hash){throw 'Current migration bytes differ from registry catalog'}
} finally {Pop-Location}
$liveMigrations=@(Get-ChildItem -LiteralPath (Join-Path $liveRoot 'backend/internal/db/migrations') -File -Filter '*.sql' | Sort-Object Name | ForEach-Object {$_.Name})
$liveExpected=@{image=$liveImage;catalog_sha256=$liveRegistry.migration_catalog.hash;migrations=$liveMigrations;d_tables=@($liveRegistry.objects | Where-Object {$_.owner -eq 'D' -and $_.object_type -eq 'table'} | ForEach-Object {$_.name})}
if($liveMigrations.Count -ne $liveRegistry.migration_catalog.file_count -or $liveExpected.catalog_sha256 -notmatch '^[a-f0-9]{64}$' -or $liveExpected.d_tables.Count -lt 1){throw 'Local registry/catalog invalid'}
$liveProbe=Join-Path $PSScriptRoot 'system-backup-d-live-discovery.py'
if($UpgradeReview){
    $liveProbe=Join-Path $PSScriptRoot 'system-backup-d-upgrade-review.py'
    $liveObservation=Get-Content -LiteralPath (Join-Path $liveRoot 'docs/evidence/system-backup-d-live-readonly-20260929.json') -Raw | ConvertFrom-Json
    if($liveObservation.observation.namespace -ne $Namespace -or $liveObservation.observation.expected_namespace_uid -ne $NamespaceUID){throw 'Upgrade target differs from observed installation'}
    $liveExpected.upgrade_target=@{mysql=$liveObservation.observation.mysql;database=$liveObservation.observation.database}
}
if(-not(Test-Path -LiteralPath $liveProbe -PathType Leaf)){throw 'Read-only probe missing'}
if($LonghornReview){
    $liveProbe=Join-Path $PSScriptRoot 'system-backup-d-longhorn-review.py'
    $liveStorage=Get-Content -LiteralPath (Join-Path $liveRoot 'docs/evidence/system-backup-d-upgrade-review-live-20260929.json') -Raw | ConvertFrom-Json
    $liveDatabase=Get-Content -LiteralPath (Join-Path $liveRoot 'docs/evidence/system-backup-d-live-readonly-20260929.json') -Raw | ConvertFrom-Json
    if($liveStorage.target.namespace -ne $Namespace -or $liveStorage.target.namespace_uid -ne $NamespaceUID -or $liveDatabase.observation.expected_namespace_uid -ne $NamespaceUID){throw 'Storage target differs from observed installation'}
    $liveExpected.storage_target=@{node=@{name=$liveStorage.observation.node.name;uid=$liveStorage.observation.node.uid}}
    $liveExpected.mysql_target=$liveDatabase.observation.mysql
    if(-not(Test-Path -LiteralPath $liveProbe -PathType Leaf)){throw 'Longhorn probe missing'}
}
if($ReportMountProbe){$liveProbe=Join-Path $PSScriptRoot 'system-backup-d-rwx-mount-probe.py'}
if($PrepareReportVolume){$liveProbe=Join-Path $PSScriptRoot 'system-backup-d-report-volume.py'}
if($PrepareCapacityAccount){
    $liveProbe=Join-Path $PSScriptRoot 'system-backup-d-capacity-account.py'
    $accountPlan=Get-Content -LiteralPath (Join-Path $liveRoot 'deployments/k8s/system-backup-capacity.zh-fix16.candidate.json') -Raw | ConvertFrom-Json
    if($accountPlan.context -ne $KubeContext -or $accountPlan.namespace -ne $Namespace -or $accountPlan.namespace_uid -ne $NamespaceUID){throw 'Account target differs from pinned candidate'}
    $liveExpected.capacity_plan=$accountPlan
    $liveExpected.capacity_tables=@($liveRegistry.objects | Where-Object {$_.object_type -eq 'table' -and $_.name -match '^(system_backup_|system_restore_|audit_logs$)'} | ForEach-Object {$_.name} | Sort-Object)
}
$livePlanLabel=if($ReportMountProbe){'D_RWX_TARGET_PLAN'}else{'D_LIVE_READONLY_PLAN'}
Write-Output "$livePlanLabel target=$SshTarget namespace=$Namespace expected_uid=$NamespaceUID image=$liveImage migrations=$($liveMigrations.Count) d_tables=$($liveExpected.d_tables.Count)"
if($UpgradeReview){Write-Output 'D_UPGRADE_REVIEW mode=read-only apply=false storage-create=false'}
if($LonghornReview -and -not $ReportMountProbe -and -not $PrepareReportVolume){Write-Output "D_LONGHORN_REVIEW mode=read-only host-diagnostics=$HostDiagnostics storage-create=false mount-tested=false"}
if($PrepareReportVolume){Write-Output 'D_REPORT_PREPARE permanent-pvc=system-backup-capacity-report retained=true existing-pvc-reuse=false mysql-permissions-changed=false probe-pods-cleaned=true'}
if($PrepareCapacityAccount){Write-Output 'D_ACCOUNT_PREPARE user=cm_capacity_collector secret=system-backup-capacity-dsn all-tables-required=true migration-executed=false credentials-emitted=false'}
if($ReportMountProbe){Write-Output 'D_RWX_MOUNT_PLAN temporary-namespace=true temporary-pvc=true two-nodes=true cleanup=true production-report-pvc=false host-changes=false'}
$liveExpectedJSON=$liveExpected | ConvertTo-Json -Depth 32 -WarningAction Stop
# Serialize before CheckOnly/SSH, so a truncated payload cannot reach the cluster.
$liveRoundTrip=$liveExpectedJSON | ConvertFrom-Json
if($LonghornReview -and ($liveRoundTrip.storage_target.node.uid -ne $liveExpected.storage_target.node.uid -or $liveRoundTrip.mysql_target.pod_uid -ne $liveExpected.mysql_target.pod_uid)){throw 'Storage identity serialization mismatch'}
if($CheckOnly){Write-Output 'PASS local-input-check-only=true cluster-contacted=false';return}
$liveID=[guid]::NewGuid().ToString('N')
$liveScratch=Join-Path $liveRoot ('.tmp-d-live-preflight-'+$liveID)
$liveRemote='/tmp/clawmanager-d-live-preflight-'+$liveID
$liveSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$liveScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$liveOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
$liveRemoteCreated=$false
$liveCleanupFailed=$false
try {
    foreach($tool in @($liveSsh,$liveScp)){if(-not(Test-Path -LiteralPath $tool)){throw 'Existing OpenSSH tools required'}}
    Get-Command tar.exe -ErrorAction Stop | Out-Null
    [IO.Directory]::CreateDirectory($liveScratch)|Out-Null
    $liveUtf8=[Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText((Join-Path $liveScratch 'probe.py'),[IO.File]::ReadAllText($liveProbe).Replace("`r`n","`n"),$liveUtf8)
    [IO.File]::WriteAllText((Join-Path $liveScratch 'expected.json'),$liveExpectedJSON,$liveUtf8)
    $liveArchive=Join-Path $liveScratch 'probe.tar'
    $liveBundleFiles=@('probe.py','expected.json')
    if($ReportMountProbe -or $PrepareReportVolume){
        [IO.File]::WriteAllText((Join-Path $liveScratch 'longhorn_review.py'),[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-longhorn-review.py')).Replace("`r`n","`n"),$liveUtf8)
        $liveBundleFiles+='longhorn_review.py'
    }
    if($PrepareReportVolume){
        [IO.File]::WriteAllText((Join-Path $liveScratch 'system-backup-d-rwx-mount-probe.py'),[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-rwx-mount-probe.py')).Replace("`r`n","`n"),$liveUtf8)
        $liveBundleFiles+='system-backup-d-rwx-mount-probe.py'
    }
    & tar.exe -cf $liveArchive -C $liveScratch @liveBundleFiles
    if($LASTEXITCODE -ne 0){throw 'Read-only bundle creation failed'}
    $liveHash=(Get-FileHash -LiteralPath $liveArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    & $liveSsh @liveOptions $SshTarget "set -eu; command -v python3 >/dev/null; command -v kubectl >/dev/null; command -v tar >/dev/null; command -v sha256sum >/dev/null; umask 077; mkdir '$liveRemote'"
    if($LASTEXITCODE -ne 0){throw 'SSH or existing remote tools unavailable; no dependencies installed'}
    $liveRemoteCreated=$true
    & $liveScp @liveOptions $liveArchive "${SshTarget}:$liveRemote/probe.tar"
    if($LASTEXITCODE -ne 0){throw 'Read-only script transfer failed'}
    & $liveSsh @liveOptions $SshTarget "set -eu; cd '$liveRemote'; echo '$liveHash  probe.tar' | sha256sum -c -; tar -xf probe.tar; set +e; python3 -B probe.py --expected expected.json --context '$KubeContext' --namespace '$Namespace' --namespace-uid '$NamespaceUID'$liveExtra; probe_status=`$?; printf 'D_LIVE_PREFLIGHT_EXIT=%s\n' `$probe_status; exit `$probe_status"
    $liveExit=$LASTEXITCODE
    if($liveExit -eq 2){
        if($PrepareCapacityAccount){Write-Output 'BLOCKED account-stage-see-result-for-mutations-and-reconciliation=true'}
        elseif($ReportMountProbe -or $PrepareReportVolume){Write-Output 'BLOCKED storage-stage-see-result-for-mutations-retained-pvc-and-cleanup=true'}
        else{Write-Output 'BLOCKED prerequisites-reported=true cluster-mutated=false database-mutated=false'}
    }
    elseif($liveExit -ne 0){throw "Read-only preflight failed (exit=$liveExit); retain output for diagnosis"}
} finally {
    if($liveRemoteCreated){
        & $liveSsh @liveOptions $SshTarget "test '$liveRemote' = '/tmp/clawmanager-d-live-preflight-$liveID' && test ! -L '$liveRemote' && rm -rf -- '$liveRemote' && test ! -e '$liveRemote'"
        if($LASTEXITCODE -ne 0){$liveCleanupFailed=$true;Write-Warning "Remote script cleanup unverified: $liveRemote"}
        else{Write-Output 'CLEANED remote-d-live-preflight=yes'}
    }
    if(Test-Path -LiteralPath $liveScratch){
        $liveResolved=(Resolve-Path -LiteralPath $liveScratch).Path
        if(-not $liveResolved.StartsWith($liveRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($liveResolved) -notmatch '^\.tmp-d-live-preflight-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned preflight scratch'}
        Remove-Item -LiteralPath $liveResolved -Recurse -Force
    }
    Write-Output 'CLEANED local-d-live-preflight=yes'
    if($liveCleanupFailed){throw 'Remote cleanup unverified'}
}
