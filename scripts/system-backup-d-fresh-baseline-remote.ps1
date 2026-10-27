# Isolated fresh schema capture, database-only bootstrap; no local build or installation.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[0-9a-f]{64}$')][string]$Image='10.130.14.23:5000/clawmanager@sha256:d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e',
    [ValidatePattern('^[A-Za-z0-9@._:-]+$')][string]$KubeContext='kubernetes-admin@kubernetes',
    [ValidatePattern('^[a-z0-9][a-z0-9-]+$')][string]$SourceNamespace='clawmanager-zhanghui08-system',
    [ValidatePattern('^[a-f0-9-]{36}$')][string]$SourceNamespaceUID='337cfe30-2c17-4b8e-b32a-760778b8098e',
    [ValidatePattern('^[a-z0-9][a-z0-9.-]+$')][string]$TestNode='node1',
    [switch]$CheckOnly,
    [switch]$CompareLive
)
$ErrorActionPreference='Stop'
$fixDigest='d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e'
if (-not $Image.EndsWith('@sha256:'+$fixDigest)) { throw 'This entry is pinned to the supplied fix16 digest' }
$fixRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixID=[guid]::NewGuid().ToString('N')
$fixScratch=Join-Path $fixRoot ('.tmp-d-fresh-baseline-'+$fixID)
$fixRemote='/tmp/clawmanager-d-fresh-baseline-'+$fixID
$fixPrefix=$fixRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
$fixSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$fixScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$fixOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
$fixRemoteCreated=$false
$fixCleanupFailed=$false
$fixFiles=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-fresh-baseline.py','contracts/system-backup/v12/schema-registry.json','contracts/system-backup/v12/schema-hash-capture.mysql.sql','deployments/mysql/000_database.sql','backend/internal/systembackupcontroller/bootstrap.go')
$fixFiles+=@(Get-ChildItem -LiteralPath (Join-Path $fixRoot 'backend/internal/db/migrations') -File -Filter '*.sql' | ForEach-Object { 'backend/internal/db/migrations/'+$_.Name })
if($CompareLive){
    $fixFiles+=@('scripts/system-backup-d-live-schema-capture.py','deployments/k8s/system-backup-capacity.zh-fix16.candidate.json')
    $comparePlan=Get-Content -LiteralPath (Join-Path $fixRoot 'deployments/k8s/system-backup-capacity.zh-fix16.candidate.json') -Raw | ConvertFrom-Json
    if($comparePlan.namespace -ne $SourceNamespace -or $comparePlan.namespace_uid -ne $SourceNamespaceUID -or $comparePlan.context -ne $KubeContext){throw 'Live comparison target differs from pinned candidate'}
}
foreach($file in $fixFiles){if(-not(Test-Path -LiteralPath (Join-Path $fixRoot $file) -PathType Leaf)){throw "Required source missing: $file"}}
$fixContract=[IO.File]::ReadAllText((Join-Path $fixRoot 'backend/internal/systembackupcontroller/bootstrap.go'))
$fixCatalog=[regex]::Match($fixContract,'(?m)^\s*ContractMigrationCatalogHash\s*=\s*"([0-9a-f]{64})"\s*$').Groups[1].Value
$fixCount=[regex]::Match($fixContract,'(?m)^\s*ContractMigrationCatalogFileCount\s*=\s*([0-9]+)\s*$').Groups[1].Value
if(-not $fixCatalog -or -not $fixCount -or [int]$fixCount -ne ($fixFiles | Where-Object {$_ -like 'backend/internal/db/migrations/*.sql'}).Count){throw 'Local controller contract/catalog count mismatch'}
Write-Output "D_FRESH_BASELINE_PLAN image=$Image target=$SshTarget source_namespace=$SourceNamespace test_node=$TestNode catalog=$fixCatalog migrations=$fixCount"
Push-Location $fixRoot
try {
    & node --input-type=module -e 'import {computeMigrationCatalog} from "./scripts/system-backup-contract-check.mjs"; import {readFileSync} from "node:fs"; const r=JSON.parse(readFileSync("contracts/system-backup/v12/schema-registry.json")); if(computeMigrationCatalog().hash!==r.migration_catalog.hash) process.exit(1);'
    if($LASTEXITCODE -ne 0){throw 'Current catalog bytes do not match registry'}
} finally {Pop-Location}
if($CheckOnly){Write-Output 'PASS local-input-check-only=true image-pull=not-run cluster-contacted=false';return}
try {
    foreach ($tool in @($fixSsh,$fixScp)) { if (-not (Test-Path -LiteralPath $tool)) { throw "Existing OpenSSH tool missing: $tool" } }
    Get-Command tar.exe -ErrorAction Stop | Out-Null
    $fixBundle=Join-Path $fixScratch 'bundle'
    [IO.Directory]::CreateDirectory($fixBundle) | Out-Null
    $fixUTF8=New-Object System.Text.UTF8Encoding($false)
    foreach ($file in $fixFiles) {
        $destination=Join-Path $fixBundle $file
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        [IO.File]::WriteAllText($destination,[IO.File]::ReadAllText((Join-Path $fixRoot $file)).Replace("`r`n","`n"),$fixUTF8)
    }
    $fixArchive=Join-Path $fixScratch 'scripts.tar'
    & tar.exe -cf $fixArchive -C $fixBundle .
    if ($LASTEXITCODE -ne 0) { throw 'Script bundle creation failed' }
    $fixHash=(Get-FileHash -LiteralPath $fixArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    & $fixSsh @fixOptions $SshTarget "set -eu; command -v kubectl >/dev/null; command -v bash >/dev/null; command -v python3 >/dev/null; command -v tar >/dev/null; command -v sha256sum >/dev/null; umask 077; mkdir '$fixRemote'"
    if ($LASTEXITCODE -ne 0) { throw 'SSH or remote tools unavailable; no cluster resources created' }
    $fixRemoteCreated=$true
    & $fixScp @fixOptions $fixArchive "${SshTarget}:$fixRemote/scripts.tar"
    if ($LASTEXITCODE -ne 0) { throw 'Script upload failed' }
    Write-Output "D_FRESH_BASELINE_REMOTE image=$Image source_namespace=$SourceNamespace test_node=$TestNode"
    $fixMode='D_FRESH_BASELINE=1 CONTROLLER_ENABLED_SMOKE=0 CONTROLLER_TRANSITION_SMOKE=0 CONTROLLER_GRANT_DRIFT_SMOKE=0 D_DB_INVARIANT_SMOKE=0'
    $fixTranscript=Join-Path $fixScratch 'private-transcript.txt'
    $fixReceipt=Join-Path $fixScratch 'public-receipt.json'
    & $fixSsh @fixOptions $SshTarget "set -eu; cd '$fixRemote'; echo '$fixHash  scripts.tar' | sha256sum -c -; tar -xf scripts.tar; python3 -B scripts/system-backup-d-fresh-baseline.py source '$KubeContext' '$SourceNamespace' '$SourceNamespaceUID'; unset D_MIGRATION_BINARY D_MIGRATION_BINARY_SHA256 D_PROVIDER_REGISTRATION_SMOKE D_INVARIANT_IMAGE D_INVARIANT_BINARY D_INVARIANT_BINARY_SHA256; KUBE_CONTEXT='$KubeContext' SOURCE_NAMESPACE='$SourceNamespace' TEST_NODE='$TestNode' TEST_APP_IMAGE='$Image' EXPECTED_APP_DIGEST='$fixDigest' $fixMode SCHEMA_CAPTURE=0 DDL_CAPTURE=0 D_SCHEMA_COMPARE=0 bash scripts/system-backup-fresh-migration-smoke.sh" | Out-File -LiteralPath $fixTranscript -Encoding utf8
    $fixRunExit=$LASTEXITCODE
    # Only bounded cleanup/status markers are public. The metadata envelope
    # remains private until the local canonical verifier consumes it.
    Get-Content -LiteralPath $fixTranscript | Where-Object {$_ -match '^(D_BASELINE_STAGE=[a-z-]+$|PASS fresh-migration-replay=|CLEANED namespace=|CLEANUP_PENDING namespace=|CLEANUP_SKIPPED namespace UID changed:)'} | Write-Output
    if ($fixRunExit -ne 0) { throw 'Fresh baseline capture failed; no baseline accepted; retain any cleanup identity above' }
    $fixCompareArgs=@()
    if($CompareLive){
        $fixLiveCapture=Join-Path $fixScratch 'private-live-schema.json'
        & $fixSsh @fixOptions $SshTarget "set -eu; cd '$fixRemote'; python3 -B scripts/system-backup-d-live-schema-capture.py" | Out-File -LiteralPath $fixLiveCapture -Encoding utf8
        if($LASTEXITCODE -ne 0){throw 'Live schema capture failed; no comparison accepted'}
        $fixCompareArgs=@('--compare-live',$fixLiveCapture)
    }
    & node (Join-Path $PSScriptRoot 'system-backup-d-fresh-baseline-receipt.mjs') $fixTranscript @fixCompareArgs | Out-File -LiteralPath $fixReceipt -Encoding utf8
    if($LASTEXITCODE -ne 0){throw 'Local baseline canonical/inventory verification failed'}
    $fixReceiptText=Get-Content -LiteralPath $fixReceipt -Raw

} finally {
    if ($fixRemoteCreated) {
        & $fixSsh @fixOptions $SshTarget "test '$fixRemote' = '/tmp/clawmanager-d-fresh-baseline-$fixID' && test ! -L '$fixRemote' && rm -rf -- '$fixRemote' && test ! -e '$fixRemote'"
        if ($LASTEXITCODE -ne 0) { $fixCleanupFailed=$true; Write-Warning "Remote script cleanup unverified: $fixRemote" }
        else { Write-Output 'CLEANED remote-fresh-baseline-scripts=yes' }
    }
    if (Test-Path -LiteralPath $fixScratch) {
        $resolved=(Resolve-Path -LiteralPath $fixScratch).Path
        if (-not $resolved.StartsWith($fixPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-fresh-baseline-[0-9a-f]{32}$') { throw 'Refusing cleanup outside owned scratch' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output 'CLEANED local-fresh-baseline-scripts=yes'
    if ($fixCleanupFailed) { throw 'Remote script cleanup unverified' }
}

# Emit only after both cleanup phases succeeded. No raw capture is retained.
if($fixReceiptText){Write-Output $fixReceiptText}
