$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $taskRoot
try {
    $taskDPath='docs/evidence/d-backup-start-atomic-20261028.json'
    $taskD=Get-Content -LiteralPath $taskDPath -Raw|ConvertFrom-Json
    $taskN=Get-Content -LiteralPath $taskD.native -Raw|ConvertFrom-Json
    if($taskN.id -cne '937673dedd044162bee2c511dd26d92c' -or $taskN.status -ne 'passed' -or -not $taskN.cleanup -or -not $taskN.source_current_match -or -not $taskD.cleanup -or -not $taskD.source_current_match){throw 'Final D run incomplete'}
    foreach($receipt in @($taskN,$taskD)){
        if(@($receipt.steps).Count -ne 4 -or @($receipt.steps|Where-Object {$_.exit -ne 0}).Count){throw 'D phase exits incomplete'}
    }
    foreach($pin in $taskD.sources){
        if((Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw ('Current source changed: '+$pin.path)}
        if($pin.path.EndsWith('.go')){
            $frozen=@($taskN.source|Where-Object {$_.path -ceq $pin.path})
            if($frozen.Count -ne 1 -or $frozen[0].sha256 -cne $pin.sha256){throw 'Native frozen source differs'}
        }
    }
    $taskAPath='docs/evidence/a-d-backup-start-atomic-review-20261028.json'
    $taskA=Get-Content -LiteralPath $taskAPath -Raw|ConvertFrom-Json
    foreach($pin in $taskA.latest_source_inputs){
        $final=@($taskD.sources|Where-Object {$_.path -ceq $pin.path})
        if($final.Count -ne 1 -or $final[0].sha256 -cne $pin.sha256){throw 'Final source differs from A clock chain review'}
    }
    $taskExpected=@(@{phase='execution-controller';roots=34;passes=92},@{phase='execution-dispatch';roots=1;passes=1},@{phase='execution-main';roots=3;passes=3})
    $taskLogs=@();$taskAll=@()
    foreach($expected in $taskExpected){
        $path=$taskD.native.Replace('.json',('.'+$expected.phase+'.jsonl'))
        $events=@(Get-Content -LiteralPath $path|ForEach-Object {$_|ConvertFrom-Json})
        $runs=@($events|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
        $passes=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
        $roots=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test -and $_.Test -notmatch '/'})
        if(@($events|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -or @($events|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}).Count -ne 1 -or ($runs|ConvertTo-Json -Compress) -cne ($passes|ConvertTo-Json -Compress) -or $roots.Count -ne $expected.roots -or $passes.Count -ne $expected.passes){throw 'Native phase evidence mismatch'}
        $taskAll+=$events
        $taskLogs+=@{phase=$expected.phase;path=$path;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant();roots=$roots.Count;passes=$passes.Count}
    }
    foreach($test in @('TestBackupStartPreservesAuthorityAndFixedSQLClockFloors','TestBackupStartPreservesEntryClaimAndBudgetClockFloors','TestBackupStartFinalClockCannotOutliveOriginalAuthorization')){
        if(@($taskAll|Where-Object {$_.Action -eq 'pass' -and $_.Test -ceq $test}).Count -ne 1){throw 'Required regression root missing'}
    }
    if(@($taskD.runs).Count -ne 4){throw 'Owner inventory incomplete'}
    foreach($run in $taskD.runs){
        if($run.id -notmatch '^[a-f0-9]{32}$' -or $run.status -ne 'passed' -or -not $run.cleanup -or -not $run.owner_absent -or (Test-Path -LiteralPath ('.tmp-d-first-chain-'+$run.id))){throw 'D cleanup not confirmed'}
    }
    $taskA.findings[0].status='closed_for_reviewed_frozen_source'
    $taskA.remaining_findings[0].status='closed_for_reviewed_frozen_source'
    $taskA.D_final_run_pending=$false
    $taskA|Add-Member -NotePropertyName final_receipt -NotePropertyValue ([ordered]@{receipt=$taskDPath;native=$taskD.native;verified=$true;logs=$taskLogs;native_roots=38;native_pass_events=96;fail_skip=0;all_four_phase_exits=0;current_record_source_pins_match=$true;A_reviewed_clock_chain_bytes_match=$true;cleanup=$true;four_owner_directories_absent=$true;tests_rerun_by_A=$false;actual_MySQL=$false;production_execution_verified=$false;full_checkout_retested_by_A=$false}) -Force
    $taskA|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $taskAPath -Encoding utf8
    Write-Output 'Final atomic start receipt verified: 38 roots / 96 passes, current pins, cleanup'
} finally {Pop-Location}
