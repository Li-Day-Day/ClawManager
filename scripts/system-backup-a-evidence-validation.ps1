[CmdletBinding()]
param(
    [switch]$Remote,
    [switch]$ProducerService,
    [switch]$ProducerRecoveryOnly,
    [ValidateSet('D','A','Schema','ADeployment','Manager','Authority','AManager','ARead','ABootstrap','ARevoke')][string]$RecoveryTest='D',
    [switch]$IncludeSecurity,
    [switch]$IncludeAuth,
    [switch]$AuthSourceOnly,
    [switch]$LoginSessionsOnly,
    [switch]$AdminReadOnly,
    [switch]$AdminReadConfigCandidate,
    [switch]$BusinessHistoryOnly,
    [switch]$LoginStateOnly,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
if ($IncludeAuth -and $AuthSourceOnly) { throw 'Choose full auth packages or the explicitly limited auth source gate' }
if ($LoginSessionsOnly -and ($IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly)) { throw 'LoginSessionsOnly cannot be combined with other validation profiles' }
if ($AdminReadOnly -and ($LoginSessionsOnly -or $LoginStateOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $ProducerService -or $ProducerRecoveryOnly)) { throw 'AdminReadOnly requires its dedicated validation profile' }
if ($AdminReadConfigCandidate -and -not $AdminReadOnly) { throw 'AdminReadConfigCandidate requires AdminReadOnly' }
if ($BusinessHistoryOnly -and ($AdminReadOnly -or $AdminReadConfigCandidate -or $LoginSessionsOnly -or $LoginStateOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $ProducerService -or $ProducerRecoveryOnly)) { throw 'BusinessHistoryOnly requires its dedicated validation profile' }
if ($LoginStateOnly -and ($LoginSessionsOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly)) { throw 'LoginStateOnly cannot be combined with other validation profiles' }
if (($ProducerService -or $ProducerRecoveryOnly) -and ($IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $LoginSessionsOnly -or $LoginStateOnly -or ($ProducerService -and $ProducerRecoveryOnly))) { throw 'Producer profiles must be selected separately' }
if ($RecoveryTest -ne 'D' -and -not $ProducerRecoveryOnly) { throw 'A nondefault RecoveryTest requires ProducerRecoveryOnly' }
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
            if ($RecoveryTest -eq 'Authority') {
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','^TestRecoveryAuthority|^TestRecoveryDeploymentCASAndRollback$','./internal/systembackupproducer') -Stage 'test-vet'
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','^TestRecoveryManagerRowGuard','./internal/systembackupevidence') -Stage 'test-vet'
            } elseif ($RecoveryTest -eq 'A' -or $RecoveryTest -eq 'ADeployment' -or $RecoveryTest -eq 'Manager' -or $RecoveryTest -eq 'AManager' -or $RecoveryTest -eq 'ARead' -or $RecoveryTest -eq 'ABootstrap' -or $RecoveryTest -eq 'ARevoke') {
                $aRecoveryLocalPattern=if($RecoveryTest -eq 'Manager'){'^TestRecoveryManagerRowGuard'}elseif($RecoveryTest -eq 'ARead'){'^TestSystemRecoveryAuthorityRead'}elseif($RecoveryTest -eq 'ARevoke'){'^TestRecoveryManagerRevocation'}elseif($RecoveryTest -eq 'ABootstrap'){'^Test(RecoveryManagerBootstrap|RecoveryAuditJournal)'}elseif($RecoveryTest -eq 'AManager'){'^Test(SystemRecoveryAuthority|PinnedRecoveryAuthorityDecision|RecoveryAuditJournal)'}elseif($RecoveryTest -eq 'ADeployment'){'^Test(SystemHistoricalDeploymentGuard|DeploymentBoundHistoricalAuthority)'}else{'^TestSystemHistoricalRecovery'}
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run',$aRecoveryLocalPattern,'./internal/systembackupevidence') -Stage 'test-vet'
            } elseif ($RecoveryTest -eq 'Schema') {
                Write-Output 'VALIDATION_SCOPE recovery-authority-schema-only=yes production-admission=no real_mysql=not_run'
            } else {
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','TestHistoricalRecoveryIndependentAuthorityAndRollback|TestCallerOwnedFinalGuardDoesNotCommit|^TestRecoveryFence','./internal/systembackupproducer') -Stage 'test-vet'
            }
            if ($RecoveryTest -ne 'Schema') { Write-Output 'LOCAL_PASS recovery-focused-tests-and-vet=yes' }
        } elseif ($ProducerService) {
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupevidence','./internal/systembackupproducer') -Stage 'test-vet'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=100','-run','^TestGuardedTransactionFailures/cancel_during_work$','./internal/systembackupproducer') -Stage 'test-vet'
            Write-Output 'LOCAL_PASS cancellation-rollback-controlled-interleaving=100 default-vet=yes'
        } elseif ($LoginStateOnly) {
            Write-Output 'VALIDATION_SCOPE login-state-only=yes full-login-http=no real_mysql=not_run'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/repository') -Stage 'test-vet'
        } elseif ($BusinessHistoryOnly) {
            Write-Output 'VALIDATION_SCOPE a-business-history-rows=yes synthetic-proof=yes real_mysql=not_run'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','./internal/systembackupbusinessa') -Stage 'test-vet'
        } elseif ($AdminReadOnly) {
            Write-Output 'VALIDATION_SCOPE admin-read-auth-local=yes full-task-query-local=no remote-full-schema-probe=yes real_mysql=not_run'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','^TestSystemBackupReadScope','./internal/systembackupsecurity') -Stage 'test-vet'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','./internal/systembackupread') -Stage 'test-vet'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','^TestLiveBackupRead','./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_live_test.go') -Stage 'test-vet'
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
            if ($ProducerRecoveryOnly -and $RecoveryTest -eq 'Manager') {
                Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestDRecoveryManagerFixtureSeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            }
            if ($ProducerRecoveryOnly -and $RecoveryTest -eq 'Authority') {
                Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestDRecoveryAuthorityFixtureSeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            }
        } elseif ($LoginStateOnly) {
            $evidenceProbePackage='./internal/repository'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestLoginStateMySQLSeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            Write-Output 'LOCAL_PASS login-state-seed=yes real_mysql=not_run'
        } elseif ($BusinessHistoryOnly) {
            $evidenceProbePackage='./internal/systembackupbusinessa'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^$','-count=1',$evidenceProbePackage) -Stage 'test-vet'
            Write-Output 'LOCAL_PASS a-business-history-tagged-compile=yes real_mysql=not_run'
        } elseif ($AdminReadOnly) {
            $evidenceProbePackage='./internal/systembackupsecurity'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            Write-Output 'LOCAL_PASS admin-read-seed=yes real_mysql=not_run'
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
        $evidenceProbeName=if($BusinessHistoryOnly){'a-business-history.test'}else{'d-provider-registration.test'}
        $evidenceBinary=Join-Path $evidenceBundle $evidenceProbeName
        Invoke-AEvidenceGoStep -Arguments @('test','-c','-tags','systembackup_mysql','-o',$evidenceBinary,$evidenceProbePackage) -Stage 'mysql-probe-build'
        if ($AdminReadOnly) {
            $evidenceHTTPBinary=Join-Path $evidenceBundle 'd-admin-read-http.test'
            $evidenceHTTPSources=@('./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_live_test.go','./cmd/server/system_backup_read_live_mysql_test.go')
            if ($AdminReadConfigCandidate) { $evidenceHTTPSources+= './cmd/server/system_backup_read_config_http_mysql_test.go' }
            Invoke-AEvidenceGoStep -Arguments (@('test','-c','-tags','systembackup_mysql','-o',$evidenceHTTPBinary)+$evidenceHTTPSources) -Stage 'mysql-probe-build'
        }
        Invoke-AEvidenceGoStep -Arguments @('build','-o',(Join-Path $evidenceBundle 'system-backup-migrate'),'./cmd/system-backup-migrate') -Stage 'migration-build'
        if ($IncludeAuth) {
            Invoke-AEvidenceGoStep -Arguments @('build','-o',(Join-Path $evidenceBundle 'server'),'./cmd/server') -Stage 'server-build'
            Write-Output ('LOCAL_PASS linux-server-compiled=yes server_binary_sha256='+(Get-FileHash -LiteralPath (Join-Path $evidenceBundle 'server') -Algorithm SHA256).Hash.ToLowerInvariant())
        }
    } finally { Pop-Location }
    $evidenceUTF8=New-Object System.Text.UTF8Encoding($false)
    $evidenceDDL=''
    $evidenceDDLSpecs=@(@('065_add_system_backup_control_metadata_core.sql','system_backup_evidence'),@('065_add_system_backup_control_metadata_core.sql','system_backup_evidence_chunks'))
    if ($ProducerRecoveryOnly -and ($RecoveryTest -eq 'Schema' -or $RecoveryTest -eq 'ADeployment' -or $RecoveryTest -eq 'Manager' -or $RecoveryTest -eq 'Authority' -or $RecoveryTest -eq 'AManager' -or $RecoveryTest -eq 'ARead' -or $RecoveryTest -eq 'ABootstrap' -or $RecoveryTest -eq 'ARevoke')) { $evidenceDDLSpecs=(,@('065_add_system_backup_control_metadata_core.sql','system_backup_installation_state'))+$evidenceDDLSpecs }
    # These management probes write the real audit_logs table, whose FK needs
    # users. Keep both statements identical to the production migration.
    if ($ProducerRecoveryOnly -and ($RecoveryTest -eq 'AManager' -or $RecoveryTest -eq 'ABootstrap' -or $RecoveryTest -eq 'ARevoke')) {
        $evidenceDDLSpecs=(,@('001_init_schema.sql','users'))+(,@('001_init_schema.sql','audit_logs'))+$evidenceDDLSpecs
    }
    if ($LoginSessionsOnly) { $evidenceDDLSpecs=@(@('001_init_schema.sql','users'),@('001_init_schema.sql','audit_logs')) }
    if ($AdminReadOnly) { $evidenceDDLSpecs=@() }
    if ($LoginStateOnly) { $evidenceDDLSpecs=@() }
    if ($BusinessHistoryOnly) { $evidenceDDLSpecs=@() }
    foreach ($spec in $evidenceDDLSpecs) {
        $sql=[IO.File]::ReadAllText((Join-Path $evidenceRoot ('backend/internal/db/migrations/'+$spec[0]))).Replace("`r`n","`n")
        $pattern='(?ms)^CREATE TABLE IF NOT EXISTS '+$spec[1]+' \(.*?^\) ENGINE=InnoDB[^;]*;'
        $matchesFound=[regex]::Matches($sql,$pattern)
        if ($matchesFound.Count -ne 1) { throw 'Could not extract exact production CREATE TABLE statement' }
        $evidenceDDL+=$matchesFound[0].Value+"`n"
    }
    if ($ProducerService -or $ProducerRecoveryOnly) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot 'contracts/system-backup/v12/producer-authority-candidate.sql')).Replace("`r`n","`n")+"`n" }
    if ($ProducerRecoveryOnly) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot 'contracts/system-backup/v12/producer-recovery-revocation-candidate.sql')).Replace("`r`n","`n")+"`n" }
    if ($ProducerRecoveryOnly -and ($RecoveryTest -eq 'Schema' -or $RecoveryTest -eq 'ADeployment' -or $RecoveryTest -eq 'Manager' -or $RecoveryTest -eq 'Authority' -or $RecoveryTest -eq 'AManager' -or $RecoveryTest -eq 'ARead' -or $RecoveryTest -eq 'ABootstrap' -or $RecoveryTest -eq 'ARevoke')) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot 'contracts/system-backup/v12/producer-recovery-authority-candidate.sql')).Replace("`r`n","`n")+"`n" }
    $evidenceDDLPath=Join-Path $evidenceBundle 'd-provider-registration.sql'
    $evidenceExtraDDL=if($LoginSessionsOnly){'backend/internal/db/migrations/080_add_system_backup_registration_runtime.sql'}else{'contracts/system-backup/v12/a-evidence-gc-migration-proposal.sql'}
    if ($AdminReadOnly) { $evidenceDDL=[IO.File]::ReadAllText((Join-Path $evidenceRoot 'scripts/system-backup-a-admin-read-probe.sql')).Replace("`r`n","`n") }
    elseif (-not $LoginStateOnly -and -not $BusinessHistoryOnly) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot $evidenceExtraDDL)).Replace("`r`n","`n")+"`n" }
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
    $evidenceHTTPHash=if($AdminReadOnly){(Get-FileHash -LiteralPath $evidenceHTTPBinary -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
    $evidenceProfile=if($BusinessHistoryOnly){'a-business-history'}elseif($AdminReadOnly){'a-admin-read'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ARevoke'){'a-recovery-manager-revocation'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ABootstrap'){'a-recovery-manager-bootstrap'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ARead'){'a-recovery-authority-read'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'AManager'){'a-recovery-manager-authority'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'Authority'){'d-recovery-authority'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'Manager'){'d-recovery-manager-row'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ADeployment'){'a-recovery-deployment'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'A'){'a-producer-recovery'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'Schema'){'d-recovery-authority-schema'}elseif($ProducerRecoveryOnly){'d-producer-recovery'}elseif($ProducerService){'d-producer-service'}elseif($LoginStateOnly){'login-state'}elseif($LoginSessionsOnly){'login-sessions'}else{'evidence'}
    $evidenceLocalGate=if($ProducerRecoveryOnly -and $RecoveryTest -eq 'Schema'){'schema-seed-and-vet'}else{'unit-tests'}
    Write-Output "LOCAL_PASS $evidenceProfile-$evidenceLocalGate=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=$evidenceBinaryHash ddl_sha256=$evidenceDDLHash"
    Write-Output "LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=$evidenceMigrationHash"
    if ($AdminReadOnly) { Write-Output "LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=$evidenceHTTPHash real_mysql=not_run" }
    if ($AdminReadConfigCandidate) { Write-Output 'VALIDATION_SCOPE config-canonical-candidate-local=compiled real_mysql=not_run production_migration=no' }
    if ($Remote) {
        $files=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-provider-registration-phase.sh','scripts/system-backup-d-migration-phase.sh','scripts/system-backup-a-business-history-phase.sh','backend/internal/systembackupcontroller/bootstrap.go')
        if ($AdminReadOnly) { $files+=@('scripts/system-backup-controller-enabled-fixture.mysql.sql') }
        if ($AdminReadConfigCandidate) { $files+=@('docs/system-backup-d-config-canonical-candidate-20261012.sql') }
        if ($ProducerService -or $ProducerRecoveryOnly) { $files+=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'contracts/system-backup/v12') -File | ForEach-Object { 'contracts/system-backup/v12/'+$_.Name }) }
        $files+=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | ForEach-Object { 'backend/internal/db/migrations/'+$_.Name })
        foreach ($file in $files) {
            $destination=Join-Path $evidenceBundle $file
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            $evidencePhaseSource=if($AdminReadOnly){'scripts/system-backup-a-admin-read-phase.sh'}elseif($ProducerService -or $ProducerRecoveryOnly){'scripts/system-backup-d-producer-service-phase.sh'}elseif($LoginStateOnly){'scripts/system-backup-a-login-state-phase.sh'}elseif($LoginSessionsOnly){'scripts/system-backup-a-login-sessions-phase.sh'}else{'scripts/system-backup-a-evidence-phase.sh'}
            $bundleText=[IO.File]::ReadAllText((Join-Path $evidenceRoot $(if ($file -eq 'scripts/system-backup-d-provider-registration-phase.sh') { $evidencePhaseSource } else { $file }))).Replace("`r`n","`n")
            if (($ProducerService -or $ProducerRecoveryOnly) -and $file -eq 'scripts/system-backup-fresh-migration-smoke.sh') {
                if ([regex]::Matches($bundleText,'(?m)^test_image_pull_policy=IfNotPresent$').Count -ne 1) { throw 'Cannot pin isolated producer image policy' }
                $bundleText=$bundleText.Replace('test_image_pull_policy=IfNotPresent','test_image_pull_policy=Never')
            }
            [IO.File]::WriteAllText($destination,$bundleText,$evidenceUTF8)
        }
        $evidenceCandidateFlag=if($AdminReadConfigCandidate){'1'}else{'0'}
        $evidenceCandidateHash=if($AdminReadConfigCandidate){(Get-FileHash -LiteralPath (Join-Path $evidenceBundle 'docs/system-backup-d-config-canonical-candidate-20261012.sql') -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
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
        $invariantFlag=if($BusinessHistoryOnly){'0'}else{'1'}
        $businessFlag=if($BusinessHistoryOnly){'1'}else{'0'}
        $evidenceNativeExit=Invoke-AEvidenceNative -FilePath $evidenceSsh -Arguments ($evidenceOptions + @($SshTarget, "set -eu; cd '$evidenceRemote'; echo '$archiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:$digest' EXPECTED_APP_DIGEST='$digest' D_MIGRATION_BINARY='$evidenceRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$evidenceMigrationHash' D_DB_INVARIANT_SMOKE=$invariantFlag D_PROVIDER_REGISTRATION_SMOKE=$invariantFlag A_BUSINESS_HISTORY_SMOKE=$businessFlag A_BUSINESS_BINARY='$evidenceRemote/$evidenceProbeName' A_BUSINESS_BINARY_SHA256='$evidenceBinaryHash' D_PRODUCER_RECOVERY_ONLY=$recoveryOnlyFlag D_PRODUCER_RECOVERY_TEST='$RecoveryTest' D_INVARIANT_BINARY='$evidenceRemote/$evidenceProbeName' D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash' D_ADMIN_READ_HTTP_BINARY='$evidenceRemote/d-admin-read-http.test' D_ADMIN_READ_HTTP_BINARY_SHA256='$evidenceHTTPHash' D_CONFIG_CANDIDATE=$evidenceCandidateFlag D_CONFIG_CANDIDATE_DDL='$evidenceRemote/docs/system-backup-d-config-canonical-candidate-20261012.sql' D_CONFIG_CANDIDATE_DDL_SHA256='$evidenceCandidateHash' D_PROVIDER_REGISTRATION_DDL='$evidenceRemote/d-provider-registration.sql' D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash' bash scripts/system-backup-fresh-migration-smoke.sh"))
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
