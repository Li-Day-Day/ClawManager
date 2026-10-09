# Transfer scripts and execute the user's already-built image. No local build.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[0-9a-f]{64}$')][string]$Image='10.130.14.23:5000/clawmanager@sha256:be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea',
    [ValidatePattern('^[A-Za-z0-9@._:-]+$')][string]$KubeContext='kubernetes-admin@kubernetes',
    [ValidatePattern('^[a-z0-9][a-z0-9-]+$')][string]$SourceNamespace='clawmanager-zhanghui08-system',
    [ValidatePattern('^[a-z0-9][a-z0-9.-]+$')][string]$TestNode='node1',
    [ValidatePattern('^$|^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[0-9a-f]{64}$')][string]$ProbeImage=''
)
$ErrorActionPreference='Stop'
$fixDigest='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea'
if (-not $Image.EndsWith('@sha256:'+$fixDigest)) { throw 'This entry is pinned to the supplied fix15 digest' }
$fixRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixID=[guid]::NewGuid().ToString('N')
$fixScratch=Join-Path $fixRoot ('.tmp-d-fix15-'+$fixID)
$fixRemote='/tmp/clawmanager-d-fix15-'+$fixID
$fixPrefix=$fixRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
$fixSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$fixScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$fixOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
$fixRemoteCreated=$false
$fixCleanupFailed=$false
try {
    foreach ($tool in @($fixSsh,$fixScp)) { if (-not (Test-Path -LiteralPath $tool)) { throw "Existing OpenSSH tool missing: $tool" } }
    Get-Command tar.exe -ErrorAction Stop | Out-Null
    $fixBundle=Join-Path $fixScratch 'bundle'
    [IO.Directory]::CreateDirectory($fixBundle) | Out-Null
    $fixFiles=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-controller-enabled-phase.sh','scripts/system-backup-controller-enabled-fixture.mysql.sql','scripts/system-backup-controller-enabled-grants.mysql.sql','scripts/system-backup-controller-transition-phase.sh','scripts/system-backup-controller-grant-drift-phase.sh','deployments/k8s/system-backup-controller.yaml','backend/internal/systembackupcontroller/bootstrap.go')
    $fixFiles+=@(Get-ChildItem -LiteralPath (Join-Path $fixRoot 'backend/internal/db/migrations') -File -Filter '*.sql' | ForEach-Object { 'backend/internal/db/migrations/'+$_.Name })
    if ($ProbeImage) { $fixFiles+=@('scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-invariants-image-phase.sh') }
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
    & $fixSsh @fixOptions $SshTarget "set -eu; command -v kubectl >/dev/null; command -v bash >/dev/null; command -v tar >/dev/null; command -v sha256sum >/dev/null; umask 077; mkdir '$fixRemote'"
    if ($LASTEXITCODE -ne 0) { throw 'SSH or remote tools unavailable; no cluster resources created' }
    $fixRemoteCreated=$true
    & $fixScp @fixOptions $fixArchive "${SshTarget}:$fixRemote/scripts.tar"
    if ($LASTEXITCODE -ne 0) { throw 'Script upload failed' }
    Write-Output "FIX15_REMOTE_TEST image=$Image source_namespace=$SourceNamespace test_node=$TestNode"
    $fixMode='CONTROLLER_ENABLED_SMOKE=1 CONTROLLER_TRANSITION_SMOKE=1 CONTROLLER_GRANT_DRIFT_SMOKE=1 D_DB_INVARIANT_SMOKE=0'
    if ($ProbeImage) {
        $fixMode="CONTROLLER_ENABLED_SMOKE=0 CONTROLLER_TRANSITION_SMOKE=0 CONTROLLER_GRANT_DRIFT_SMOKE=0 D_DB_INVARIANT_SMOKE=1 D_INVARIANT_IMAGE='$ProbeImage'"
        Write-Output "D_DATABASE_PROBE image=$ProbeImage"
    }
    & $fixSsh @fixOptions $SshTarget "set -eu; cd '$fixRemote'; echo '$fixHash  scripts.tar' | sha256sum -c -; tar -xf scripts.tar; KUBE_CONTEXT='$KubeContext' SOURCE_NAMESPACE='$SourceNamespace' TEST_NODE='$TestNode' TEST_APP_IMAGE='$Image' EXPECTED_APP_DIGEST='$fixDigest' $fixMode SCHEMA_CAPTURE=0 DDL_CAPTURE=0 D_SCHEMA_COMPARE=0 bash scripts/system-backup-fresh-migration-smoke.sh"
    if ($LASTEXITCODE -ne 0) { throw 'fix15 isolated smoke failed; return the output including any cleanup identity' }
} finally {
    if ($fixRemoteCreated) {
        & $fixSsh @fixOptions $SshTarget "test '$fixRemote' = '/tmp/clawmanager-d-fix15-$fixID' && test ! -L '$fixRemote' && rm -rf -- '$fixRemote' && test ! -e '$fixRemote'"
        if ($LASTEXITCODE -ne 0) { $fixCleanupFailed=$true; Write-Warning "Remote script cleanup unverified: $fixRemote" }
        else { Write-Output 'CLEANED remote-fix15-scripts=yes' }
    }
    if (Test-Path -LiteralPath $fixScratch) {
        $resolved=(Resolve-Path -LiteralPath $fixScratch).Path
        if (-not $resolved.StartsWith($fixPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-fix15-[0-9a-f]{32}$') { throw 'Refusing cleanup outside owned scratch' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output 'CLEANED local-fix15-scripts=yes'
    if ($fixCleanupFailed) { throw 'Remote script cleanup unverified' }
}
