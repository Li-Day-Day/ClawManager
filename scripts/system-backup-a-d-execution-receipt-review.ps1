$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $taskRoot
try {
    $taskDPath='docs/evidence/d-execution-wiring-20261028.json'
    $taskD=Get-Content -LiteralPath $taskDPath -Raw|ConvertFrom-Json
    $taskNative=Get-Content -LiteralPath $taskD.native -Raw|ConvertFrom-Json
    if(-not $taskD.current_source_match -or -not $taskD.cleanup -or $taskNative.status -ne 'passed' -or -not $taskNative.cleanup){throw 'D terminal receipt incomplete'}
    if(@($taskD.native_steps).Count -ne 4 -or @($taskD.native_steps|Where-Object {$_.exit -ne 0}).Count){throw 'D phase exits incomplete'}
    foreach($pin in $taskD.sources){
        if((Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw ('Current D source changed: '+$pin.path)}
        if($pin.path.EndsWith('.go')){
            $frozen=@($taskNative.source|Where-Object {$_.path -ceq $pin.path})
            if($frozen.Count -ne 1 -or $frozen[0].sha256 -cne $pin.sha256){throw 'Final frozen Go input differs'}
        }
    }
    $taskAPath='docs/evidence/a-d-execution-guard-review-20261028.json'
    $taskA=Get-Content -LiteralPath $taskAPath -Raw|ConvertFrom-Json
    foreach($pin in $taskA.inputs){
        $final=@($taskD.sources|Where-Object {$_.path -ceq $pin.path})
        if($final.Count -ne 1 -or $final[0].sha256 -cne $pin.sha256){throw 'Final guard differs from A source review'}
    }
    $taskEvents=@();$taskLogs=@()
    foreach($phase in @('execution-controller','execution-dispatch','execution-main')){
        $path=$taskD.native.Replace('.json',('.'+$phase+'.jsonl'))
        $events=@(Get-Content -LiteralPath $path|ForEach-Object {$_|ConvertFrom-Json})
        if(@($events|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -or @($events|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}).Count -ne 1){throw 'Incomplete native test phase'}
        $taskEvents+=$events
        $taskLogs+=@{path=$path;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $taskRuns=@($taskEvents|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
    $taskPasses=@($taskEvents|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
    $taskRoots=@($taskEvents|Where-Object {$_.Action -eq 'pass' -and $_.Test -and $_.Test -notmatch '/'})
    if(($taskRuns|ConvertTo-Json -Compress) -cne ($taskPasses|ConvertTo-Json -Compress) -or $taskRoots.Count -ne 21 -or $taskPasses.Count -ne 33){throw 'Native run/pass/count mismatch'}
    foreach($name in @('TestExecutionAuthorityCopySharesFailureAndOriginalContext','TestExecutionAuthorityRejectsTypedNilContext')){
        if(@($taskRoots|Where-Object {$_.Test -ceq $name}).Count -ne 1){throw 'Required guard regression missing'}
    }
    foreach($owner in $taskD.owned_test_products){
        if($owner.id -notmatch '^[a-f0-9]{32}$' -or -not $owner.absent -or (Test-Path -LiteralPath ('.tmp-d-first-chain-'+$owner.id))){throw 'D owned products still present'}
    }
    $taskOld=@(& git show d3c5715a05a80c1134edd3ad0132a6c292ee1672:backend/internal/systembackupdispatch/contract.go) -join "`n"
    if($LASTEXITCODE -ne 0){throw 'Original public ABI unavailable'}
    $taskCurrent=Get-Content -LiteralPath 'backend/internal/systembackupdispatch/contract.go' -Raw
    foreach($name in @('Authority','JobBinding')){
        $pattern='(?ms)^type '+$name+' struct \{.*?^\}'
        $before=[regex]::Match($taskOld,$pattern);$after=[regex]::Match($taskCurrent,$pattern)
        if(-not $before.Success -or -not $after.Success -or [regex]::Replace($before.Value,'\s','') -cne [regex]::Replace($after.Value,'\s','')){throw 'Relay input definition changed'}
    }
    $taskRelay=Get-Content -LiteralPath 'docs/evidence/a-dispatch-relay-validation-20261028.json' -Raw|ConvertFrom-Json
    foreach($pin in $taskRelay.A_sources){
        if((Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'A relay changed'}
    }
    $taskCompatibility=[ordered]@{original_public_commit='d3c5715a05a80c1134edd3ad0132a6c292ee1672';Authority_and_JobBinding_declarations_unchanged=$true;comparison='exact declarations ignoring whitespace only';four_A_relay_sources_match_tested_bytes=$true;whole_current_ABI_tested_by_A=$false}
    $taskA.D_final_test_receipt_verified=$true
    $taskA|Add-Member -NotePropertyName D_final_run -NotePropertyValue ([ordered]@{receipt=$taskDPath;native=$taskD.native;native_roots=$taskRoots.Count;native_pass_events=$taskPasses.Count;fail_skip=0;all_four_phase_exits=0;current_D_sources_match=$true;reviewed_guard_bytes_match=$true;logs=$taskLogs;cleanup=$true;four_owner_directories_absent=$true;real_SQL=$false;production_authorization=$false;tests_rerun_by_A=$false;relay_compatibility=$taskCompatibility}) -Force
    $taskA|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $taskAPath -Encoding utf8
    Write-Output 'Verified final D receipt: 21 roots / 33 passes; exact guard pins; 4 owners absent'
} finally {Pop-Location}
