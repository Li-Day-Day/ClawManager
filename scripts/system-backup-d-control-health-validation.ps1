[CmdletBinding()]
param(
    [switch]$Remote,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$GoImage='sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039',
    [string]$ModuleCachePath=(Join-Path $env:USERPROFILE 'go/pkg/mod'),
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$healthRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$healthID=[guid]::NewGuid().ToString('N')
$healthOwner=Join-Path $healthRoot ('.tmp-d-index-cache-'+$healthID)
$healthFrozen=Join-Path $healthOwner 'source'
$healthBundle=Join-Path $healthOwner 'bundle'
$healthRemote='/tmp/clawmanager-d-control-health-'+$healthID
$healthContainer='codex-d-control-health-'+$healthID
$healthManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$healthRemoteCreated=$false
$healthRemoteCleanupPending=$false
if([IO.Path]::GetDirectoryName($healthManifest) -ne [IO.Path]::GetFullPath((Join-Path $healthRoot 'docs/evidence')) -or (Test-Path -LiteralPath $healthManifest)){throw 'Manifest must be a new docs/evidence file'}
$healthModules=[IO.Path]::GetFullPath($ModuleCachePath)
if(-not(Test-Path -LiteralPath $healthModules -PathType Container)){throw 'Existing Go module cache required; dependencies will not be installed'}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$healthSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$healthScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$healthOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
try{
    [IO.Directory]::CreateDirectory($healthOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $healthOwner 'owner.txt'),[IO.Path]::GetFileName($healthOwner))
    $healthSnapshot=New-DIndexSourceSnapshot -Root $healthRoot -Destination $healthFrozen
    $healthStream=[IO.File]::Open($healthManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$healthBytes=[Text.Encoding]::UTF8.GetBytes(($healthSnapshot|ConvertTo-Json -Depth 7));$healthStream.Write($healthBytes,0,$healthBytes.Length)}finally{$healthStream.Dispose()}
    Write-Output ('LOCAL_SOURCE d-control-health-frozen=yes files='+$healthSnapshot.files.Count+' source_sha256='+$healthSnapshot.source_sha256)
    Write-Output ('LOCAL_OWNER control-health-source='+$healthOwner+' container='+$healthContainer)
    & (Join-Path $healthFrozen 'scripts/system-backup-d-control-health-dispatch.test.ps1')
    [IO.Directory]::CreateDirectory($healthBundle)|Out-Null
    $healthNodeExit=Invoke-AEvidenceNative -FilePath 'node' -Arguments @((Join-Path $healthFrozen 'scripts/system-backup-d-control-health-inputs.mjs'),(Join-Path $healthBundle 'd-control-health-inputs.json'))
    if($healthNodeExit -ne 0){throw 'Health input capsule failed'}
    $healthInputHash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $healthBundle 'd-control-health-inputs.json')).Hash.ToLowerInvariant()
    $healthBuild=@'
