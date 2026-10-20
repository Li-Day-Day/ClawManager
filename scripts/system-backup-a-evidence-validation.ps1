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
    [switch]$ConfigProofOnly,
    [switch]$ConfigWriterOnly,
    [switch]$ConfigWriterSecurityOnly,
    [switch]$ConfigNonceTimeOnly,
    [switch]$ConfigDownloadMFAOnly,
    [switch]$ConfigDownloadAdmissionOnly,
    [switch]$ConfigDownloadOwnersOnly,
    [switch]$ConfigDownloadTaskChainOnly,
    [switch]$ConfigDownloadProducerOnly,
    [switch]$ConfigDownloadGCRoleOnly,
    [switch]$ConfigMaintenanceReceiptOnly,
    [switch]$ConfigBackfillServiceOnly,
    [switch]$ConfigMaintenanceAuthorityOnly,
    [switch]$BackfillRowGuards,
    [switch]$AdminReadOnly,
    [switch]$AdminReadConfigCandidate,
    [switch]$AdminReadIndexCandidate,
    [ValidateSet('all','page','status')][string]$AdminReadIndexVariant='all',
    [string]$IndexSuiteCache='',
    [switch]$BusinessHistoryOnly,
    [switch]$BusinessRestoreOnly,
    [switch]$LoginStateOnly,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
