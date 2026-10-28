[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$EntryReceipt, [Parameter(Mandatory=$true)][string]$TargetManifest, [Parameter(Mandatory=$true)][string]$ScopeReview, [string]$PreparedOwner='')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$closeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if($PreparedOwner){
    $closeOwner=[IO.Path]::GetFullPath($PreparedOwner)
    if([IO.Path]::GetDirectoryName($closeOwner) -cne $closeRoot -or [IO.Path]::GetFileName($closeOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Prepared cache must be an exact workspace owner'}
    $closeToken=[IO.Path]::GetFileName($closeOwner).Substring('.tmp-d-index-cache-'.Length)
}else{$closeToken=[guid]::NewGuid().ToString('N');$closeOwner=Join-Path $closeRoot ('.tmp-d-index-cache-'+$closeToken)}
$closeRunnerHash=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$closeCounterHelperHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'a-owner-entry-counterexamples-prepare-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
$closeSnapshotterHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
$closeInventoryHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd2-owner-current-supplement-inventory-20261027.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
$closeScopeValidator=Join-Path $PSScriptRoot 'a-owner-pre-thin-scope-review-20261027.mjs'
$closePinnedArtifacts=@()
$closeScopeCheck=$null
function Invoke-CloseScopeCheck([string]$SourceRoot){
    $answer=(& node $closeScopeValidator --check --target $TargetManifest --scope $ScopeReview --source-root $SourceRoot|Out-String)
    if($LASTEXITCODE -ne 0){throw 'Independent exact target/scope review rejected; no native acceptance'}
    $checked=$answer|ConvertFrom-Json
    if($checked.kind -cne 'a_owner_pre_thin_scope_check.v1' -or $checked.status -cne 'ready_for_fifteen_stage_local_supplement_only' -or $checked.native_start_authorized -ne $true -or $checked.current_baseline_ready -ne $false -or $checked.actual_sql_authorized -ne $false){throw 'Independent scope checker did not return the exact local-only contract'}
    if($checked.target_sha256 -cne $closeTarget.target_sha256 -or $checked.target_manifest.sha256 -cne (Get-FileHash -LiteralPath $closeTargetPath -Algorithm SHA256).Hash.ToLowerInvariant() -or $checked.target_manifest.size -ne (Get-Item -LiteralPath $closeTargetPath).Length -or [IO.Path]::GetFullPath((Join-Path $closeRoot $checked.target_manifest.path)) -cne $closeTargetPath){throw 'Independent scope checker returned another target'}
    return $checked
}
$closePreparation=$null
$closePrefix=Join-Path $PSScriptRoot ('d2-owner-entry-supplement-'+$closeToken)
$closeManifest=$closePrefix+'-source.json'
$closeVariables=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$closePrevious=@{};foreach($closeVariable in $closeVariables){$closePrevious[$closeVariable]=[Environment]::GetEnvironmentVariable($closeVariable,'Process')}
$closeSteps=@();$closeError=$null;$closePost=$false;$closeCleanup=$false;$closeBinaries=@();$closeEntryHash=$null;$closeBinding=$null;$closeInventory=$null
$closeGoStarted=$false;$closeTestsStarted=$false
function Invoke-CloseGo([string[]]$GoArguments,[string]$ExpectedFail=''){
    $script:closeGoStarted=$true
    if($GoArguments[0] -ceq 'test' -and $GoArguments -notcontains '-c'){$script:closeTestsStarted=$true}
    $attempts=@()
    for($attempt=1;$attempt -le 1;$attempt++){
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
        $script:closeSteps+=@([ordered]@{command=@('go')+$GoArguments;platform=$env:GOOS;exit_code=$closeExit;log=$closeStepLog;sha256=(Get-FileHash -LiteralPath $closeStepLog -Algorithm SHA256).Hash.ToLowerInvariant();attempts=$attempts;expected_failure_test=$ExpectedFail})
        if($ExpectedFail){
            if($nativeText -notmatch 'post-ticket failure escaped exact shared rollback' -or $nativeText -notmatch 'Transaction:committed'){throw 'Counterexample did not observe unsafe committed work'}
            $expectedFailure=@($events|Where-Object {$_.Action -eq 'fail' -and $_.Test -ceq $ExpectedFail})
            $badBuild=@($events|Where-Object {$_.Action -eq 'build-fail' -or $_.Action -eq 'skip'})
            if($closeExit -ne 1 -or $expectedFailure.Count -ne 1 -or $badBuild.Count -ne 0 -or $toolCrash -or $nativeText -match '(?m)^panic:|^fatal error:'){throw 'Expected predecessor counterexample did not fail by its specified test assertion'}
        }elseif($closeExit -ne 0){throw ('Local closeout native Go step failed exit='+$closeExit)}
        elseif($GoArguments[0] -eq 'test' -and $GoArguments -notcontains '-c'){
            if(@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}).Count -eq 0 -or @($events|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -ne 0){throw 'Native test stage has no real passing tests, failed, or skipped'}
        }
        return
    }
}
try {
    $closeEntryPath=[IO.Path]::GetFullPath($EntryReceipt)
    if([IO.Path]::GetDirectoryName($closeEntryPath) -cne (Join-Path $closeRoot 'docs/evidence') -or [IO.Path]::GetFileName($closeEntryPath) -notmatch '^d-bootstrap-entry-native-[a-f0-9]{32}\.json$'){throw 'Expected exact workspace entry receipt'}
    $closeEntry=Get-Content -Raw -LiteralPath $closeEntryPath|ConvertFrom-Json
    $closeEntryHash=(Get-FileHash -LiteralPath $closeEntryPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if($closeEntry.kind -cne 'd_bootstrap_entry_native.v1' -or $closeEntry.cleaned -ne $true -or $closeEntry.snapshot_verified -ne $true -or $closeEntry.full_exit -ne 0 -or $closeEntry.targeted_exit -ne 0 -or $closeEntry.seeds_exit -ne 0 -or $closeEntry.actual_mysql_executed -ne $false -or $closeEntry.dependencies_installed -ne $false -or $closeEntry.actual_sql_cases_executed -ne 0){throw 'Actual complete parent test stages and cleanup required; parent scope itself is decided by A independent review'}
    $closeTargetPath=[IO.Path]::GetFullPath($TargetManifest)
    $closeReviewPath=[IO.Path]::GetFullPath($ScopeReview)
    foreach($artifact in @($closeTargetPath,$closeReviewPath,$closeScopeValidator)){
        if([IO.Path]::GetDirectoryName($artifact) -cne $PSScriptRoot -or ((Get-Item -LiteralPath $artifact -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Scope artifacts must be exact nonredirected evidence files'}
    }
    $closeTarget=Get-Content -Raw -LiteralPath $closeTargetPath|ConvertFrom-Json
    if($closeTarget.parent_receipt.sha256 -cne $closeEntryHash -or [IO.Path]::GetFullPath((Join-Path $closeRoot $closeTarget.parent_receipt.path)) -cne $closeEntryPath){throw 'Target binds another parent receipt'}
    $closeScopeCheck=Invoke-CloseScopeCheck $closeRoot
    foreach($artifact in @($closeTargetPath,$closeReviewPath,$closeScopeValidator,(Join-Path $PSScriptRoot 'a-owner-pre-thin-target-20261026.mjs'),(Join-Path $PSScriptRoot 'd2-owner-current-supplement-inventory-20261027.mjs'),(Join-Path $PSScriptRoot 'd2-owner-entry-supplement-inventory-20261026.mjs'),(Join-Path $PSScriptRoot 'd-resources-mysql-actual-review-20261023.mjs'),(Join-Path $PSScriptRoot 'a-owner-finalizer-native-20261026.mjs'))){$closePinnedArtifacts+=@([ordered]@{path=$artifact;sha256=(Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()})}
    $closeParentOwner=Join-Path $closeRoot ('.tmp-d-bootstrap-entry-'+([IO.Path]::GetFileNameWithoutExtension($closeEntryPath) -replace '^d-bootstrap-entry-native-',''))
    if(Test-Path -LiteralPath $closeParentOwner){throw 'Parent entry owner is still present'}
    if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another native Go process is active'}
    if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($closeRoot))).AvailableFreeSpace -lt 10GB){throw 'Insufficient isolated supplement disk space'}
    if($PreparedOwner){
        if((Resolve-Path -LiteralPath $closeOwner).Path -cne $closeOwner -or ((Get-Item -Force -LiteralPath $closeOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $closeOwner 'owner.txt')) -cne [IO.Path]::GetFileName($closeOwner)){throw 'Prepared cache owner mismatch'}
        if(Test-Path -LiteralPath (Join-Path $closeOwner 'preparation.json')){$closePreparation=Get-Content -Raw -LiteralPath (Join-Path $closeOwner 'preparation.json')|ConvertFrom-Json}
    }else{
        if(Test-Path -LiteralPath $closeOwner){throw 'Local closeout owner exists'}
        [IO.Directory]::CreateDirectory($closeOwner)|Out-Null
        [IO.File]::WriteAllText((Join-Path $closeOwner 'owner.txt'),[IO.Path]::GetFileName($closeOwner))
    }
    & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') create $closeOwner $closeManifest
    if($LASTEXITCODE -ne 0){throw 'Local closeout snapshot failed; build not started'}
    $closeCurrentSource=Get-Content -Raw -LiteralPath $closeManifest|ConvertFrom-Json
    $closeFrozenScopeCheck=Invoke-CloseScopeCheck (Join-Path $closeOwner 'source')
    $closeBinding=[ordered]@{target_sha256=$closeFrozenScopeCheck.target_sha256;scope_review_sha256=(Get-FileHash -LiteralPath $closeReviewPath -Algorithm SHA256).Hash.ToLowerInvariant();independent_scope_check=$closeFrozenScopeCheck;parent_terminal_status=$closeEntry.status;parent_final_postcheck_retroactively_claimed=$false;current_baseline_accepted=$false}
    foreach($closeDirectory in @('cache','tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $closeOwner $closeDirectory))|Out-Null}
    $env:GOTELEMETRY='off';$env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:TEMP=Join-Path $closeOwner 'tmp';$env:TMP=$env:TEMP
    $env:GOCACHE=Join-Path $closeOwner 'cache';$env:GOTMPDIR=Join-Path $closeOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $closeOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $closeGoStarted=$true
    $closeTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $closeTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($closeTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Closeout telemetry isolation failed'}
    if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another native Go process appeared before supplement tests'}
    & node (Join-Path $PSScriptRoot 'a-owner-entry-counterexamples-prepare-20261026.mjs') $closeOwner
    if($LASTEXITCODE -ne 0){throw 'Counterexample overlay preparation failed'}
    Push-Location (Join-Path $closeOwner 'source/backend')
    try {
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^TestDDownloadGCFull(Collect|Profile|Lifecycle)MySQLSeed$','-count=1','-timeout=2700s','./internal/systembackupevidence')
        $env:GOOS='linux'
        $closeEvidenceBinary=Join-Path $closeOwner 'binary/current-evidence.test'
        Invoke-CloseGo -GoArguments @('test','-vet=off','-c','-tags','systembackup_mysql','-o',$closeEvidenceBinary,'./internal/systembackupevidence')
        $closeSteps[1].binary=$closeEvidenceBinary
        $closeSteps[1].binary_sha256=(Get-FileHash -LiteralPath $closeEvidenceBinary -Algorithm SHA256).Hash.ToLowerInvariant()
        $env:GOOS='windows'
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$','-count=1','-timeout=2700s','./internal/systembackupresources')
        $closeHTTPSources=@('./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_cursor_key.go','./cmd/server/system_backup_read_live_test.go','./cmd/server/system_backup_read_cursor_key_test.go','./cmd/server/system_backup_read_live_mysql_test.go','./cmd/server/system_backup_read_verification_history_mysql_test.go','./cmd/server/system_backup_read_drill_history_mysql_test.go')
        Invoke-CloseGo -GoArguments (@('test','-json','-tags','systembackup_mysql','-run','^TestDDrillDetailHTTPSeed$','-count=1','-timeout=2700s')+$closeHTTPSources)
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','-timeout=2700s','./internal/systembackupsecurity')
        $closeOwnerPattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run',$closeOwnerPattern,'-count=1','-timeout=2700s','./internal/systembackupevidence')
        $closeWindowsOwner=Join-Path $closeOwner 'binary/owner-seeds.exe'
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',$closeWindowsOwner,'./internal/systembackupevidence')
        $closeDetached=Join-Path $closeOwner 'detached/work/probe';[IO.Directory]::CreateDirectory($closeDetached)|Out-Null
        Push-Location $closeDetached
        try {
            if(@(Get-ChildItem -LiteralPath . -Force).Count -ne 0){throw 'Detached directory is not empty'}
            $closeDetachedLog=$closePrefix+'-detached.log';[IO.File]::WriteAllText($closeDetachedLog,'')
            $closeDetachedArguments=@('-test.run',$closeOwnerPattern,'-test.v','-test.count=1','-test.timeout=2700s')
            & $closeWindowsOwner @closeDetachedArguments 2>&1|Tee-Object -FilePath $closeDetachedLog
            $closeDetachedExit=$LASTEXITCODE
            $script:closeSteps+=@([ordered]@{command=@($closeWindowsOwner,'-test.run',$closeOwnerPattern,'-test.v','-test.count=1','-test.timeout=2700s');platform='windows';exit_code=$closeDetachedExit;log=$closeDetachedLog;sha256=(Get-FileHash -LiteralPath $closeDetachedLog -Algorithm SHA256).Hash.ToLowerInvariant();working_directory=$closeDetached;initial_directory_empty=$true})
            if($closeDetachedExit -ne 0){throw 'Detached owner seeds failed'}
        } finally {Pop-Location}
        $env:GOOS='linux'
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/resources.test'),'./internal/systembackupresources')
        Invoke-CloseGo -GoArguments (@('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/drill-http.test'))+$closeHTTPSources)
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/admin-read.test'),'./internal/systembackupsecurity')
        # Same five explicit standard-library sources as the standalone validator.
        $closeStandalone=Join-Path $closeOwner 'standalone';[IO.Directory]::CreateDirectory($closeStandalone)|Out-Null
        foreach($standaloneName in @('download_retention_gc_freeze.go','download_retention_gc_freeze_test.go','download_retention_gc_freeze_a_test.go','download_retention_gc_finalize.go','download_retention_gc_finalize_test.go')){[IO.File]::Copy((Join-Path $closeOwner ('source/backend/internal/systembackupevidence/'+$standaloneName)),(Join-Path $closeStandalone $standaloneName))}
        Push-Location $closeStandalone
        try {
            $env:GO111MODULE='off';$env:GOFLAGS='-p=1';$env:GOOS='windows'
            Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=2700s','.')
            $env:GOOS='linux'
            Invoke-CloseGo -GoArguments @('test','-c','-o',(Join-Path $closeOwner 'binary/freeze-finalizer.test'),'.')
        } finally {Pop-Location;$env:GO111MODULE='on';$env:GOFLAGS='-mod=readonly -p=1';$env:GOOS='windows'}
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=2700s','-overlay',(Join-Path $closeOwner 'entry-owner-counterexamples/missing_finalizer.json'),'-run','^TestDownloadGCFinalizerProtectedCandidate$/^worker_claim$','./internal/systembackupevidence') -ExpectedFail 'TestDownloadGCFinalizerProtectedCandidate/worker_claim'
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=2700s','-overlay',(Join-Path $closeOwner 'entry-owner-counterexamples/earlier_clock_floor.json'),'-run','^TestDownloadGCFinalizerProtectedCandidate$/^clock_intermediate_rollback$','./internal/systembackupevidence') -ExpectedFail 'TestDownloadGCFinalizerProtectedCandidate/clock_intermediate_rollback'
        foreach($closeBinary in Get-ChildItem -LiteralPath (Join-Path $closeOwner 'binary') -File){$closeBinaries+=@{name=$closeBinary.Name;sha256=(Get-FileHash -LiteralPath $closeBinary.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
    } finally {Pop-Location}
    if($closeSteps.Count -ne 15){throw ('Missing current supplement stages: expected 15, got '+$closeSteps.Count)}
    $closeInventoryStages=Join-Path $closeOwner 'inventory-stages.json'
    [IO.File]::WriteAllText($closeInventoryStages,($closeSteps|ConvertTo-Json -Depth 8))
    $closeInventoryText=(& node (Join-Path $PSScriptRoot 'd2-owner-current-supplement-inventory-20261027.mjs') $closeOwner $closeInventoryStages $closeEntryPath $closeEntryHash|Out-String)
    if($LASTEXITCODE -ne 0){throw 'Exact native seed/detached/standalone/counterexample inventory rejected'}
    $closeInventory=$closeInventoryText|ConvertFrom-Json
    & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $closeOwner $closeManifest
    if($LASTEXITCODE -ne 0){throw 'Local closeout frozen source postcheck failed'}
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeRunnerHash -or (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeSnapshotterHash){throw 'Executed closeout scripts drifted'}
    if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'a-owner-entry-counterexamples-prepare-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeCounterHelperHash){throw 'Counterexample helper drifted'}
    if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd2-owner-current-supplement-inventory-20261027.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeInventoryHash){throw 'Native inventory checker drifted'}
    foreach($artifact in $closePinnedArtifacts){if((Get-FileHash -LiteralPath $artifact.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $artifact.sha256){throw 'Executed scope/inventory artifact drifted'}}
    $closeFinalScopeCheck=Invoke-CloseScopeCheck (Join-Path $closeOwner 'source')
    $closePost=$true
} catch {$closeError=$_.Exception.Message} finally {
    if((Test-Path -LiteralPath $closeManifest) -and (Test-Path -LiteralPath (Join-Path $closeOwner 'source'))){
        try {
            & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $closeOwner $closeManifest
            if($LASTEXITCODE -ne 0){throw 'Supplement final frozen source check failed'}
            $closePost=$true
        }catch{
            $closePost=$false
            if(-not $closeError){$closeError=$_.Exception.Message}
        }
    }
    foreach($closeVariable in $closeVariables){[Environment]::SetEnvironmentVariable($closeVariable,$closePrevious[$closeVariable],'Process')}
    if(Test-Path -LiteralPath $closeOwner){
        $closeResolved=(Resolve-Path -LiteralPath $closeOwner).Path
        if($closeResolved -cne $closeOwner -or [IO.Path]::GetDirectoryName($closeResolved) -cne $closeRoot -or [IO.Path]::GetFileName($closeResolved) -cne ('.tmp-d-index-cache-'+$closeToken) -or [IO.File]::ReadAllText((Join-Path $closeResolved 'owner.txt')) -cne [IO.Path]::GetFileName($closeResolved)){throw 'Refusing local closeout cleanup outside exact owner'}
        foreach($closeEntry in @((Get-Item -Force -LiteralPath $closeResolved))+@(Get-ChildItem -LiteralPath $closeResolved -Recurse -Force)){if($closeEntry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected local closeout cleanup'}}
        Remove-Item -LiteralPath $closeResolved -Recurse -Force
    }
    $closeCleanup=-not(Test-Path -LiteralPath $closeOwner)
    $closeResult=[ordered]@{kind='d2_owner_current_baseline_supplement.v1';error=$closeError;source=$closeManifest;steps=$closeSteps;binaries=$closeBinaries;frozen_postcheck=$closePost;owner=$closeOwner;owner_removed=$closeCleanup;dependencies_installed=$false;remote_contacted=$false;actual_mysql=$false;production_approved=$false;runner=$PSCommandPath;runner_profile='fifteen_stages_after_independent_exact_target_scope_review' ; entry_validation=$EntryReceipt;entry_validation_sha256=$closeEntryHash;source_binding=$closeBinding;counterexample_helper_sha256=$closeCounterHelperHash;standalone_scope='five_explicit_standard_library_sources_not_concrete_collector';prepared_cache=$closePreparation;runner_sha256=$closeRunnerHash;snapshotter_sha256=$closeSnapshotterHash}
    $closeResult.native_inventory=$closeInventory
    $closeResult.Go_started=$closeGoStarted
    $closeResult.tests_started=$closeTestsStarted
    $closeResult.scope_artifacts=$closePinnedArtifacts
    $closeResult.current_baseline_accepted=$false
    $closeResult.inventory_checker_sha256=$closeInventoryHash
    [IO.File]::WriteAllText(($closePrefix+'.json'),($closeResult|ConvertTo-Json -Depth 12))
    Write-Output ('LOCAL_CLOSEOUT_RESULT='+$closePrefix+'.json')
}
if($closeError){throw $closeError}
