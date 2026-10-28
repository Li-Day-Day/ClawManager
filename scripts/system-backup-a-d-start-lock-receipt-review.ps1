$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $taskRoot
try {
    $taskDPath='docs/evidence/d-backup-start-atomic-20261028.json'
    $taskD=Get-Content -LiteralPath $taskDPath -Raw|ConvertFrom-Json
    $taskN=Get-Content -LiteralPath $taskD.native -Raw|ConvertFrom-Json
    if($taskD.kind -cne 'd_backup_start_atomic.v2' -or $taskN.id -cne '8bd0243724f441f4b1f9bc86f91a9f7a' -or $taskN.status -ne 'passed' -or -not $taskN.cleanup -or -not $taskN.source_current_match -or -not $taskD.cleanup -or -not $taskD.source_current_match){throw 'New lock-shape terminal receipt incomplete'}
    foreach($receipt in @($taskN,$taskD)){
        if(@($receipt.steps).Count -ne 4 -or @($receipt.steps|Where-Object {$_.exit -ne 0}).Count){throw 'D phase exits incomplete'}
    }
    foreach($pin in $taskD.sources){
        if((Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw ('Current source changed: '+$pin.path)}
        if($pin.path.EndsWith('.go')){
            $frozen=@($taskN.source|Where-Object {$_.path -ceq $pin.path})
            if($frozen.Count -ne 1 -or $frozen[0].sha256 -cne $pin.sha256){throw 'New native frozen Go source differs'}
        }
    }
    $taskAPath='docs/evidence/a-d-controller-start-grant-review-20261028.json'
    $taskA=Get-Content -LiteralPath $taskAPath -Raw|ConvertFrom-Json
    foreach($pin in $taskA.inputs){
        $final=@($taskD.sources|Where-Object {$_.path -ceq $pin.path})
        if($final.Count -ne 1 -or $final[0].sha256 -cne $pin.sha256){throw 'Final bytes differ from A lock/grant source review'}
    }
    $expected=@(@{phase='execution-controller';roots=36;passes=94},@{phase='execution-dispatch';roots=1;passes=1},@{phase='execution-main';roots=3;passes=3})
    $taskLogs=@();$taskAll=@()
    foreach($phase in $expected){
        $path=$taskD.native.Replace('.json',('.'+$phase.phase+'.jsonl'))
        $events=@(Get-Content -LiteralPath $path|ForEach-Object {$_|ConvertFrom-Json})
        $runs=@($events|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
        $passes=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
        $roots=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test -and $_.Test -notmatch '/'})
        if(@($events|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -or @($events|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}).Count -ne 1 -or ($runs|ConvertTo-Json -Compress) -cne ($passes|ConvertTo-Json -Compress) -or $roots.Count -ne $phase.roots -or $passes.Count -ne $phase.passes){throw 'Native phase evidence mismatch'}
        $taskAll+=$events
        $taskLogs+=@{phase=$phase.phase;path=$path;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant();roots=$roots.Count;passes=$passes.Count}
    }
    foreach($test in @('TestBackupStartPreservesAuthorityAndFixedSQLClockFloors','TestBackupStartPreservesEntryClaimAndBudgetClockFloors','TestBackupStartFinalClockCannotOutliveOriginalAuthorization','TestExecutionAuthorityReadLocksDoNotRequireHistoryWriteGrants','TestBackupStartFinalHistoryReadsPreserveAppendOnlyPermissions')){
        if(@($taskAll|Where-Object {$_.Action -eq 'pass' -and $_.Test -ceq $test}).Count -ne 1){throw 'Clock or lock-shape regression root missing'}
    }
    if(@($taskD.runs).Count -ne 5){throw 'Owner inventory incomplete'}
    foreach($run in $taskD.runs){
        if($run.id -notmatch '^[a-f0-9]{32}$' -or $run.status -ne 'passed' -or -not $run.cleanup -or -not $run.owner_absent -or (Test-Path -LiteralPath ('.tmp-d-first-chain-'+$run.id))){throw 'D owner cleanup not confirmed'}
    }
    $taskA.new_lock_shape_final_receipt_verified=$true
    $taskFinal=[ordered]@{receipt=$taskDPath;native=$taskD.native;verified=$true;logs=$taskLogs;roots=40;pass_events=98;fail_skip=0;all_four_phase_exits=0;current_record_pins_match=$true;A_lock_grant_source_pins_match=$true;original_matrix_unchanged=$true;cleanup=$true;five_owner_directories_absent=$true;tests_rerun_by_A=$false;real_MySQL_grant_tests=$false;field_grants_authorized=$false;field_preflight_test_results_reviewed_by_A=$false}
    $taskA|Add-Member -NotePropertyName final_receipt -NotePropertyValue $taskFinal -Force
    $taskA|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $taskAPath -Encoding utf8
    $taskAtomicPath='docs/evidence/a-d-backup-start-atomic-review-20261028.json'
    $taskAtomic=Get-Content -LiteralPath $taskAtomicPath -Raw|ConvertFrom-Json
    $taskAtomic|Add-Member -NotePropertyName lock_shape_final_receipt -NotePropertyValue $taskFinal -Force
    $taskAtomic|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $taskAtomicPath -Encoding utf8
    Write-Output 'New lock-shape receipt verified: 40 roots / 98 passes, unchanged grant matrix, 5 owners absent'
} finally {Pop-Location}
