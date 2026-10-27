[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$EntryReceipt, [string]$PreparedOwner='')
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
$closeInventoryHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd2-owner-entry-supplement-inventory-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
$closePreparation=$null
$closePrefix=Join-Path $PSScriptRoot ('d2-owner-entry-supplement-'+$closeToken)
$closeManifest=$closePrefix+'-source.json'
$closeVariables=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$closePrevious=@{};foreach($closeVariable in $closeVariables){$closePrevious[$closeVariable]=[Environment]::GetEnvironmentVariable($closeVariable,'Process')}
$closeSteps=@();$closeError=$null;$closePost=$false;$closeCleanup=$false;$closeBinaries=@();$closeEntryHash=$null;$closeBinding=$null;$closeInventory=$null
function Invoke-CloseGo([string[]]$GoArguments,[string]$ExpectedFail=''){
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
    if($closeEntry.kind -cne 'd_bootstrap_entry_native.v1' -or $closeEntry.status -cne 'passed_exact_entry_snapshot' -or $closeEntry.cleaned -ne $true -or $closeEntry.snapshot_verified -ne $true -or $closeEntry.snapshot_unchanged -ne $true -or @($closeEntry.package_passes).Count -ne 10){throw 'Complete entry native/postcheck/cleanup required BEFORE supplement Go'}
    if($closeEntry.targeted_exit -ne 0 -or $closeEntry.full_exit -ne 0 -or $closeEntry.seeds_exit -ne 0 -or $closeEntry.error -or $closeEntry.actual_mysql_executed -ne $false -or $closeEntry.dependencies_installed -ne $false -or $closeEntry.actual_sql_cases_executed -ne 0){throw 'Parent entry must retain complete local-only native success'}
    $closeParentOwner=Join-Path $closeRoot ('.tmp-d-bootstrap-entry-'+([IO.Path]::GetFileNameWithoutExtension($closeEntryPath) -replace '^d-bootstrap-entry-native-',''))
    if(Test-Path -LiteralPath $closeParentOwner){throw 'Parent entry owner is still present; supplement Go must wait for actual cleanup'}
    if(@($closeEntry.linux_steps|Where-Object {$_.name -eq 'tagged-evidence-test-compile-only' -and $_.exit_code -eq 0}).Count -ne 1 -or @($closeEntry.linux_steps|Where-Object {$_.name -eq 'server' -and $_.exit_code -eq 0}).Count -ne 1 -or @($closeEntry.linux_steps|Where-Object {$_.name -eq 'migration-runner' -and $_.exit_code -eq 0}).Count -ne 1){throw 'Parent Linux obligations absent'}
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
    $closeParentMap=@{};foreach($pin in $closeEntry.files){$closeParentMap[$pin.path]=$pin}
    $closeCurrentMap=@{};foreach($pin in $closeCurrentSource.files){$closeCurrentMap[$pin.path]=$pin}
    $closeTaggedChanges=@()
    foreach($pin in $closeCurrentSource.files|Where-Object {$_.path -match '^backend/.*\.go$|^backend/go\.(mod|sum)$'}){
        $prior=$closeParentMap[$pin.path]
        if($null -eq $prior -or $prior.sha256 -cne $pin.sha256 -or $prior.size -ne $pin.size){
            $text=[IO.File]::ReadAllText((Join-Path $closeOwner ('source/'+$pin.path)))
            if($pin.path -notmatch '_mysql_test\.go$' -or $text -notmatch '(?m)^//go:build systembackup_mysql\r?$'){throw ('Ordinary Go input changed since full entry: '+$pin.path)}
            $closeTaggedChanges+=@([ordered]@{path=$pin.path;before=$prior;after=$pin;classification='tagged_test_delta_requires_independent_scope_review_not_parent_acceptance'})
        }
    }
    foreach($pin in $closeEntry.files|Where-Object {$_.path -match '^backend/.*\.go$|^backend/go\.(mod|sum)$'}){if(-not $closeCurrentMap.ContainsKey($pin.path)){throw ('Parent Go input removed: '+$pin.path)}}
    $closeBinding=[ordered]@{ordinary_go_matches_complete_entry=$true;tagged_test_deltas=$closeTaggedChanges;not_whole_source_equality=$true;Linux_evidence_server_migration_reused_from_exact_parent=$true;tagged_evidence_recompile_required=($closeTaggedChanges.Count -gt 0)}
    if($closeTaggedChanges.Count -gt 0){throw 'Tagged delta detected: stage explicit before/after scope and add evidence Linux recompile before using this supplement'}
    foreach($closeDirectory in @('cache','tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $closeOwner $closeDirectory))|Out-Null}
    $env:GOTELEMETRY='off';$env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:TEMP=Join-Path $closeOwner 'tmp';$env:TMP=$env:TEMP
    $env:GOCACHE=Join-Path $closeOwner 'cache';$env:GOTMPDIR=Join-Path $closeOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $closeOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $closeTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $closeTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($closeTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Closeout telemetry isolation failed'}
    & node (Join-Path $PSScriptRoot 'a-owner-entry-counterexamples-prepare-20261026.mjs') $closeOwner
    if($LASTEXITCODE -ne 0){throw 'Counterexample overlay preparation failed'}
    Push-Location (Join-Path $closeOwner 'source/backend')
    try {
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
    if($closeSteps.Count -ne 13){throw ('Missing thin-supplement stages: expected 13, got '+$closeSteps.Count)}
    $closeInventoryStages=Join-Path $closeOwner 'inventory-stages.json'
    [IO.File]::WriteAllText($closeInventoryStages,($closeSteps|ConvertTo-Json -Depth 8))
    $closeInventoryText=(& node (Join-Path $PSScriptRoot 'd2-owner-entry-supplement-inventory-20261026.mjs') $closeOwner $closeInventoryStages $closeEntryPath|Out-String)
    if($LASTEXITCODE -ne 0){throw 'Exact native seed/detached/standalone/counterexample inventory rejected'}
    $closeInventory=$closeInventoryText|ConvertFrom-Json
    & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $closeOwner $closeManifest
    if($LASTEXITCODE -ne 0){throw 'Local closeout frozen source postcheck failed'}
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeRunnerHash -or (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeSnapshotterHash){throw 'Executed closeout scripts drifted'}
    if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'a-owner-entry-counterexamples-prepare-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeCounterHelperHash){throw 'Counterexample helper drifted'}
    if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd2-owner-entry-supplement-inventory-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeInventoryHash){throw 'Native inventory checker drifted'}
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
    $closeResult=[ordered]@{kind='d2_owner_entry_baseline_supplement.v1';error=$closeError;source=$closeManifest;steps=$closeSteps;binaries=$closeBinaries;frozen_postcheck=$closePost;owner=$closeOwner;owner_removed=$closeCleanup;dependencies_installed=$false;remote_contacted=$false;actual_mysql=$false;production_approved=$false;runner=$PSCommandPath;runner_profile='owner_seeds_tagged_admin_resources_http_standalone_and_two_counterexamples_after_complete_entry' ; entry_validation=$EntryReceipt;entry_validation_sha256=$closeEntryHash;source_binding=$closeBinding;counterexample_helper_sha256=$closeCounterHelperHash;standalone_scope='five_explicit_standard_library_sources_not_concrete_collector';prepared_cache=$closePreparation;runner_sha256=$closeRunnerHash;snapshotter_sha256=$closeSnapshotterHash}
    $closeResult.native_inventory=$closeInventory
    $closeResult.inventory_checker_sha256=$closeInventoryHash
    [IO.File]::WriteAllText(($closePrefix+'.json'),($closeResult|ConvertTo-Json -Depth 12))
    Write-Output ('LOCAL_CLOSEOUT_RESULT='+$closePrefix+'.json')
}
if($closeError){throw $closeError}
