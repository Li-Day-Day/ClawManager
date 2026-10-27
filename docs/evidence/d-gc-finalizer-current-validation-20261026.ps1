[CmdletBinding()]
param([string]$PreparedOwner='')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$closeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if($PreparedOwner){
    $closeOwner=[IO.Path]::GetFullPath($PreparedOwner)
    if([IO.Path]::GetDirectoryName($closeOwner) -cne $closeRoot -or [IO.Path]::GetFileName($closeOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Prepared cache must be an exact workspace owner'}
    $closeToken=[IO.Path]::GetFileName($closeOwner).Substring('.tmp-d-index-cache-'.Length)
}else{$closeToken=[guid]::NewGuid().ToString('N');$closeOwner=Join-Path $closeRoot ('.tmp-d-index-cache-'+$closeToken)}
$closeRunnerHash=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$closeCounterHelperHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-gc-finalizer-counterexamples-prepare-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
$closeSnapshotterHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
$closePreparation=$null
$closePrefix=Join-Path $PSScriptRoot ('d-local-closeout-'+$closeToken)
$closeManifest=$closePrefix+'-source.json'
$closeVariables=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TEMP','TMP')
$closePrevious=@{};foreach($closeVariable in $closeVariables){$closePrevious[$closeVariable]=[Environment]::GetEnvironmentVariable($closeVariable,'Process')}
$closeSteps=@();$closeError=$null;$closePost=$false;$closeCleanup=$false;$closeBinaries=@()
function Invoke-CloseGo([string[]]$GoArguments,[string]$ExpectedFail=''){
    $attempts=@()
    for($attempt=1;$attempt -le 3;$attempt++){
        $closeStepLog=$closePrefix+'-step-'+$script:closeSteps.Count+'-attempt-'+$attempt+'.log'
        [IO.File]::WriteAllText($closeStepLog,'')
        $global:LASTEXITCODE=$null
        & go @GoArguments 2>&1 | Tee-Object -FilePath $closeStepLog
        $closeExit=$global:LASTEXITCODE
        $lines=@(Get-Content -LiteralPath $closeStepLog)
        $events=@();$rendered=@()
        foreach($line in $lines){
            try{$event=$line|ConvertFrom-Json -ErrorAction Stop;if($null -ne $event.Action){$events+=@($event)};if($null -ne $event.Output){$rendered+=@($event.Output)}else{$rendered+=@($line)}}catch{$rendered+=@($line)}
        }
        $nativeText=$rendered -join [Environment]::NewLine
        $toolCrash=$nativeText -match '(?im)^[^\r\n]*\b(?:vet|asm|compile)\.exe: exit status 0xc000(?:0043|026b)\s*$'
        $assertion=($events|Where-Object {$_.Action -eq 'fail' -and $_.Test}) -or $nativeText -match '(?m)^\s*--- FAIL:|^panic:|^fatal error:'
        $attempts+=@([ordered]@{attempt=$attempt;exit_code=$closeExit;log=$closeStepLog;sha256=(Get-FileHash -LiteralPath $closeStepLog -Algorithm SHA256).Hash.ToLowerInvariant();known_tool_crash=[bool]$toolCrash;assertion_failure=[bool]$assertion})
        if($closeExit -ne 0 -and $toolCrash -and -not $assertion -and $attempt -lt 3){Write-Warning 'Retrying SAME command after known Windows tool crash; vet remains enabled';continue}
        $script:closeSteps+=@([ordered]@{command=@('go')+$GoArguments;platform=$env:GOOS;exit_code=$closeExit;log=$closeStepLog;sha256=(Get-FileHash -LiteralPath $closeStepLog -Algorithm SHA256).Hash.ToLowerInvariant();attempts=$attempts;expected_failure_test=$ExpectedFail})
        if($ExpectedFail){
            $expectedFailure=@($events|Where-Object {$_.Action -eq 'fail' -and $_.Test -ceq $ExpectedFail})
            $badBuild=@($events|Where-Object {$_.Action -eq 'build-fail' -or $_.Action -eq 'skip'})
            if($closeExit -ne 1 -or $expectedFailure.Count -ne 1 -or $badBuild.Count -ne 0 -or $toolCrash -or $nativeText -match '(?m)^panic:|^fatal error:'){throw 'Expected predecessor counterexample did not fail by its specified test assertion'}
        }elseif($closeExit -ne 0){throw ('Local closeout native Go step failed exit='+$closeExit)}
        return
    }
}
try {
    if($PreparedOwner){
        if((Resolve-Path -LiteralPath $closeOwner).Path -cne $closeOwner -or ((Get-Item -Force -LiteralPath $closeOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $closeOwner 'owner.txt')) -cne [IO.Path]::GetFileName($closeOwner)){throw 'Prepared cache owner mismatch'}
        $closePreparation=Get-Content -LiteralPath (Join-Path $closeOwner 'preparation.json') -Raw -Encoding UTF8|ConvertFrom-Json
        if($closePreparation.kind -cne 'd_gc_finalizer_preparation.v1' -or $closePreparation.owner -cne $closeOwner -or -not(Test-Path -LiteralPath $closePreparation.report)){throw 'Prepared compilation cache is incomplete'}
    }else{
        if(Test-Path -LiteralPath $closeOwner){throw 'Local closeout owner exists'}
        [IO.Directory]::CreateDirectory($closeOwner)|Out-Null
        [IO.File]::WriteAllText((Join-Path $closeOwner 'owner.txt'),[IO.Path]::GetFileName($closeOwner))
    }
    & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') create $closeOwner $closeManifest
    if($LASTEXITCODE -ne 0){throw 'Local closeout snapshot failed; build not started'}
    foreach($closeDirectory in @('cache','tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $closeOwner $closeDirectory))|Out-Null}
    $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:TEMP=Join-Path $closeOwner 'tmp';$env:TMP=$env:TEMP
    $env:GOCACHE=Join-Path $closeOwner 'cache';$env:GOTMPDIR=Join-Path $closeOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $closeOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $closeTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $closeTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($closeTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Closeout telemetry isolation failed'}
    & node (Join-Path $PSScriptRoot 'd-gc-finalizer-counterexamples-prepare-20261026.mjs') $closeOwner
    if($LASTEXITCODE -ne 0){throw 'Counterexample overlay preparation failed'}
    Push-Location (Join-Path $closeOwner 'source/backend')
    try {
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=10m','-run','^(TestDownloadGCFinalizer.*|TestDownloadGCFreezeFinalizationFollowsTicket|TestAdmittedHTTPFixtureStillRejectsStaleSQLClock|TestAdmittedDownloadHTTPCompleteRangeAuditAndNoReplay|TestAdmittedDownloadHTTPInterruptionRevocationAndResultFailure|TestAdmittedDownloadHTTPPublicInternalAndClassificationRace|TestADownloadNativeBufferedOutputKeepsOriginalDeadline|TestGCProducerResultCapacitySamplingDoesNotRenewAdmission|TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback)$','./internal/systembackupevidence')
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=45m','./internal/systembackupevidence')
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=45m','./internal/systembackupproducer')
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=45m','./internal/systembackupresources')
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=45m','./internal/systembackupread')
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=45m','./internal/systembackupsecurity')
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=45m','./cmd/server')
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$','-count=1','./internal/systembackupresources')
        $closeHTTPSources=@('./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_cursor_key.go','./cmd/server/system_backup_read_live_test.go','./cmd/server/system_backup_read_cursor_key_test.go','./cmd/server/system_backup_read_live_mysql_test.go','./cmd/server/system_backup_read_verification_history_mysql_test.go','./cmd/server/system_backup_read_drill_history_mysql_test.go')
        Invoke-CloseGo -GoArguments (@('test','-json','-tags','systembackup_mysql','-run','^TestDDrillDetailHTTPSeed$','-count=1')+$closeHTTPSources)
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','./internal/systembackupsecurity')
        $closeOwnerPattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run',$closeOwnerPattern,'-count=1','-timeout=180s','./internal/systembackupevidence')
        $closeWindowsOwner=Join-Path $closeOwner 'binary/owner-seeds.exe'
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',$closeWindowsOwner,'./internal/systembackupevidence')
        $closeDetached=Join-Path $closeOwner 'detached/work/probe';[IO.Directory]::CreateDirectory($closeDetached)|Out-Null
        Push-Location $closeDetached
        try {
            if(@(Get-ChildItem -LiteralPath . -Force).Count -ne 0){throw 'Detached directory is not empty'}
            $closeDetachedLog=$closePrefix+'-detached.log';[IO.File]::WriteAllText($closeDetachedLog,'')
            $closeDetachedArguments=@('-test.run',$closeOwnerPattern,'-test.v','-test.count=1','-test.timeout=60s')
            & $closeWindowsOwner @closeDetachedArguments 2>&1|Tee-Object -FilePath $closeDetachedLog
            $closeDetachedExit=$LASTEXITCODE
            $script:closeSteps+=@([ordered]@{command=@($closeWindowsOwner,'-test.run',$closeOwnerPattern,'-test.v','-test.count=1','-test.timeout=60s');platform='windows';exit_code=$closeDetachedExit;log=$closeDetachedLog;sha256=(Get-FileHash -LiteralPath $closeDetachedLog -Algorithm SHA256).Hash.ToLowerInvariant();working_directory=$closeDetached;initial_directory_empty=$true})
            if($closeDetachedExit -ne 0){throw 'Detached owner seeds failed'}
        } finally {Pop-Location}
        $env:GOOS='linux'
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/owners.test'),'./internal/systembackupevidence')
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/resources.test'),'./internal/systembackupresources')
        Invoke-CloseGo -GoArguments (@('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/drill-http.test'))+$closeHTTPSources)
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/admin-read.test'),'./internal/systembackupsecurity')
        Invoke-CloseGo -GoArguments @('build','-o',(Join-Path $closeOwner 'binary/system-backup-migrate'),'./cmd/system-backup-migrate')
        Invoke-CloseGo -GoArguments @('build','-o',(Join-Path $closeOwner 'binary/server'),'./cmd/server')
        # Same five explicit standard-library sources as the standalone validator.
        $closeStandalone=Join-Path $closeOwner 'standalone';[IO.Directory]::CreateDirectory($closeStandalone)|Out-Null
        foreach($standaloneName in @('download_retention_gc_freeze.go','download_retention_gc_freeze_test.go','download_retention_gc_freeze_a_test.go','download_retention_gc_finalize.go','download_retention_gc_finalize_test.go')){[IO.File]::Copy((Join-Path $closeOwner ('source/backend/internal/systembackupevidence/'+$standaloneName)),(Join-Path $closeStandalone $standaloneName))}
        Push-Location $closeStandalone
        try {
            $env:GO111MODULE='off';$env:GOFLAGS='-p=1';$env:GOOS='windows'
            Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=180s','.')
            $env:GOOS='linux'
            Invoke-CloseGo -GoArguments @('test','-c','-o',(Join-Path $closeOwner 'binary/freeze-finalizer.test'),'.')
        } finally {Pop-Location;$env:GO111MODULE='on';$env:GOFLAGS='-mod=readonly -p=1';$env:GOOS='windows'}
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=180s','-overlay',(Join-Path $closeOwner 'counterexamples/missing_finalizer.json'),'-run','^TestDownloadGCFinalizerProtectedCandidate$/^worker_claim$','./internal/systembackupevidence') -ExpectedFail 'TestDownloadGCFinalizerProtectedCandidate/worker_claim'
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=180s','-overlay',(Join-Path $closeOwner 'counterexamples/earlier_clock_floor.json'),'-run','^TestDownloadGCFinalizerProtectedCandidate$/^clock_intermediate_rollback$','./internal/systembackupevidence') -ExpectedFail 'TestDownloadGCFinalizerProtectedCandidate/clock_intermediate_rollback'
        foreach($closeBinary in Get-ChildItem -LiteralPath (Join-Path $closeOwner 'binary') -File){$closeBinaries+=@{name=$closeBinary.Name;sha256=(Get-FileHash -LiteralPath $closeBinary.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
    } finally {Pop-Location}
    & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $closeOwner $closeManifest
    if($LASTEXITCODE -ne 0){throw 'Local closeout frozen source postcheck failed'}
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeRunnerHash -or (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeSnapshotterHash){throw 'Executed closeout scripts drifted'}
    if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-gc-finalizer-counterexamples-prepare-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeCounterHelperHash){throw 'Counterexample helper drifted'}
    $closePost=$true
} catch {$closeError=$_.Exception.Message} finally {
    foreach($closeVariable in $closeVariables){[Environment]::SetEnvironmentVariable($closeVariable,$closePrevious[$closeVariable],'Process')}
    if(Test-Path -LiteralPath $closeOwner){
        $closeResolved=(Resolve-Path -LiteralPath $closeOwner).Path
        if($closeResolved -cne $closeOwner -or [IO.Path]::GetDirectoryName($closeResolved) -cne $closeRoot -or [IO.Path]::GetFileName($closeResolved) -cne ('.tmp-d-index-cache-'+$closeToken) -or [IO.File]::ReadAllText((Join-Path $closeResolved 'owner.txt')) -cne [IO.Path]::GetFileName($closeResolved)){throw 'Refusing local closeout cleanup outside exact owner'}
        foreach($closeEntry in @((Get-Item -Force -LiteralPath $closeResolved))+@(Get-ChildItem -LiteralPath $closeResolved -Recurse -Force)){if($closeEntry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected local closeout cleanup'}}
        Remove-Item -LiteralPath $closeResolved -Recurse -Force
    }
    $closeCleanup=-not(Test-Path -LiteralPath $closeOwner)
    $closeResult=[ordered]@{kind='d_local_closeout_validation.v1';error=$closeError;source=$closeManifest;steps=$closeSteps;binaries=$closeBinaries;frozen_postcheck=$closePost;owner=$closeOwner;owner_removed=$closeCleanup;dependencies_installed=$false;remote_contacted=$false;actual_mysql=$false;production_approved=$false;runner=$PSCommandPath;runner_profile='finalizer_diagnostics_six_packages_three_seeds_owner_packaged_detached_linux_five_builds_standalone_two_predecessor_counterexamples';counterexample_helper_sha256=$closeCounterHelperHash;standalone_scope='five_explicit_standard_library_sources_not_concrete_collector';prepared_cache=$closePreparation;runner_sha256=$closeRunnerHash;snapshotter_sha256=$closeSnapshotterHash}
    [IO.File]::WriteAllText(($closePrefix+'.json'),($closeResult|ConvertTo-Json -Depth 8))
    Write-Output ('LOCAL_CLOSEOUT_RESULT='+$closePrefix+'.json')
}
if($closeError){throw $closeError}