set -eu
mkdir -p /tmp/cache /tmp/telemetry
printf 'off 2026-10-16' > /tmp/telemetry/mode
go version
go test -mod=readonly -p=2 -count=1 -timeout=180s -json ./internal/systembackupcontroller ./internal/systembackupread
go test -mod=readonly -p=2 -tags systembackup_mysql -count=1 -timeout=60s -json -run '^TestDControlHealthMySQLSeed$' ./internal/systembackupcontroller
go test -mod=readonly -p=2 -tags systembackup_mysql -c -o /out/d-control-health.test ./internal/systembackupcontroller
(
cd /tmp
/out/d-control-health.test -test.run '^TestDControlHealthMySQLSeed$' -test.v -test.count=1 -test.timeout=60s
)
go build -mod=readonly -p=2 -o /out/system-backup-migrate ./cmd/system-backup-migrate
'@
    $healthDockerArgs=@('run','--rm','--pull=never','--name',$healthContainer,'--label',('codex.d-control-health-owner='+$healthID),'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','2','--memory','2048m','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=1280m',
        '--mount',('type=bind,source='+$healthFrozen+',target=/work,readonly'),
        '--mount',('type=bind,source='+$healthModules+',target=/modules,readonly'),
        '--mount',('type=bind,source='+$healthBundle+',target=/out'),
        '--workdir','/work/backend','--env','GOPROXY=off','--env','GOSUMDB=off','--env','GOTOOLCHAIN=local','--env','GOENV=off','--env','GOMODCACHE=/modules','--env','GOCACHE=/tmp/cache','--env','GOTMPDIR=/tmp','--env','TEST_TELEMETRY_DIR=/tmp/telemetry','--env','CGO_ENABLED=0','--env','GOMAXPROCS=2',
        '--env','D_CONTROL_HEALTH_INPUTS=/out/d-control-health-inputs.json','--env',('D_CONTROL_HEALTH_INPUTS_SHA256='+$healthInputHash),$GoImage,'sh','-c',$healthBuild)
    $healthExit=Invoke-AEvidenceNative -FilePath 'docker' -Arguments $healthDockerArgs
    if($healthExit -ne 0){throw ('Health local gate failed exit='+$healthExit+'; no remote test has started')}
    $healthNodeExit=Invoke-AEvidenceNative -FilePath 'node' -Arguments @((Join-Path $healthFrozen 'scripts/system-backup-d-control-health-bundle.mjs'),$healthFrozen,$healthBundle)
    if($healthNodeExit -ne 0){throw 'Health bundle pinning failed'}
    $healthPins=[IO.File]::ReadAllText((Join-Path $healthBundle 'bundle-pins.json'))|ConvertFrom-Json
    $healthBinaryHash=($healthPins.pins|Where-Object {$_.path -eq 'd-control-health.test'}).sha256
    $healthMigrationHash=($healthPins.pins|Where-Object {$_.path -eq 'system-backup-migrate'}).sha256
    Test-DIndexSourceSnapshot -Root $healthFrozen -Manifest $healthSnapshot
    Write-Output ('LOCAL_PASS d-control-health-model-and-seed=yes linux-binary-sha256='+$healthBinaryHash+' migration-sha256='+$healthMigrationHash+' inputs-sha256='+$healthInputHash+' real_mysql=not_run production_approval=no')
    if($Remote){
        $healthArchive=Join-Path $healthOwner 'bundle.tar'
        & tar.exe -cf $healthArchive -C $healthBundle .
        if($LASTEXITCODE -ne 0){throw 'Health bundle archive failed'}
        $healthArchiveHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $healthArchive).Hash.ToLowerInvariant()
        $healthExit=Invoke-AEvidenceNative -FilePath $healthSsh -Arguments ($healthOptions+@($SshTarget,"set -eu; umask 077; mkdir '$healthRemote'"))
        if($healthExit -ne 0){throw 'SSH unavailable; no remote test started'}
        $healthRemoteCreated=$true
        $healthExit=Invoke-AEvidenceNative -FilePath $healthScp -Arguments ($healthOptions+@($healthArchive,"${SshTarget}:$healthRemote/bundle.tar"))
        if($healthExit -ne 0){throw 'Health bundle upload failed'}
        $healthCommand="set -eu; cd '$healthRemote'; echo '$healthArchiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; bash -n scripts/system-backup-fresh-migration-smoke.sh; bash -n scripts/system-backup-d-provider-registration-phase.sh; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea' EXPECTED_APP_DIGEST='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea' D_MIGRATION_BINARY='$healthRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$healthMigrationHash' D_DB_INVARIANT_SMOKE=1 D_PROVIDER_REGISTRATION_SMOKE=1 D_INVARIANT_BINARY='$healthRemote/d-control-health.test' D_INVARIANT_BINARY_SHA256='$healthBinaryHash' D_PROVIDER_REGISTRATION_DDL='$healthRemote/d-control-health-inputs.json' D_PROVIDER_REGISTRATION_DDL_SHA256='$healthInputHash' bash scripts/system-backup-fresh-migration-smoke.sh"
        $healthExit=Invoke-AEvidenceNative -FilePath $healthSsh -Arguments ($healthOptions+@($SshTarget,$healthCommand))
        if($healthExit -ne 0){throw 'Health MySQL gate failed; retain exact CLEANUP_PENDING identities'}
    }
    Test-DIndexSourceSnapshot -Root $healthFrozen -Manifest $healthSnapshot
    Write-Output ('LOCAL_PASS d-control-health-frozen-postcheck=yes remote-requested='+[bool]$Remote+' dependencies-installed=no')
}finally{
    if($healthRemoteCreated){
        $healthCleanup=Invoke-AEvidenceNative -FilePath $healthSsh -Arguments ($healthOptions+@($SshTarget,"test '$healthRemote' = '/tmp/clawmanager-d-control-health-$healthID' && test ! -L '$healthRemote' && rm -rf -- '$healthRemote' && test ! -e '$healthRemote'"))
        if($healthCleanup -ne 0){$healthRemoteCleanupPending=$true;Write-Warning ('CLEANUP_PENDING remote scratch='+$healthRemote)}else{Write-Output 'CLEANED control-health-remote-scratch=yes'}
    }
    if(Test-Path -LiteralPath $healthOwner){
        $healthResolved=(Resolve-Path -LiteralPath $healthOwner).Path
        if([IO.Path]::GetDirectoryName($healthResolved) -ne $healthRoot -or [IO.Path]::GetFileName($healthResolved) -ne ('.tmp-d-index-cache-'+$healthID) -or ((Get-Item -Force -LiteralPath $healthResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $healthResolved 'owner.txt')) -ne [IO.Path]::GetFileName($healthResolved)){throw 'Refusing health cleanup outside exact owned directory'}
        Remove-Item -LiteralPath $healthResolved -Recurse -Force -ErrorAction Stop
    }
    Write-Output ('CLEANED control-health-local-source-cache='+(-not(Test-Path -LiteralPath $healthOwner)))
    if($healthRemoteCleanupPending){throw 'Remote health scratch cleanup unverified'}
}
