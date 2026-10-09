[CmdletBinding()]
param(
    [switch]$Remote,
    [switch]$ProducerService,
    [switch]$ProducerRecoveryOnly,
    [ValidateSet('D','A')][string]$RecoveryTest='D',
    [switch]$IncludeSecurity,
    [switch]$IncludeAuth,
    [switch]$AuthSourceOnly,
    [switch]$LoginSessionsOnly,
    [switch]$LoginStateOnly,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
if ($IncludeAuth -and $AuthSourceOnly) { throw 'Choose full auth packages or the explicitly limited auth source gate' }
if ($LoginSessionsOnly -and ($IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly)) { throw 'LoginSessionsOnly cannot be combined with other validation profiles' }
if ($LoginStateOnly -and ($LoginSessionsOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly)) { throw 'LoginStateOnly cannot be combined with other validation profiles' }
if (($ProducerService -or $ProducerRecoveryOnly) -and ($IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $LoginSessionsOnly -or $LoginStateOnly -or ($ProducerService -and $ProducerRecoveryOnly))) { throw 'Producer profiles must be selected separately' }
if ($RecoveryTest -eq 'A' -and -not $ProducerRecoveryOnly) { throw 'RecoveryTest A requires ProducerRecoveryOnly' }
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
# The proposed GC constraint change is applied only inside the isolated probe DB.
$evidenceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidencePrefix=$evidenceRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
$evidenceID=[guid]::NewGuid().ToString('N')
$evidenceScratch=Join-Path $evidenceRoot ('.tmp-a-evidence-'+$evidenceID)
$evidenceRemote='/tmp/clawmanager-a-evidence-'+$evidenceID
$evidenceNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$evidencePrevious=@{}
foreach ($name in $evidenceNames) { $evidencePrevious[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
$evidenceCreated=$false
$evidenceCleanupFailed=$false
$evidenceSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$evidenceScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$evidenceOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
try {
    $evidenceBundle=Join-Path $evidenceScratch 'bundle'
    foreach ($folder in @('bundle','cache','tmp')) { [IO.Directory]::CreateDirectory((Join-Path $evidenceScratch $folder)) | Out-Null }
    $env:GO111MODULE='on'; $env:GOWORK='off'; $env:GOFLAGS="-mod=readonly -p=$BuildParallelism"; $env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $evidenceScratch 'cache'; $env:GOTMPDIR=Join-Path $evidenceScratch 'tmp'
    $env:GOOS='windows'; $env:GOARCH='amd64'
    Initialize-AEvidenceTelemetry -Scratch $evidenceScratch
    Push-Location (Join-Path $evidenceRoot 'backend')
    try {
        if ($ProducerRecoveryOnly) {
            if ($RecoveryTest -eq 'A') {
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','^TestSystemHistoricalRecovery','./internal/systembackupevidence') -Stage 'test-vet'
            } else {
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','TestHistoricalRecoveryIndependentAuthorityAndRollback|TestCallerOwnedFinalGuardDoesNotCommit|^TestRecoveryFence','./internal/systembackupproducer') -Stage 'test-vet'
            }
            Write-Output 'LOCAL_PASS recovery-focused-tests-and-vet=yes'
        } elseif ($ProducerService) {
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupevidence','./internal/systembackupproducer') -Stage 'test-vet'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=100','-run','^TestGuardedTransactionFailures/cancel_during_work$','./internal/systembackupproducer') -Stage 'test-vet'
            Write-Output 'LOCAL_PASS cancellation-rollback-controlled-interleaving=100 default-vet=yes'
        } elseif ($LoginStateOnly) {
            Write-Output 'VALIDATION_SCOPE login-state-only=yes full-login-http=no real_mysql=not_run'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/repository') -Stage 'test-vet'
        } elseif ($LoginSessionsOnly) {
            Write-Output 'VALIDATION_SCOPE login-sessions-only=yes full-login-http=no real_mysql=not_run'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupsecurity') -Stage 'test-vet'
        } elseif ($AuthSourceOnly) {
            Write-Output 'VALIDATION_SCOPE auth-source-only=yes full-services-package=no full-server-build=no'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupsecurity','./internal/systembackupevidence','./internal/utils','./internal/repository') -Stage 'test-vet'
            Push-Location 'internal/services'
            try {
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','auth_service.go','auth_sessions.go','enterprise_auth.go','quota_service.go','user_service.go','default_passwords.go','auth_service_test.go','auth_sessions_test.go','username_login_test.go','quota_service_test.go') -Stage 'test-vet'
            } finally { Pop-Location }
            Push-Location 'cmd/server'
            try {
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','backup_sessions.go','backup_sessions_test.go') -Stage 'test-vet'
            } finally { Pop-Location }
        } elseif ($IncludeAuth) {
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupsecurity','./internal/systembackupevidence','./internal/services','./internal/utils','./internal/repository','./cmd/server') -Stage 'test-vet'
        } elseif ($IncludeSecurity) {
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupsecurity','./internal/systembackupevidence') -Stage 'test-vet'
        } else {
            Invoke-AEvidenceGoTest
        }
        # Exercise remote-fixture initialization locally before uploading a
        # probe. This tagged test uses no MySQL, SSH or external provider.
        if ($ProducerService -or $ProducerRecoveryOnly) {
            $evidenceProbePackage='./internal/systembackupevidence'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestDProducerMySQLSeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
        } elseif ($LoginStateOnly) {
            $evidenceProbePackage='./internal/repository'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestLoginStateMySQLSeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            Write-Output 'LOCAL_PASS login-state-seed=yes real_mysql=not_run'
        } elseif ($LoginSessionsOnly) {
            $evidenceProbePackage='./internal/systembackupsecurity'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestLoginSessionMySQLSeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            Write-Output 'LOCAL_PASS login-session-seed=yes real_mysql=not_run'
        } else {
            $evidenceProbePackage='./internal/systembackupevidence'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestMySQLAuthoritySeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            Write-Output 'LOCAL_PASS mysql-authority-seed=yes real_mysql=not_run'
        }
        $env:GOOS='linux'
        $evidenceBinary=Join-Path $evidenceBundle 'd-provider-registration.test'
        Invoke-AEvidenceGoStep -Arguments @('test','-c','-tags','systembackup_mysql','-o',$evidenceBinary,$evidenceProbePackage) -Stage 'mysql-probe-build'
        Invoke-AEvidenceGoStep -Arguments @('build','-o',(Join-Path $evidenceBundle 'system-backup-migrate'),'./cmd/system-backup-migrate') -Stage 'migration-build'
        if ($IncludeAuth) {
            Invoke-AEvidenceGoStep -Arguments @('build','-o',(Join-Path $evidenceBundle 'server'),'./cmd/server') -Stage 'server-build'
            Write-Output ('LOCAL_PASS linux-server-compiled=yes server_binary_sha256='+(Get-FileHash -LiteralPath (Join-Path $evidenceBundle 'server') -Algorithm SHA256).Hash.ToLowerInvariant())
        }
    } finally { Pop-Location }
    $evidenceUTF8=New-Object System.Text.UTF8Encoding($false)
    $evidenceDDL=''
    $evidenceDDLSpecs=@(@('065_add_system_backup_control_metadata_core.sql','system_backup_evidence'),@('065_add_system_backup_control_metadata_core.sql','system_backup_evidence_chunks'))
    if ($LoginSessionsOnly) { $evidenceDDLSpecs=@(@('001_init_schema.sql','users'),@('001_init_schema.sql','audit_logs')) }
    if ($LoginStateOnly) { $evidenceDDLSpecs=@() }
    foreach ($spec in $evidenceDDLSpecs) {
        $sql=[IO.File]::ReadAllText((Join-Path $evidenceRoot ('backend/internal/db/migrations/'+$spec[0]))).Replace("`r`n","`n")
        $pattern='(?ms)^CREATE TABLE IF NOT EXISTS '+$spec[1]+' \(.*?^\) ENGINE=InnoDB[^;]*;'
        $matchesFound=[regex]::Matches($sql,$pattern)
        if ($matchesFound.Count -ne 1) { throw 'Could not extract exact production CREATE TABLE statement' }
        $evidenceDDL+=$matchesFound[0].Value+"`n"
    }
    if ($ProducerService -or $ProducerRecoveryOnly) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot 'contracts/system-backup/v12/producer-authority-candidate.sql')).Replace("`r`n","`n")+"`n" }
    if ($ProducerRecoveryOnly) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot 'contracts/system-backup/v12/producer-recovery-revocation-candidate.sql')).Replace("`r`n","`n")+"`n" }
    $evidenceDDLPath=Join-Path $evidenceBundle 'd-provider-registration.sql'
    $evidenceExtraDDL=if($LoginSessionsOnly){'backend/internal/db/migrations/080_add_system_backup_registration_runtime.sql'}else{'contracts/system-backup/v12/a-evidence-gc-migration-proposal.sql'}
    if (-not $LoginStateOnly) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot $evidenceExtraDDL)).Replace("`r`n","`n")+"`n" }
    if ($LoginStateOnly) {
        # This profile carries a JSON provenance descriptor in the existing
        # harness payload slot. It never executes extracted/abbreviated DDL:
        # the probe clones users from the complete fresh migration database.
        $catalogSource=[IO.File]::ReadAllText((Join-Path $evidenceRoot 'backend/internal/systembackupcontroller/bootstrap.go'))
        $catalogMatch=[regex]::Matches($catalogSource,'ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"')
        if ($catalogMatch.Count -ne 1) { throw 'Compiled catalog pin is ambiguous' }
        $catalogFiles=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object { $_.Name })
        $evidenceDDL=ConvertTo-Json -Depth 4 -InputObject ([ordered]@{kind='a_login_state_probe_inputs';catalog_sha256=$catalogMatch[0].Groups[1].Value;filenames=$catalogFiles})
    }
    [IO.File]::WriteAllText($evidenceDDLPath,$evidenceDDL,$evidenceUTF8)
    $evidenceBinaryHash=(Get-FileHash -LiteralPath $evidenceBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    $evidenceDDLHash=(Get-FileHash -LiteralPath $evidenceDDLPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $evidenceMigrationHash=(Get-FileHash -LiteralPath (Join-Path $evidenceBundle 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant()
    $evidenceProfile=if($ProducerRecoveryOnly -and $RecoveryTest -eq 'A'){'a-producer-recovery'}elseif($ProducerRecoveryOnly){'d-producer-recovery'}elseif($ProducerService){'d-producer-service'}elseif($LoginStateOnly){'login-state'}elseif($LoginSessionsOnly){'login-sessions'}else{'evidence'}
    Write-Output "LOCAL_PASS $evidenceProfile-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=$evidenceBinaryHash ddl_sha256=$evidenceDDLHash"
    Write-Output "LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=$evidenceMigrationHash"
    if ($Remote) {
        $files=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-provider-registration-phase.sh','scripts/system-backup-d-migration-phase.sh','backend/internal/systembackupcontroller/bootstrap.go')
        if ($ProducerService -or $ProducerRecoveryOnly) { $files+=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'contracts/system-backup/v12') -File | ForEach-Object { 'contracts/system-backup/v12/'+$_.Name }) }
        $files+=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | ForEach-Object { 'backend/internal/db/migrations/'+$_.Name })
        foreach ($file in $files) {
            $destination=Join-Path $evidenceBundle $file
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            $evidencePhaseSource=if($ProducerService -or $ProducerRecoveryOnly){'scripts/system-backup-d-producer-service-phase.sh'}elseif($LoginStateOnly){'scripts/system-backup-a-login-state-phase.sh'}elseif($LoginSessionsOnly){'scripts/system-backup-a-login-sessions-phase.sh'}else{'scripts/system-backup-a-evidence-phase.sh'}
            $bundleText=[IO.File]::ReadAllText((Join-Path $evidenceRoot $(if ($file -eq 'scripts/system-backup-d-provider-registration-phase.sh') { $evidencePhaseSource } else { $file }))).Replace("`r`n","`n")
            if (($ProducerService -or $ProducerRecoveryOnly) -and $file -eq 'scripts/system-backup-fresh-migration-smoke.sh') {
                if ([regex]::Matches($bundleText,'(?m)^test_image_pull_policy=IfNotPresent$').Count -ne 1) { throw 'Cannot pin isolated producer image policy' }
                $bundleText=$bundleText.Replace('test_image_pull_policy=IfNotPresent','test_image_pull_policy=Never')
            }
            [IO.File]::WriteAllText($destination,$bundleText,$evidenceUTF8)
        }
        $evidenceArchive=Join-Path $evidenceScratch 'bundle.tar'
        & tar.exe -cf $evidenceArchive -C $evidenceBundle .
        if ($LASTEXITCODE -ne 0) { throw 'Bundle creation failed' }
        $archiveHash=(Get-FileHash -LiteralPath $evidenceArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        $evidenceNativeExit=Invoke-AEvidenceNative -FilePath $evidenceSsh -Arguments ($evidenceOptions + @($SshTarget, "set -eu; umask 077; mkdir '$evidenceRemote'"))
        if ($evidenceNativeExit -ne 0) { throw 'SSH unavailable; no remote test started' }
        $evidenceCreated=$true
        $evidenceNativeExit=Invoke-AEvidenceNative -FilePath $evidenceScp -Arguments ($evidenceOptions + @($evidenceArchive, "${SshTarget}:$evidenceRemote/bundle.tar"))
        if ($evidenceNativeExit -ne 0) { throw 'Upload failed' }
        $digest='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea'
        $recoveryOnlyFlag=if($ProducerRecoveryOnly){'1'}else{'0'}
        $evidenceNativeExit=Invoke-AEvidenceNative -FilePath $evidenceSsh -Arguments ($evidenceOptions + @($SshTarget, "set -eu; cd '$evidenceRemote'; echo '$archiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:$digest' EXPECTED_APP_DIGEST='$digest' D_MIGRATION_BINARY='$evidenceRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$evidenceMigrationHash' D_DB_INVARIANT_SMOKE=1 D_PROVIDER_REGISTRATION_SMOKE=1 D_PRODUCER_RECOVERY_ONLY=$recoveryOnlyFlag D_PRODUCER_RECOVERY_TEST='$RecoveryTest' D_INVARIANT_BINARY='$evidenceRemote/d-provider-registration.test' D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash' D_PROVIDER_REGISTRATION_DDL='$evidenceRemote/d-provider-registration.sql' D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash' bash scripts/system-backup-fresh-migration-smoke.sh"))
        if ($evidenceNativeExit -ne 0) { throw 'MySQL validation failed; retain any CLEANUP_PENDING identity' }
    }
} finally {
    foreach ($name in $evidenceNames) {
        if ($null -eq $evidencePrevious[$name]) { Remove-Item -LiteralPath ('Env:'+ $name) -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name,$evidencePrevious[$name],'Process') }
    }
    if ($evidenceCreated) {
        $evidenceNativeExit=Invoke-AEvidenceNative -FilePath $evidenceSsh -Arguments ($evidenceOptions + @($SshTarget, "test '$evidenceRemote' = '/tmp/clawmanager-a-evidence-$evidenceID' && test ! -L '$evidenceRemote' && rm -rf -- '$evidenceRemote' && test ! -e '$evidenceRemote'"))
        if ($evidenceNativeExit -ne 0) { $evidenceCleanupFailed=$true; Write-Warning "CLEANUP_PENDING remote scratch $evidenceRemote" }
        else { Write-Output 'CLEANED remote-registration-scratch=yes' }
    }
    if (Test-Path -LiteralPath $evidenceScratch) {
        $resolved=(Resolve-Path -LiteralPath $evidenceScratch).Path
        if (-not $resolved.StartsWith($evidencePrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$') { throw 'Refusing cleanup outside owned scratch' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output ('CLEANED local-registration-build-cache='+(-not (Test-Path -LiteralPath $evidenceScratch)))
    if ($evidenceCleanupFailed) { throw 'Remote scratch cleanup unverified' }
}
