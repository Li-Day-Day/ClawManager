[CmdletBinding()]
param(
    [switch]$Remote,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$registrationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$registrationPrefix=$registrationRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
$registrationID=[guid]::NewGuid().ToString('N')
$registrationScratch=Join-Path $registrationRoot ('.tmp-d-registration-'+$registrationID)
$registrationRemote='/tmp/clawmanager-d-registration-'+$registrationID
$registrationNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','GOCACHE','GOTMPDIR','GOMAXPROCS')
$registrationPrevious=@{}
foreach ($name in $registrationNames) { $registrationPrevious[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
$registrationCreated=$false
$registrationCleanupFailed=$false
$registrationSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$registrationScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$registrationOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
try {
    $registrationBundle=Join-Path $registrationScratch 'bundle'
    foreach ($folder in @('bundle','cache','tmp')) { [IO.Directory]::CreateDirectory((Join-Path $registrationScratch $folder)) | Out-Null }
    $env:GO111MODULE='on'; $env:GOWORK='off'; $env:GOFLAGS="-mod=readonly -p=$BuildParallelism"; $env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOTELEMETRY='off'; $env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $registrationScratch 'cache'; $env:GOTMPDIR=Join-Path $registrationScratch 'tmp'
    $env:GOOS='windows'; $env:GOARCH='amd64'
    Push-Location (Join-Path $registrationRoot 'backend')
    try {
        & go test -count=1 ./internal/systembackupsecurity ./internal/db ./internal/migrationcoord ./internal/migrationcatalog ./cmd/system-backup-migrate
        if ($LASTEXITCODE -ne 0) { throw 'Security/transaction tests failed; dependencies will not be installed' }
        $env:GOOS='linux'
        $registrationBinary=Join-Path $registrationBundle 'd-provider-registration.test'
        & go test -c -tags systembackup_mysql -o $registrationBinary ./internal/systembackupsecurity
        if ($LASTEXITCODE -ne 0) { throw 'MySQL probe compilation failed; dependencies will not be installed' }
        & go build -o (Join-Path $registrationBundle 'system-backup-registration') ./cmd/system-backup-registration
        if ($LASTEXITCODE -ne 0) { throw 'HTTPS registration service compilation failed; dependencies will not be installed' }
        & go build -o (Join-Path $registrationBundle 'system-backup-migrate') ./cmd/system-backup-migrate
        if ($LASTEXITCODE -ne 0) { throw 'Pinned migration runner compilation failed; dependencies will not be installed' }
    } finally { Pop-Location }
    $registrationUTF8=New-Object System.Text.UTF8Encoding($false)
    $registrationDDL=''
    foreach ($spec in @(@('065_add_system_backup_control_metadata_core.sql','system_backup_installation_state'),@('066_add_system_backup_config_and_operations.sql','system_backup_configs'),@('065_add_system_backup_control_metadata_core.sql','system_backup_evidence'),@('066_add_system_backup_config_and_operations.sql','system_backup_operations'),@('075_add_system_backup_strong_auth_nonces.sql','system_backup_strong_auth_nonces'))) {
        $sql=[IO.File]::ReadAllText((Join-Path $registrationRoot ('backend/internal/db/migrations/'+$spec[0]))).Replace("`r`n","`n")
        $pattern='(?ms)^CREATE TABLE IF NOT EXISTS '+$spec[1]+' \(.*?^\) ENGINE=InnoDB[^;]*;'
        $matchesFound=[regex]::Matches($sql,$pattern)
        if ($matchesFound.Count -ne 1) { throw 'Could not extract exact production CREATE TABLE statement' }
        $registrationDDL+=$matchesFound[0].Value+"`n"
    }
    $registrationDDLPath=Join-Path $registrationBundle 'd-provider-registration.sql'
    $registrationDDL += [IO.File]::ReadAllText((Join-Path $registrationRoot 'backend/internal/db/migrations/080_add_system_backup_registration_runtime.sql')).Replace("`r`n","`n")+"`n"
    [IO.File]::WriteAllText($registrationDDLPath,$registrationDDL,$registrationUTF8)
    $registrationBinaryHash=(Get-FileHash -LiteralPath $registrationBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    $registrationDDLHash=(Get-FileHash -LiteralPath $registrationDDLPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $registrationMigrationHash=(Get-FileHash -LiteralPath (Join-Path $registrationBundle 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output "LOCAL_PASS registration-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=$registrationBinaryHash ddl_sha256=$registrationDDLHash"
    Write-Output "LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=$registrationMigrationHash"
    if ($Remote) {
        $files=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-provider-registration-phase.sh','scripts/system-backup-d-migration-phase.sh','backend/internal/systembackupcontroller/bootstrap.go')
        $files+=@(Get-ChildItem -LiteralPath (Join-Path $registrationRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | ForEach-Object { 'backend/internal/db/migrations/'+$_.Name })
        foreach ($file in $files) {
            $destination=Join-Path $registrationBundle $file
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            [IO.File]::WriteAllText($destination,[IO.File]::ReadAllText((Join-Path $registrationRoot $file)).Replace("`r`n","`n"),$registrationUTF8)
        }
        $registrationArchive=Join-Path $registrationScratch 'bundle.tar'
        & tar.exe -cf $registrationArchive -C $registrationBundle .
        if ($LASTEXITCODE -ne 0) { throw 'Bundle creation failed' }
        $archiveHash=(Get-FileHash -LiteralPath $registrationArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        & $registrationSsh @registrationOptions $SshTarget "set -eu; umask 077; mkdir '$registrationRemote'"
        if ($LASTEXITCODE -ne 0) { throw 'SSH unavailable; no remote test started' }
        $registrationCreated=$true
        & $registrationScp @registrationOptions $registrationArchive "${SshTarget}:$registrationRemote/bundle.tar"
        if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }
        $digest='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea'
        & $registrationSsh @registrationOptions $SshTarget "set -eu; cd '$registrationRemote'; echo '$archiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:$digest' EXPECTED_APP_DIGEST='$digest' D_MIGRATION_BINARY='$registrationRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$registrationMigrationHash' D_DB_INVARIANT_SMOKE=1 D_PROVIDER_REGISTRATION_SMOKE=1 D_INVARIANT_BINARY='$registrationRemote/d-provider-registration.test' D_INVARIANT_BINARY_SHA256='$registrationBinaryHash' D_PROVIDER_REGISTRATION_DDL='$registrationRemote/d-provider-registration.sql' D_PROVIDER_REGISTRATION_DDL_SHA256='$registrationDDLHash' bash scripts/system-backup-fresh-migration-smoke.sh"
        if ($LASTEXITCODE -ne 0) { throw 'MySQL validation failed; retain any CLEANUP_PENDING identity' }
    }
} finally {
    foreach ($name in $registrationNames) { [Environment]::SetEnvironmentVariable($name,$registrationPrevious[$name],'Process') }
    if ($registrationCreated) {
        & $registrationSsh @registrationOptions $SshTarget "test '$registrationRemote' = '/tmp/clawmanager-d-registration-$registrationID' && test ! -L '$registrationRemote' && rm -rf -- '$registrationRemote' && test ! -e '$registrationRemote'"
        if ($LASTEXITCODE -ne 0) { $registrationCleanupFailed=$true; Write-Warning "CLEANUP_PENDING remote scratch $registrationRemote" }
        else { Write-Output 'CLEANED remote-registration-scratch=yes' }
    }
    if (Test-Path -LiteralPath $registrationScratch) {
        $resolved=(Resolve-Path -LiteralPath $registrationScratch).Path
        if (-not $resolved.StartsWith($registrationPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-registration-[a-f0-9]{32}$') { throw 'Refusing cleanup outside owned scratch' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output ('CLEANED local-registration-build-cache='+(-not (Test-Path -LiteralPath $registrationScratch)))
    if ($registrationCleanupFailed) { throw 'Remote scratch cleanup unverified' }
}
