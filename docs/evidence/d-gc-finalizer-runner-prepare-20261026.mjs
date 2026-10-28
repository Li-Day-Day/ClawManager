import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let text = fs.readFileSync(path.join(dir, 'd-local-closeout-validation-r3-20261023.ps1'), 'utf8').replaceAll('\r\n', '\n');
function change(a, b) { assert.equal(text.split(a).length, 2, `Ambiguous runner transform: ${a.slice(0,80)}`); text = text.replace(a, () => b); }
change("$closeVariables=@('GO111MODULE'", "$closeVariables=@('GOENV','GO111MODULE'");
change("$closePreparation=Get-Content -LiteralPath (Join-Path $closeOwner 'prepared-cache.json')", "$closePreparation=Get-Content -LiteralPath (Join-Path $closeOwner 'preparation.json')");
change("$closePreparation.kind -cne 'd_local_closeout_prepared_cache.v1'", "$closePreparation.kind -cne 'd_gc_finalizer_preparation.v1'");
change("$env:GO111MODULE='on';$env:GOWORK='off'", "$env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off'");
change("$closeSnapshotterHash=(Get-FileHash", "$closeCounterHelperHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-gc-finalizer-counterexamples-prepare-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()\n$closeSnapshotterHash=(Get-FileHash");
const start = text.indexOf('function Invoke-CloseGo('), end = text.indexOf('\ntry {', start);
assert.ok(start > 0 && end > start);
text = text.slice(0,start) + String.raw`function Invoke-CloseGo([string[]]$GoArguments,[string]$ExpectedFail=''){
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
}` + text.slice(end);
change("    Push-Location (Join-Path $closeOwner 'source/backend')", `    & node (Join-Path $PSScriptRoot 'd-gc-finalizer-counterexamples-prepare-20261026.mjs') $closeOwner
    if($LASTEXITCODE -ne 0){throw 'Counterexample overlay preparation failed'}
    Push-Location (Join-Path $closeOwner 'source/backend')`);
change("^(TestAdmittedHTTPFixtureStillRejectsStaleSQLClock|", "^(TestDownloadGCFinalizer.*|TestDownloadGCFreezeFinalizationFollowsTicket|TestAdmittedHTTPFixtureStillRejectsStaleSQLClock|");
change("        $env:GOOS='linux'", `        $closeOwnerPattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run',$closeOwnerPattern,'-count=1','-timeout=180s','./internal/systembackupevidence')
        $closeWindowsOwner=Join-Path $closeOwner 'binary/owner-seeds.exe'
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',$closeWindowsOwner,'./internal/systembackupevidence')
        $closeDetached=Join-Path $closeOwner 'detached/work/probe';[IO.Directory]::CreateDirectory($closeDetached)|Out-Null
        Push-Location $closeDetached
        try {
            if(@(Get-ChildItem -LiteralPath . -Force).Count -ne 0){throw 'Detached directory is not empty'}
            $closeDetachedLog=$closePrefix+'-detached.log';[IO.File]::WriteAllText($closeDetachedLog,'')
            & $closeWindowsOwner -test.run $closeOwnerPattern -test.v -test.count=1 -test.timeout=60s 2>&1|Tee-Object -FilePath $closeDetachedLog
            $closeDetachedExit=$LASTEXITCODE
            $script:closeSteps+=@([ordered]@{command=@($closeWindowsOwner,'-test.run',$closeOwnerPattern,'-test.v','-test.count=1','-test.timeout=60s');platform='windows';exit_code=$closeDetachedExit;log=$closeDetachedLog;sha256=(Get-FileHash -LiteralPath $closeDetachedLog -Algorithm SHA256).Hash.ToLowerInvariant();working_directory=$closeDetached;initial_directory_empty=$true})
            if($closeDetachedExit -ne 0){throw 'Detached owner seeds failed'}
        } finally {Pop-Location}
        $env:GOOS='linux'
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/owners.test'),'./internal/systembackupevidence')`);
change("        foreach($closeBinary in Get-ChildItem", `        # Same five explicit standard-library sources as the standalone validator.
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
        foreach($closeBinary in Get-ChildItem`);
change("    $closePost=$true", `    if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-gc-finalizer-counterexamples-prepare-20261026.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $closeCounterHelperHash){throw 'Counterexample helper drifted'}
    $closePost=$true`);
change("runner_profile='http_native_producer_diagnostic_then_six_serial_packages'", "runner_profile='finalizer_diagnostics_six_packages_three_seeds_owner_packaged_detached_linux_five_builds_standalone_two_predecessor_counterexamples';counterexample_helper_sha256=$closeCounterHelperHash;standalone_scope='five_explicit_standard_library_sources_not_concrete_collector'");
// The original executed runner remains historical evidence. Publish corrected
// future entry separately; its exact commands are covered by the two segments.
change("'-run','^TestAAdminReadMySQLSeed$','-count=1','./internal/db')", "'-run','^TestAAdminReadMySQLSeed$','-count=1','./internal/systembackupsecurity')");
change("'binary/admin-read.test'),'./internal/db')", "'binary/admin-read.test'),'./internal/systembackupsecurity')");
change('            & $closeWindowsOwner -test.run $closeOwnerPattern -test.v -test.count=1 -test.timeout=60s 2>&1|Tee-Object -FilePath $closeDetachedLog',
 `            $closeDetachedArguments=@('-test.run',$closeOwnerPattern,'-test.v','-test.count=1','-test.timeout=60s')
            & $closeWindowsOwner @closeDetachedArguments 2>&1|Tee-Object -FilePath $closeDetachedLog`);
fs.writeFileSync(path.join(dir, 'd-gc-finalizer-current-validation-20261026.ps1'), text);
console.log('FINALIZER_CORRECTED_FUTURE_RUNNER_PREPARED original_executed_runner_preserved=yes');
