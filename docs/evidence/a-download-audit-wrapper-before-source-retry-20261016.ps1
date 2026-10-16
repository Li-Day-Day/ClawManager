[CmdletBinding()]
param(
    [switch]$Remote,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$GoImage='sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039',
    [string]$ModuleCachePath=(Join-Path $env:USERPROFILE 'go/pkg/mod'),
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$auditRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$auditID=[guid]::NewGuid().ToString('N')
$auditOwner=Join-Path $auditRoot ('.tmp-d-index-cache-'+$auditID)
$auditFrozen=Join-Path $auditOwner 'source'
$auditBundle=Join-Path $auditOwner 'bundle'
$auditRemote='/tmp/clawmanager-d-download-audit-'+$auditID
$auditContainer='codex-d-download-audit-'+$auditID
$auditManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$auditRemoteCreated=$false
$auditRemoteCleanupPending=$false
$auditBash=Join-Path $env:ProgramFiles 'Git/bin/bash.exe'
if(-not(Test-Path -LiteralPath $auditBash -PathType Leaf)){throw 'Existing Git Bash required for syntax validation; nothing will be installed'}
if([IO.Path]::GetDirectoryName($auditManifest) -ne [IO.Path]::GetFullPath((Join-Path $auditRoot 'docs/evidence')) -or (Test-Path -LiteralPath $auditManifest)){throw 'Manifest must be a new docs/evidence file'}
$auditModules=[IO.Path]::GetFullPath($ModuleCachePath)
if(-not(Test-Path -LiteralPath $auditModules -PathType Container)){throw 'Existing Go module cache required; no dependency installation'}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$auditSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$auditScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$auditOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
try {
    [IO.Directory]::CreateDirectory($auditOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $auditOwner 'owner.txt'),[IO.Path]::GetFileName($auditOwner))
    $auditSnapshot=New-DIndexSourceSnapshot -Root $auditRoot -Destination $auditFrozen
    $auditStream=[IO.File]::Open($auditManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$auditBytes=[Text.Encoding]::UTF8.GetBytes(($auditSnapshot|ConvertTo-Json -Depth 7));$auditStream.Write($auditBytes,0,$auditBytes.Length)}finally{$auditStream.Dispose()}
    Write-Output ('LOCAL_SOURCE d-download-audit-frozen=yes files='+$auditSnapshot.files.Count+' source_sha256='+$auditSnapshot.source_sha256)
    Write-Output ('LOCAL_OWNER download-audit-source='+$auditOwner+' container='+$auditContainer)
    & (Join-Path $auditFrozen 'scripts/system-backup-d-download-audit-dispatch.test.ps1')
    $auditExit=Invoke-AEvidenceNative -FilePath $auditBash -Arguments @('-n',(Join-Path $auditFrozen 'scripts/system-backup-d-download-audit-phase.sh').Replace('\','/'))
    if($auditExit -ne 0){throw 'Audit phase Bash syntax failed'}
    [IO.Directory]::CreateDirectory($auditBundle)|Out-Null
    $auditExit=Invoke-AEvidenceNative -FilePath 'node' -Arguments @((Join-Path $auditFrozen 'scripts/system-backup-d-download-audit-bundle.mjs'),'inputs',(Join-Path $auditBundle 'd-download-audit-inputs.json'))
    if($auditExit -ne 0){throw 'Audit input capsule failed'}
    $auditInputHash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $auditBundle 'd-download-audit-inputs.json')).Hash.ToLowerInvariant()
    $auditBuild=@'
set -eu
mkdir -p /tmp/cache /tmp/telemetry
printf 'off 2026-10-16' > /tmp/telemetry/mode
go version
run_report() {
  report="$1"
  shift
  set +e
  "$@" > "/tmp/$report" 2>&1
  result=$?
  set -e
  cat "/tmp/$report"
  if [ "$result" -ne 0 ]; then exit "$result"; fi
}
# Keep terminal/transcript backpressure outside short-lived execution grants.
# Original Go timestamps and exit status are retained; no retries or skips.
printf 'LOCAL_STAGE download-audit buffered-reports=yes default-vet=yes retry=no\n'
run_report full.json go test -mod=readonly -p=2 -count=1 -timeout=600s -json ./internal/systembackupsecurity ./internal/systembackupevidence
run_report seed.json go test -mod=readonly -p=2 -tags systembackup_mysql -count=1 -timeout=60s -json -run '^TestDDownloadAdmissionAuditMySQLSeed$' ./internal/systembackupevidence
go test -mod=readonly -p=2 -tags systembackup_mysql -c -o /out/d-download-audit.test ./internal/systembackupevidence
(cd /tmp; /out/d-download-audit.test -test.run '^TestDDownloadAdmissionAuditMySQLSeed$' -test.v -test.count=1 -test.timeout=60s)
go build -mod=readonly -p=2 -o /out/system-backup-migrate ./cmd/system-backup-migrate
'@
    $auditDocker=@('run','--rm','--pull=never','--name',$auditContainer,'--label',('codex.d-download-audit-owner='+$auditID),'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','2','--memory','2048m','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=1280m',
        '--mount',('type=bind,source='+$auditFrozen+',target=/work,readonly'),'--mount',('type=bind,source='+$auditModules+',target=/modules,readonly'),'--mount',('type=bind,source='+$auditBundle+',target=/out'),
        '--workdir','/work/backend','--env','GOPROXY=off','--env','GOSUMDB=off','--env','GOTOOLCHAIN=local','--env','GOENV=off','--env','GOMODCACHE=/modules','--env','GOCACHE=/tmp/cache','--env','GOTMPDIR=/tmp','--env','TEST_TELEMETRY_DIR=/tmp/telemetry','--env','CGO_ENABLED=0','--env','GOMAXPROCS=2',
        '--env','D_DOWNLOAD_AUDIT_INPUTS=/out/d-download-audit-inputs.json','--env',('D_DOWNLOAD_AUDIT_INPUTS_SHA256='+$auditInputHash),$GoImage,'sh','-c',$auditBuild)
    $auditExit=Invoke-AEvidenceNative -FilePath 'docker' -Arguments $auditDocker
    if($auditExit -ne 0){throw ('Download audit local gate failed exit='+$auditExit+'; remote not started')}
    $auditExit=Invoke-AEvidenceNative -FilePath 'node' -Arguments @((Join-Path $auditFrozen 'scripts/system-backup-d-download-audit-bundle.mjs'),'bundle',$auditFrozen,$auditBundle)
    if($auditExit -ne 0){throw 'Audit bundle failed'}
    $auditPins=[IO.File]::ReadAllText((Join-Path $auditBundle 'bundle-pins.json'))|ConvertFrom-Json
    $auditBinaryHash=($auditPins.pins|Where-Object {$_.path -eq 'd-download-audit.test'}).sha256
    $auditRunnerHash=($auditPins.pins|Where-Object {$_.path -eq 'system-backup-migrate'}).sha256
    Test-DIndexSourceSnapshot -Root $auditFrozen -Manifest $auditSnapshot
    Write-Output ('LOCAL_PASS d-download-audit-model-and-seed=yes linux-binary-sha256='+$auditBinaryHash+' migration-sha256='+$auditRunnerHash+' inputs-sha256='+$auditInputHash+' real_mysql=not_run production_approval=no')
    if($Remote) {
        $auditArchive=Join-Path $auditOwner 'bundle.tar'
        & tar.exe -cf $auditArchive -C $auditBundle .
        if($LASTEXITCODE -ne 0){throw 'Audit archive failed'}
        $auditArchiveHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $auditArchive).Hash.ToLowerInvariant()
        # Cleanup the exact owned identity even if mkdir's reply is lost.
        $auditRemoteCreated=$true
        $auditExit=Invoke-AEvidenceNative -FilePath $auditSsh -Arguments ($auditOptions+@($SshTarget,"set -eu; umask 077; mkdir '$auditRemote'"))
        if($auditExit -ne 0){throw 'SSH unavailable; remote test not started'}
        $auditExit=Invoke-AEvidenceNative -FilePath $auditScp -Arguments ($auditOptions+@($auditArchive,"${SshTarget}:$auditRemote/bundle.tar"))
        if($auditExit -ne 0){throw 'Audit upload failed'}
        $auditCommand="set -eu; cd '$auditRemote'; echo '$auditArchiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; bash -n scripts/system-backup-fresh-migration-smoke.sh; bash -n scripts/system-backup-d-provider-registration-phase.sh; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea' EXPECTED_APP_DIGEST='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea' D_MIGRATION_BINARY='$auditRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$auditRunnerHash' D_DB_INVARIANT_SMOKE=1 D_PROVIDER_REGISTRATION_SMOKE=1 D_INVARIANT_BINARY='$auditRemote/d-download-audit.test' D_INVARIANT_BINARY_SHA256='$auditBinaryHash' D_PROVIDER_REGISTRATION_DDL='$auditRemote/d-download-audit-inputs.json' D_PROVIDER_REGISTRATION_DDL_SHA256='$auditInputHash' bash scripts/system-backup-fresh-migration-smoke.sh"
        $auditExit=Invoke-AEvidenceNative -FilePath $auditSsh -Arguments ($auditOptions+@($SshTarget,$auditCommand))
        if($auditExit -ne 0){throw 'Download audit MySQL gate failed; preserve exact CLEANUP_PENDING identities'}
    }
    Test-DIndexSourceSnapshot -Root $auditFrozen -Manifest $auditSnapshot
    Write-Output ('LOCAL_PASS d-download-audit-frozen-postcheck=yes remote-requested='+[bool]$Remote+' dependencies-installed=no')
} finally {
    if($auditRemoteCreated) {
        $auditCleanup=Invoke-AEvidenceNative -FilePath $auditSsh -Arguments ($auditOptions+@($SshTarget,"test '$auditRemote' = '/tmp/clawmanager-d-download-audit-$auditID' && test ! -L '$auditRemote' && rm -rf -- '$auditRemote' && test ! -e '$auditRemote'"))
        if($auditCleanup -ne 0){$auditRemoteCleanupPending=$true;Write-Warning ('CLEANUP_PENDING remote scratch='+$auditRemote)}else{Write-Output 'CLEANED download-audit-remote-scratch=yes'}
    }
    if(Test-Path -LiteralPath $auditOwner) {
        $auditResolved=(Resolve-Path -LiteralPath $auditOwner).Path
        if([IO.Path]::GetDirectoryName($auditResolved) -ne $auditRoot -or [IO.Path]::GetFileName($auditResolved) -ne ('.tmp-d-index-cache-'+$auditID) -or ((Get-Item -Force -LiteralPath $auditResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $auditResolved 'owner.txt')) -ne [IO.Path]::GetFileName($auditResolved)){throw 'Refusing audit cleanup outside exact owner'}
        Remove-Item -LiteralPath $auditResolved -Recurse -Force
    }
    Write-Output ('CLEANED download-audit-local-source-cache='+(-not(Test-Path -LiteralPath $auditOwner)))
    if($auditRemoteCleanupPending){throw 'Remote audit scratch cleanup unverified'}
}