if($ConfigDownloadGCRoleOnly -and (-not $ConfigWriterOnly -or $ConfigDownloadProducerOnly -or $ConfigDownloadTaskChainOnly -or $ConfigDownloadOwnersOnly -or $ConfigDownloadAdmissionOnly -or $ConfigDownloadMFAOnly -or $ConfigNonceTimeOnly -or $ConfigWriterSecurityOnly -or $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigMaintenanceAuthorityOnly -or $BackfillRowGuards -or $ProducerService -or $ProducerRecoveryOnly -or $AdminReadOnly -or $AdminReadIndexCandidate -or $AdminReadConfigCandidate -or $BusinessHistoryOnly -or $BusinessRestoreOnly -or $LoginStateOnly -or $LoginSessionsOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly)){throw 'ConfigDownloadGCRoleOnly requires its exclusive config writer plumbing profile'}
if($ConfigDownloadGCRoleOnly){$ConfigDownloadMFAOnly=$true}
if($ConfigDownloadProducerOnly -and (-not $ConfigWriterOnly -or $ConfigDownloadTaskChainOnly -or $ConfigDownloadOwnersOnly -or $ConfigDownloadAdmissionOnly -or $ConfigDownloadMFAOnly -or $ConfigNonceTimeOnly -or $ConfigWriterSecurityOnly -or $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigMaintenanceAuthorityOnly -or $BackfillRowGuards -or $ProducerService -or $ProducerRecoveryOnly -or $AdminReadOnly -or $BusinessHistoryOnly -or $BusinessRestoreOnly -or $LoginStateOnly -or $LoginSessionsOnly)){throw 'ConfigDownloadProducerOnly requires its exclusive config writer plumbing profile'}
if($ConfigDownloadProducerOnly){$ConfigDownloadAdmissionOnly=$true}
if($ConfigDownloadTaskChainOnly -and (-not $ConfigWriterOnly -or $ConfigDownloadOwnersOnly -or $ConfigDownloadAdmissionOnly -or $ConfigDownloadMFAOnly -or $ConfigNonceTimeOnly -or $ConfigWriterSecurityOnly -or $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigMaintenanceAuthorityOnly -or $BackfillRowGuards -or $ProducerService -or $ProducerRecoveryOnly -or $AdminReadOnly -or $BusinessHistoryOnly -or $BusinessRestoreOnly -or $LoginStateOnly -or $LoginSessionsOnly)){throw 'ConfigDownloadTaskChainOnly requires its exclusive config writer plumbing profile'}
if($ConfigDownloadTaskChainOnly){$ConfigDownloadAdmissionOnly=$true}
if($ConfigDownloadOwnersOnly -and (-not $ConfigWriterOnly -or $ConfigDownloadAdmissionOnly -or $ConfigDownloadMFAOnly -or $ConfigNonceTimeOnly -or $ConfigWriterSecurityOnly -or $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigMaintenanceAuthorityOnly -or $BackfillRowGuards)){throw 'ConfigDownloadOwnersOnly requires its exclusive config writer plumbing profile'}
if($ConfigDownloadOwnersOnly){$ConfigDownloadAdmissionOnly=$true}
if ($ConfigDownloadAdmissionOnly -and (-not $ConfigWriterOnly -or $ConfigDownloadMFAOnly -or $ConfigNonceTimeOnly -or $ConfigWriterSecurityOnly -or $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigMaintenanceAuthorityOnly -or $BackfillRowGuards)) { throw 'ConfigDownloadAdmissionOnly requires its exclusive config writer plumbing profile' }
if ($ConfigDownloadAdmissionOnly) { $ConfigDownloadMFAOnly=$true }
if ($ConfigDownloadMFAOnly -and (-not $ConfigWriterOnly -or $ConfigNonceTimeOnly -or $ConfigWriterSecurityOnly -or $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigMaintenanceAuthorityOnly -or $BackfillRowGuards)) { throw 'ConfigDownloadMFAOnly requires its exclusive config writer plumbing profile' }
if ($BackfillRowGuards -and -not $ConfigWriterOnly) { throw 'BackfillRowGuards requires the dedicated config writer validation profile' }
if ($ConfigWriterSecurityOnly -and -not $ConfigWriterOnly) { throw 'ConfigWriterSecurityOnly requires ConfigWriterOnly' }
if ($ConfigNonceTimeOnly -and (-not $ConfigWriterOnly -or $ConfigWriterSecurityOnly -or $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigMaintenanceAuthorityOnly -or $BackfillRowGuards)) { throw 'ConfigNonceTimeOnly requires the exclusive config writer nonce-time profile' }
if ($ConfigMaintenanceReceiptOnly -and (-not $ConfigWriterOnly -or $ConfigWriterSecurityOnly)) { throw 'ConfigMaintenanceReceiptOnly requires the separate config writer validation profile' }
if ($ConfigBackfillServiceOnly -and -not $ConfigMaintenanceReceiptOnly) { throw 'ConfigBackfillServiceOnly requires the maintenance validation profile' }
if ($ConfigMaintenanceAuthorityOnly -and (-not $ConfigWriterOnly -or -not $ConfigMaintenanceReceiptOnly -or $ConfigBackfillServiceOnly -or $ConfigWriterSecurityOnly)) { throw 'ConfigMaintenanceAuthorityOnly requires its exclusive maintenance authority profile' }
if ($ConfigWriterOnly) {
    if ($ConfigProofOnly) { throw 'Choose the config proof or writer profile separately' }
    # Reuse full-catalog isolation/build plumbing; select only writer payloads
    # below. The original proof-only profile continues to execute no writes.
    $ConfigProofOnly=$true
}
if ($ConfigProofOnly -and ($LoginSessionsOnly -or $LoginStateOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $ProducerService -or $ProducerRecoveryOnly -or $AdminReadOnly -or $AdminReadConfigCandidate -or $AdminReadIndexCandidate -or $BusinessHistoryOnly -or $BusinessRestoreOnly -or $IndexSuiteCache)) { throw 'ConfigProofOnly requires its dedicated validation profile' }
if ($IncludeAuth -and $AuthSourceOnly) { throw 'Choose full auth packages or the explicitly limited auth source gate' }
if ($LoginSessionsOnly -and ($IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly)) { throw 'LoginSessionsOnly cannot be combined with other validation profiles' }
if ($AdminReadOnly -and ($LoginSessionsOnly -or $LoginStateOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $ProducerService -or $ProducerRecoveryOnly)) { throw 'AdminReadOnly requires its dedicated validation profile' }
if ($AdminReadConfigCandidate -and -not $AdminReadOnly) { throw 'AdminReadConfigCandidate requires AdminReadOnly' }
if ($AdminReadIndexCandidate -and (-not $AdminReadOnly -or $AdminReadConfigCandidate)) { throw 'AdminReadIndexCandidate requires AdminReadOnly and is separate from the config candidate' }
if ($AdminReadIndexVariant -ne 'all' -and -not $AdminReadIndexCandidate) { throw 'AdminReadIndexVariant requires AdminReadIndexCandidate' }
if ($IndexSuiteCache) {
    if (-not $AdminReadIndexCandidate) { throw 'IndexSuiteCache requires the index candidate profile' }
    $indexCacheRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $indexCachePath=[IO.Path]::GetFullPath($IndexSuiteCache)
    $indexCacheParent=[IO.Path]::GetDirectoryName($indexCachePath)
    if ([IO.Path]::GetDirectoryName($indexCacheParent) -ne $indexCacheRoot -or [IO.Path]::GetFileName($indexCacheParent) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($indexCachePath) -ne 'cache') { throw 'IndexSuiteCache must be a run-owned grouped cache' }
    foreach ($indexCacheDir in @($indexCacheParent,$indexCachePath)) {
        if (-not (Test-Path -LiteralPath $indexCacheDir -PathType Container) -or ((Get-Item -LiteralPath $indexCacheDir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'IndexSuiteCache must exist without redirected directories' }
    }
    $indexCacheOwner=Join-Path $indexCacheParent 'owner.txt'
    if (-not (Test-Path -LiteralPath $indexCacheOwner -PathType Leaf) -or ((Get-Item -LiteralPath $indexCacheOwner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText($indexCacheOwner) -ne [IO.Path]::GetFileName($indexCacheParent)) { throw 'IndexSuiteCache ownership marker mismatch' }
}
if ($BusinessHistoryOnly -and ($AdminReadOnly -or $AdminReadConfigCandidate -or $LoginSessionsOnly -or $LoginStateOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $ProducerService -or $ProducerRecoveryOnly)) { throw 'BusinessHistoryOnly requires its dedicated validation profile' }
if ($BusinessRestoreOnly -and ($BusinessHistoryOnly -or $AdminReadOnly -or $AdminReadConfigCandidate -or $AdminReadIndexCandidate -or $LoginSessionsOnly -or $LoginStateOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $ProducerService -or $ProducerRecoveryOnly)) { throw 'BusinessRestoreOnly requires its dedicated validation profile' }
if ($LoginStateOnly -and ($LoginSessionsOnly -or $IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly)) { throw 'LoginStateOnly cannot be combined with other validation profiles' }
if (($ProducerService -or $ProducerRecoveryOnly) -and ($IncludeSecurity -or $IncludeAuth -or $AuthSourceOnly -or $LoginSessionsOnly -or $LoginStateOnly -or ($ProducerService -and $ProducerRecoveryOnly))) { throw 'Producer profiles must be selected separately' }
if ($RecoveryTest -ne 'D' -and -not $ProducerRecoveryOnly) { throw 'A nondefault RecoveryTest requires ProducerRecoveryOnly' }
if ($Remote) {
    # Validate actual interpolation before compilation or the first SSH call.
    & (Join-Path $PSScriptRoot 'system-backup-a-evidence-dispatch.test.ps1')
}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
# The proposed GC constraint change is applied only inside the isolated probe DB.
$evidenceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidencePrefix=$evidenceRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
$evidenceID=[guid]::NewGuid().ToString('N')
$evidenceScratch=Join-Path $evidenceRoot ('.tmp-a-evidence-'+$evidenceID)
$evidenceRemote='/tmp/clawmanager-a-evidence-'+$evidenceID
$evidenceNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS','D_MAINTENANCE_SEED_INPUTS','D_MAINTENANCE_SEED_INPUTS_SHA256')
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
    if($IndexSuiteCache){$env:GOFLAGS+=' -buildvcs=false -trimpath'}
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:CGO_ENABLED='0'
    $env:GOCACHE=if($IndexSuiteCache){$indexCachePath}else{Join-Path $evidenceScratch 'cache'}; $env:GOTMPDIR=Join-Path $evidenceScratch 'tmp'
    if($IndexSuiteCache){Write-Output 'VALIDATION_SCOPE grouped-build-cache=shared-until-suite-finally-cleanup'}
    $env:GOOS='windows'; $env:GOARCH='amd64'
    Initialize-AEvidenceTelemetry -Scratch $evidenceScratch
    Push-Location (Join-Path $evidenceRoot 'backend')
    try {
        if ($ConfigProofOnly) {
            if ($ConfigWriterOnly) {
                if($ConfigMaintenanceAuthorityOnly){Write-Output 'VALIDATION_SCOPE a-maintenance-authority-composition=yes synthetic-verified-facts=yes actual-authentication=no production-approval=no historical-backfill=no real_mysql=not_run'}
                elseif($ConfigBackfillServiceOnly){Write-Output 'VALIDATION_SCOPE canonical-backfill-service-candidate=yes synthetic-authority=yes synthetic-capacity=yes production-approval=no historical-backfill=no real_mysql=not_run'}
                elseif($ConfigMaintenanceReceiptOnly){Write-Output 'VALIDATION_SCOPE maintenance-receipt-storage-candidate=yes synthetic-admission=yes production-approval=no historical-backfill=no real_mysql=not_run'}
                else{Write-Output 'VALIDATION_SCOPE config-writer-candidate=yes synthetic-readiness=yes synthetic-capacity=yes production-approval=no backfill=no real_mysql=not_run'}
                if($ConfigBackfillServiceOnly){
                    & (Join-Path $evidenceRoot 'scripts/system-backup-d-config-backfill-precision-control.ps1') -FrozenRoot $evidenceRoot -Scratch $evidenceScratch -BuildParallelism $BuildParallelism
                    Write-Output 'LOCAL_STAGE backfill-service-security-full'
                }
                if($ConfigDownloadMFAOnly){
                    if($ConfigDownloadGCRoleOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-a-download-gc-role-dispatch.test.ps1') }
                    if($ConfigDownloadProducerOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-d-download-producer-dispatch.test.ps1'); & node (Join-Path $evidenceRoot 'scripts/system-backup-d-download-producer-inputs.mjs'); if($LASTEXITCODE -ne 0){throw 'Producer download capsule differs from its reviewed inputs'} }
                    if($ConfigDownloadTaskChainOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-d-download-task-chain-dispatch.test.ps1') }
                    if($ConfigDownloadGCRoleOnly){Write-Output 'VALIDATION_SCOPE download-gc-role-only=yes isolated-candidate-accounts=yes privileged-metadata-observer=yes maintenance=absent full-gc=not-run role-approval=no production-approval=no real_mysql=not_run'}elseif($ConfigDownloadProducerOnly){Write-Output 'VALIDATION_SCOPE download-producer-owner-only=yes owner-adapter=SQLDownloadOwners actual-sql-probe-preparation=yes issuer-capacity-provider=synthetic production-approval=no real_mysql=not_run'}elseif($ConfigDownloadTaskChainOnly){Write-Output 'VALIDATION_SCOPE download-task-chain-only=yes owner-adapter=SQLTaskDownloadOwners actual-sql-probe-preparation=yes issuer-capacity-provider=synthetic production-approval=no real_mysql=not_run'}elseif($ConfigDownloadOwnersOnly){Write-Output 'VALIDATION_SCOPE download-sql-task-owners-only=yes actual-sql-probe-preparation=yes owner-adapter=SQLTaskDownloadOwners production-tasks=no human-mfa=no production-approval=no real_mysql=not_run'}elseif($ConfigDownloadAdmissionOnly){Write-Output 'VALIDATION_SCOPE download-admission-only=yes actual-sql-probe-preparation=yes synthetic-owner-issuer-material-capacity-provider=yes human-mfa=no production-approval=no real_mysql=not_run'}else{Write-Output 'VALIDATION_SCOPE download-mfa-only=yes actual-sql-probe-preparation=yes synthetic-owner-issuer-material=yes human-mfa=no production-approval=no real_mysql=not_run'}
                    & node (Join-Path $evidenceRoot 'scripts/system-backup-a-download-mfa-inputs.mjs')
                    if($LASTEXITCODE -ne 0){throw 'Download MFA candidate input mirror differs'}
                    # The complete evidence package can exceed Go's default ten
                    # minutes on the serial Windows gate. Keep every test and
                    # default vet; this budget is not an assertion-failure retry.
                    Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=900s','-v','./internal/systembackupsecurity','./internal/systembackupevidence') -Stage 'test-vet'
                } elseif($ConfigNonceTimeOnly){
                    Write-Output 'VALIDATION_SCOPE nonce-time-increment-only=yes synthetic-issuer-authority-capacity=yes human-mfa=no real_mysql=not_run'
                    Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','-run','^TestA(ProviderNonceUsesSQLAcceptanceTime|ConfigNonceUsesSQLAcceptanceTime|SensitiveDownloadNonceAcceptanceTime)$','./internal/systembackupsecurity') -Stage 'test-vet'
                } else {
                    Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupsecurity') -Stage 'test-vet'
                }
                if($BackfillRowGuards){
                    & (Join-Path $evidenceRoot 'scripts/system-backup-d-config-backfill-row-controls.ps1') -FrozenRoot $evidenceRoot -Scratch $evidenceScratch -BuildParallelism $BuildParallelism
                }
            } else {
                Write-Output 'VALIDATION_SCOPE config-proof-only=yes config-write=no backfill=no human-mfa=no real_mysql=not_run'
                Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','-run','^TestConfigProof','./internal/systembackupsecurity') -Stage 'test-vet'
            }
        } elseif ($ProducerRecoveryOnly) {
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
        } elseif ($BusinessHistoryOnly -or $BusinessRestoreOnly) {
            $aBusinessLocalScope=if($BusinessRestoreOnly){'fifteen-table-restore'}else{'history-rows'}
            Write-Output "VALIDATION_SCOPE a-business-$aBusinessLocalScope=yes synthetic-proof=yes real_mysql=not_run"
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','./internal/systembackupbusinessa') -Stage 'test-vet'
        } elseif ($AdminReadOnly) {
            Write-Output 'VALIDATION_SCOPE admin-read-auth-local=yes full-task-query-local=no remote-full-schema-probe=yes real_mysql=not_run'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-run','^TestSystemBackupReadScope','./internal/systembackupsecurity') -Stage 'test-vet'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','./internal/systembackupread') -Stage 'test-vet'
            if ($AdminReadIndexCandidate) {
                Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run','^TestDAdminReadIndexSeed$','-count=1','./internal/systembackupread') -Stage 'test-vet'
            }
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
        if ($ConfigWriterSecurityOnly) {
            . (Join-Path $PSScriptRoot 'system-backup-a-config-backfill-byte-control.ps1')
            Invoke-AConfigBackfillByteBudgetControl -Root $evidenceRoot -Scratch $evidenceScratch -BuildParallelism $BuildParallelism
        }
        # Exercise remote-fixture initialization locally before uploading a
        # probe. This tagged test uses no MySQL, SSH or external provider.
        if ($ConfigProofOnly) {
            $evidenceProbePackage=if($ConfigDownloadMFAOnly){'./internal/systembackupevidence'}else{'./internal/systembackupsecurity'}
            $configProofSeedPattern=if($ConfigDownloadGCRoleOnly){'^Test(ADownloadGCRoleMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}elseif($ConfigDownloadProducerOnly){'^Test(DProducerDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}elseif($ConfigDownloadTaskChainOnly){'^Test(DTaskOwnerDownloadChainMySQLSeed|ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}elseif($ConfigDownloadOwnersOnly){'^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}elseif($ConfigDownloadAdmissionOnly){'^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}elseif($ConfigDownloadMFAOnly){'^TestASensitiveDownloadMFAMySQLSeed$'}elseif($ConfigNonceTimeOnly){'^Test(DConfigWriterMySQLSeed|ANonceAcceptanceMySQLSeed)$'}elseif($ConfigMaintenanceAuthorityOnly){'^Test(DConfigMaintenanceReceiptMySQLSeed|AConfigWriterSecurityClockSeed|AConfigMaintenanceAuthorityMySQLSeed)$'}elseif($ConfigMaintenanceReceiptOnly){'^TestDConfigMaintenanceReceiptMySQLSeed$'}elseif($ConfigWriterOnly){'^Test(DConfigWriterMySQLSeed|AConfigWriterSecurityClockSeed)$'}else{'^TestAConfigProofMySQLSeed$'}
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run',$configProofSeedPattern,'-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            $configProofStandaloneBinary=Join-Path $evidenceScratch 'a-config-proof-standalone.exe'
            Invoke-AEvidenceGoStep -Arguments @('test','-c','-tags','systembackup_mysql','-o',$configProofStandaloneBinary,$evidenceProbePackage) -Stage 'mysql-probe-build'
            $configProofStandaloneCwd=Join-Path $evidenceScratch 'detached/work/probe'
            [IO.Directory]::CreateDirectory($configProofStandaloneCwd) | Out-Null
            if (@(Get-ChildItem -Force -LiteralPath $configProofStandaloneCwd).Count -ne 0) { throw 'Standalone config proof seed requires an empty directory' }
            Push-Location $configProofStandaloneCwd
            try {
                $configProofStandaloneExit=Invoke-AEvidenceNative -FilePath $configProofStandaloneBinary -Arguments @('-test.run',$configProofSeedPattern,'-test.v','-test.count=1','-test.timeout=60s')
                if ($configProofStandaloneExit -ne 0) { throw 'Standalone config proof seed failed; remote validation has not started' }
            } finally { Pop-Location }
            Write-Output ('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent writer-candidate='+[bool]$ConfigWriterOnly+' real_mysql=not_run')
        } elseif ($ProducerService -or $ProducerRecoveryOnly) {
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
        } elseif ($BusinessHistoryOnly -or $BusinessRestoreOnly) {
            $evidenceProbePackage='./internal/systembackupbusinessa'
            $aBusinessSeedPattern='^TestABusinessRestoreMySQLSeed$'
            Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run',$aBusinessSeedPattern,'-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'
            # Run the compiled package outside the checkout: remote probes have
            # only their binary, not repository-relative fixture files.
            $aBusinessStandaloneBinary=Join-Path $evidenceScratch 'a-business-standalone.exe'
            Invoke-AEvidenceGoStep -Arguments @('test','-c','-tags','systembackup_mysql','-o',$aBusinessStandaloneBinary,$evidenceProbePackage) -Stage 'mysql-probe-build'
            $aBusinessStandaloneCwd=Join-Path $evidenceScratch 'detached/work/probe'
            [IO.Directory]::CreateDirectory($aBusinessStandaloneCwd) | Out-Null
            if (@(Get-ChildItem -Force -LiteralPath $aBusinessStandaloneCwd).Count -ne 0 -or
                (Test-Path -LiteralPath (Join-Path $aBusinessStandaloneCwd '../../../contracts/system-backup/v12/schema-registry.json'))) {
                throw 'Standalone business seed must run without checkout fixtures'
            }
            Push-Location $aBusinessStandaloneCwd
            try {
                $aBusinessStandaloneExit=Invoke-AEvidenceNative -FilePath $aBusinessStandaloneBinary -Arguments @('-test.run',$aBusinessSeedPattern,'-test.v','-test.count=1','-test.timeout=60s')
                if ($aBusinessStandaloneExit -ne 0) { throw 'Standalone business seed failed; remote validation has not started' }
            } finally { Pop-Location }
            Write-Output 'LOCAL_PASS a-business-standalone-seed=yes checkout-fixtures=absent real_mysql=not_run'
            $aBusinessCompileScope=if($BusinessRestoreOnly){'restore'}else{'history'}
            Write-Output "LOCAL_PASS a-business-$aBusinessCompileScope-tagged-compile=yes real_mysql=not_run"
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
        $evidenceProbeName=if($ConfigDownloadGCRoleOnly){'a-download-gc-role.test'}elseif($ConfigDownloadProducerOnly){'d-download-producer-owner.test'}elseif($ConfigDownloadTaskChainOnly){'d-download-task-chain.test'}elseif($ConfigDownloadOwnersOnly){'a-download-owners.test'}elseif($ConfigDownloadAdmissionOnly){'a-download-admission.test'}elseif($ConfigDownloadMFAOnly){'a-download-mfa.test'}elseif($ConfigMaintenanceAuthorityOnly){'a-config-maintenance-authority.test'}elseif($ConfigBackfillServiceOnly){'d-config-canonical-backfill.test'}elseif($ConfigMaintenanceReceiptOnly){'d-config-maintenance-receipt.test'}elseif($ConfigWriterOnly){'d-config-writer.test'}elseif($ConfigProofOnly){'a-config-proof.test'}elseif($BusinessRestoreOnly){'a-business-restore.test'}elseif($BusinessHistoryOnly){'a-business-history.test'}else{'d-provider-registration.test'}
        $evidenceBinary=Join-Path $evidenceBundle $evidenceProbeName
        Invoke-AEvidenceGoStep -Arguments @('test','-c','-tags','systembackup_mysql','-o',$evidenceBinary,$evidenceProbePackage) -Stage 'mysql-probe-build'
        if ($AdminReadOnly) {
            $evidenceHTTPBinary=Join-Path $evidenceBundle 'd-admin-read-http.test'
            $evidenceHTTPSources=@('./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_live_test.go','./cmd/server/system_backup_read_live_mysql_test.go')
            if ($AdminReadConfigCandidate) { $evidenceHTTPSources+= './cmd/server/system_backup_read_config_http_mysql_test.go' }
            Invoke-AEvidenceGoStep -Arguments (@('test','-c','-tags','systembackup_mysql','-o',$evidenceHTTPBinary)+$evidenceHTTPSources) -Stage 'mysql-probe-build'
        }
        if ($AdminReadIndexCandidate) {
            $evidenceIndexBinary=Join-Path $evidenceBundle 'd-admin-read-index.test'
            Invoke-AEvidenceGoStep -Arguments @('test','-c','-tags','systembackup_mysql','-o',$evidenceIndexBinary,'./internal/systembackupread') -Stage 'mysql-probe-build'
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
    if ($ConfigProofOnly) { $evidenceDDLSpecs=@() }
    if ($BusinessHistoryOnly -or $BusinessRestoreOnly) { $evidenceDDLSpecs=@() }
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
    elseif (-not $ConfigProofOnly -and -not $LoginStateOnly -and -not $BusinessHistoryOnly -and -not $BusinessRestoreOnly) { $evidenceDDL += [IO.File]::ReadAllText((Join-Path $evidenceRoot $evidenceExtraDDL)).Replace("`r`n","`n")+"`n" }
    if ($LoginStateOnly -or $ConfigProofOnly) {
        # This profile carries a JSON provenance descriptor in the existing
        # harness payload slot. It never executes extracted/abbreviated DDL:
        # the probe clones users from the complete fresh migration database.
        $catalogSource=[IO.File]::ReadAllText((Join-Path $evidenceRoot 'backend/internal/systembackupcontroller/bootstrap.go'))
        $catalogMatch=[regex]::Matches($catalogSource,'ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"')
        if ($catalogMatch.Count -ne 1) { throw 'Compiled catalog pin is ambiguous' }
        $catalogFiles=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object { $_.Name })
        $evidenceInputKind=if($ConfigProofOnly){'a_config_proof_probe_inputs.v1'}else{'a_login_state_probe_inputs'}
        $evidenceDDL=ConvertTo-Json -Depth 4 -InputObject ([ordered]@{kind=$evidenceInputKind;catalog_sha256=$catalogMatch[0].Groups[1].Value;filenames=$catalogFiles})
        if ($ConfigWriterOnly) {
            $writerCandidate=[IO.File]::ReadAllText((Join-Path $evidenceRoot 'docs/system-backup-d-config-canonical-081-proposal-20261014.sql')).Replace("`r`n","`n")
            $writerCandidateSHA=[Security.Cryptography.SHA256]::Create()
            try { $writerCandidateHash=([BitConverter]::ToString($writerCandidateSHA.ComputeHash([Text.Encoding]::UTF8.GetBytes($writerCandidate)))).Replace('-','').ToLowerInvariant() } finally { $writerCandidateSHA.Dispose() }
            if ($writerCandidateHash -ne '14db3b88263f0ab3e31e293aa0351bb08da23464d4a0fee8854263d56354cce1') { throw 'Writer candidate DDL differs from compiled probe pin' }
            $evidenceDDL=ConvertTo-Json -Depth 6 -InputObject ([ordered]@{kind='d_config_writer_probe_inputs.v1';migration_inputs=($evidenceDDL|ConvertFrom-Json);candidate_ddl=$writerCandidate;candidate_sha256=$writerCandidateHash})
            if ($ConfigMaintenanceReceiptOnly) {
                $maintenanceCandidate=[IO.File]::ReadAllText((Join-Path $evidenceRoot 'docs/system-backup-d-config-maintenance-082-proposal-20261015.sql')).Replace("`r`n","`n")
                $maintenanceHasher=[Security.Cryptography.SHA256]::Create()
                try{$maintenanceHash=([BitConverter]::ToString($maintenanceHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($maintenanceCandidate)))).Replace('-','').ToLowerInvariant()}finally{$maintenanceHasher.Dispose()}
                if($maintenanceHash -ne 'e1a95c7863065580819e28353fa984fa8a98701ca2eeae57aff7ba5159a43b87'){throw 'Maintenance candidate DDL differs from compiled probe pin'}
                $evidenceDDL=ConvertTo-Json -Depth 8 -InputObject ([ordered]@{kind='d_config_maintenance_receipt_probe_inputs.v1';writer_inputs=($evidenceDDL|ConvertFrom-Json);maintenance_ddl=$maintenanceCandidate;maintenance_sha256=$maintenanceHash})
            }
        }
    }
    if($ConfigDownloadProducerOnly){$evidenceDDL=[IO.File]::ReadAllText((Join-Path $evidenceRoot 'backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json'))}elseif($ConfigDownloadMFAOnly){$evidenceDDL=[IO.File]::ReadAllText((Join-Path $evidenceRoot 'backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json'))}
    [IO.File]::WriteAllText($evidenceDDLPath,$evidenceDDL,$evidenceUTF8)
    $evidenceBinaryHash=(Get-FileHash -LiteralPath $evidenceBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    $evidenceDDLHash=(Get-FileHash -LiteralPath $evidenceDDLPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if($ConfigMaintenanceReceiptOnly){
        $env:D_MAINTENANCE_SEED_INPUTS=$evidenceDDLPath
        $env:D_MAINTENANCE_SEED_INPUTS_SHA256=$evidenceDDLHash
        Push-Location $configProofStandaloneCwd
        try{
            $maintenanceCapsuleExit=Invoke-AEvidenceNative -FilePath $configProofStandaloneBinary -Arguments @('-test.run',$configProofSeedPattern,'-test.v','-test.count=1','-test.timeout=60s')
            if($maintenanceCapsuleExit -ne 0){throw 'Actual frozen maintenance capsule failed detached validation; remote has not started'}
        }finally{Pop-Location}
        Write-Output ('LOCAL_PASS maintenance-actual-capsule-detached=yes inputs_sha256='+$evidenceDDLHash+' real_mysql=not_run')
    }
    $evidenceMigrationHash=(Get-FileHash -LiteralPath (Join-Path $evidenceBundle 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant()
    $evidenceHTTPHash=if($AdminReadOnly){(Get-FileHash -LiteralPath $evidenceHTTPBinary -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
    $evidenceIndexHash=if($AdminReadIndexCandidate){(Get-FileHash -LiteralPath $evidenceIndexBinary -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
    $evidenceProfile=if($ConfigDownloadGCRoleOnly){'a-download-gc-role'}elseif($ConfigDownloadProducerOnly){'d-download-producer-owner'}elseif($ConfigDownloadTaskChainOnly){'d-download-task-chain'}elseif($ConfigDownloadOwnersOnly){'a-download-owners'}elseif($ConfigDownloadAdmissionOnly){'a-download-admission'}elseif($ConfigDownloadMFAOnly){'a-download-mfa'}elseif($ConfigNonceTimeOnly){'a-nonce-acceptance'}elseif($ConfigMaintenanceAuthorityOnly){'a-config-maintenance-authority'}elseif($ConfigBackfillServiceOnly){'d-config-canonical-backfill'}elseif($ConfigMaintenanceReceiptOnly){'d-config-maintenance-receipt'}elseif($ConfigWriterSecurityOnly){'a-config-writer-security'}elseif($ConfigWriterOnly){'d-config-writer'}elseif($ConfigProofOnly){'config-proof'}elseif($BusinessRestoreOnly){'a-business-restore'}elseif($BusinessHistoryOnly){'a-business-history'}elseif($AdminReadOnly){'a-admin-read'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ARevoke'){'a-recovery-manager-revocation'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ABootstrap'){'a-recovery-manager-bootstrap'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ARead'){'a-recovery-authority-read'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'AManager'){'a-recovery-manager-authority'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'Authority'){'d-recovery-authority'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'Manager'){'d-recovery-manager-row'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'ADeployment'){'a-recovery-deployment'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'A'){'a-producer-recovery'}elseif($ProducerRecoveryOnly -and $RecoveryTest -eq 'Schema'){'d-recovery-authority-schema'}elseif($ProducerRecoveryOnly){'d-producer-recovery'}elseif($ProducerService){'d-producer-service'}elseif($LoginStateOnly){'login-state'}elseif($LoginSessionsOnly){'login-sessions'}else{'evidence'}
    $evidenceLocalGate=if($ProducerRecoveryOnly -and $RecoveryTest -eq 'Schema'){'schema-seed-and-vet'}else{'unit-tests'}
    Write-Output "LOCAL_PASS $evidenceProfile-$evidenceLocalGate=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=$evidenceBinaryHash ddl_sha256=$evidenceDDLHash"
    Write-Output "LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=$evidenceMigrationHash"
    if ($AdminReadOnly) { Write-Output "LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=$evidenceHTTPHash real_mysql=not_run" }
    if ($AdminReadConfigCandidate) { Write-Output 'VALIDATION_SCOPE config-canonical-candidate-local=compiled real_mysql=not_run production_migration=no' }
    if ($AdminReadIndexCandidate) { Write-Output "LOCAL_PASS d-admin-read-index-probe-compiled=yes binary_sha256=$evidenceIndexHash real_mysql=not_run production_migration=no" }
    if ($Remote) {
        $files=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-provider-registration-phase.sh','scripts/system-backup-d-migration-phase.sh','scripts/system-backup-a-business-history-phase.sh','backend/internal/systembackupcontroller/bootstrap.go')
        if ($AdminReadOnly) { $files+=@('scripts/system-backup-controller-enabled-fixture.mysql.sql') }
        if ($AdminReadConfigCandidate) { $files+=@('docs/system-backup-d-config-canonical-candidate-20261012.sql') }
        if ($AdminReadIndexCandidate) { $files+=@('docs/system-backup-d-admin-read-index-candidate-20261012.sql') }
        if ($ProducerService -or $ProducerRecoveryOnly) { $files+=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'contracts/system-backup/v12') -File | ForEach-Object { 'contracts/system-backup/v12/'+$_.Name }) }
        $files+=@(Get-ChildItem -LiteralPath (Join-Path $evidenceRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | ForEach-Object { 'backend/internal/db/migrations/'+$_.Name })
        foreach ($file in $files) {
            $destination=Join-Path $evidenceBundle $file
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            $evidencePhaseSource=if($ConfigDownloadGCRoleOnly){'scripts/system-backup-a-download-gc-role-phase.sh'}elseif($ConfigDownloadProducerOnly){'scripts/system-backup-d-download-producer-phase.sh'}elseif($ConfigDownloadTaskChainOnly){'scripts/system-backup-d-download-task-chain-phase.sh'}elseif($ConfigDownloadOwnersOnly){'scripts/system-backup-a-download-owners-phase.sh'}elseif($ConfigDownloadAdmissionOnly){'scripts/system-backup-a-download-admission-phase.sh'}elseif($ConfigDownloadMFAOnly){'scripts/system-backup-a-download-mfa-phase.sh'}elseif($ConfigNonceTimeOnly){'scripts/system-backup-a-nonce-acceptance-phase.sh'}elseif($ConfigMaintenanceAuthorityOnly){'scripts/system-backup-a-config-maintenance-authority-phase.sh'}elseif($ConfigBackfillServiceOnly){'scripts/system-backup-d-config-canonical-backfill-phase.sh'}elseif($ConfigMaintenanceReceiptOnly){'scripts/system-backup-d-config-maintenance-receipt-phase.sh'}elseif($ConfigWriterSecurityOnly){'scripts/system-backup-a-config-writer-security-phase.sh'}elseif($ConfigWriterOnly){'scripts/system-backup-d-config-writer-phase.sh'}elseif($ConfigProofOnly){'scripts/system-backup-a-config-proof-phase.sh'}elseif($AdminReadOnly){'scripts/system-backup-a-admin-read-phase.sh'}elseif($ProducerService -or $ProducerRecoveryOnly){'scripts/system-backup-d-producer-service-phase.sh'}elseif($LoginStateOnly){'scripts/system-backup-a-login-state-phase.sh'}elseif($LoginSessionsOnly){'scripts/system-backup-a-login-sessions-phase.sh'}else{'scripts/system-backup-a-evidence-phase.sh'}
            $bundleText=[IO.File]::ReadAllText((Join-Path $evidenceRoot $(if ($file -eq 'scripts/system-backup-d-provider-registration-phase.sh') { $evidencePhaseSource } else { $file }))).Replace("`r`n","`n")
            if (($ConfigWriterOnly -or $ProducerService -or $ProducerRecoveryOnly) -and $file -eq 'scripts/system-backup-fresh-migration-smoke.sh') {
                if ([regex]::Matches($bundleText,'(?m)^test_image_pull_policy=IfNotPresent$').Count -ne 1) { throw 'Cannot pin isolated producer image policy' }
                $bundleText=$bundleText.Replace('test_image_pull_policy=IfNotPresent','test_image_pull_policy=Never')
            }
            [IO.File]::WriteAllText($destination,$bundleText,$evidenceUTF8)
        }
        $evidenceCandidateFlag=if($AdminReadConfigCandidate){'1'}else{'0'}
        $evidenceCandidateHash=if($AdminReadConfigCandidate){(Get-FileHash -LiteralPath (Join-Path $evidenceBundle 'docs/system-backup-d-config-canonical-candidate-20261012.sql') -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
        $evidenceIndexFlag=if($AdminReadIndexCandidate){'1'}else{'0'}
        $evidenceIndexDDLHash=if($AdminReadIndexCandidate){(Get-FileHash -LiteralPath (Join-Path $evidenceBundle 'docs/system-backup-d-admin-read-index-candidate-20261012.sql') -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
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
        $invariantFlag=if($BusinessHistoryOnly -or $BusinessRestoreOnly){'0'}else{'1'}
        $businessFlag=if($BusinessHistoryOnly -or $BusinessRestoreOnly){'1'}else{'0'}
        $businessRestoreFlag=if($BusinessRestoreOnly){'1'}else{'0'}
        $evidenceBashPreflight=if($ConfigProofOnly){'bash -n scripts/system-backup-fresh-migration-smoke.sh; bash -n scripts/system-backup-d-provider-registration-phase.sh; bash -n scripts/system-backup-d-migration-phase.sh; '}elseif($BusinessRestoreOnly){'bash -n scripts/system-backup-fresh-migration-smoke.sh; bash -n scripts/system-backup-a-business-history-phase.sh; bash -n scripts/system-backup-d-migration-phase.sh; '}elseif($AdminReadIndexCandidate){'bash -n scripts/system-backup-fresh-migration-smoke.sh; bash -n scripts/system-backup-d-provider-registration-phase.sh; bash -n scripts/system-backup-d-migration-phase.sh; '}else{''}
        $evidenceNativeExit=Invoke-AEvidenceNative -FilePath $evidenceSsh -Arguments ($evidenceOptions + @($SshTarget, "set -eu; cd '$evidenceRemote'; echo '$archiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; ${evidenceBashPreflight}KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:$digest' EXPECTED_APP_DIGEST='$digest' D_MIGRATION_BINARY='$evidenceRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$evidenceMigrationHash' D_DB_INVARIANT_SMOKE=$invariantFlag D_PROVIDER_REGISTRATION_SMOKE=$invariantFlag A_BUSINESS_HISTORY_SMOKE=$businessFlag A_BUSINESS_RESTORE_SMOKE=$businessRestoreFlag A_BUSINESS_BINARY='$evidenceRemote/$evidenceProbeName' A_BUSINESS_BINARY_SHA256='$evidenceBinaryHash' D_PRODUCER_RECOVERY_ONLY=$recoveryOnlyFlag D_PRODUCER_RECOVERY_TEST='$RecoveryTest' D_INVARIANT_BINARY='$evidenceRemote/$evidenceProbeName' D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash' D_ADMIN_READ_HTTP_BINARY='$evidenceRemote/d-admin-read-http.test' D_ADMIN_READ_HTTP_BINARY_SHA256='$evidenceHTTPHash' D_ADMIN_INDEX_CANDIDATE=$evidenceIndexFlag D_ADMIN_INDEX_VARIANT='$AdminReadIndexVariant' D_ADMIN_INDEX_BINARY='$evidenceRemote/d-admin-read-index.test' D_ADMIN_INDEX_BINARY_SHA256='$evidenceIndexHash' D_ADMIN_INDEX_DDL='$evidenceRemote/docs/system-backup-d-admin-read-index-candidate-20261012.sql' D_ADMIN_INDEX_DDL_SHA256='$evidenceIndexDDLHash' D_CONFIG_CANDIDATE=$evidenceCandidateFlag D_CONFIG_CANDIDATE_DDL='$evidenceRemote/docs/system-backup-d-config-canonical-candidate-20261012.sql' D_CONFIG_CANDIDATE_DDL_SHA256='$evidenceCandidateHash' D_PROVIDER_REGISTRATION_DDL='$evidenceRemote/d-provider-registration.sql' D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash' bash scripts/system-backup-fresh-migration-smoke.sh"))
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
