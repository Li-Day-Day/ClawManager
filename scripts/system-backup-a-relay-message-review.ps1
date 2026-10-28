$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $taskRoot
try {
    $taskID='123e09588521409191676ff54581f1b2'
    $taskPrefix='docs/evidence/a-relay-message-native-'+$taskID
    $taskR=Get-Content -LiteralPath ($taskPrefix+'.json') -Raw|ConvertFrom-Json
    if($taskR.status -ne 'passed_for_exact_snapshot' -or $taskR.native_exit -ne 0 -or $taskR.linux_evidence_exit -ne 0 -or -not $taskR.cleanup -or -not $taskR.linux_evidence_binary.sha256 -or $taskR.linux_evidence_binary.executed){throw 'Message validation or cleanup incomplete'}
    $taskEvents=@(Get-Content -LiteralPath ($taskPrefix+'.native.jsonl')|ForEach-Object {$_|ConvertFrom-Json})
    $runs=@($taskEvents|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object Test|Sort-Object)
    $passes=@($taskEvents|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object Test|Sort-Object)
    $roots=@($taskEvents|Where-Object {$_.Action -eq 'pass' -and $_.Test -and $_.Test -notmatch '/'})
    if(@($taskEvents|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -or @($taskEvents|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}).Count -ne 1 -or ($runs|ConvertTo-Json -Compress) -cne ($passes|ConvertTo-Json -Compress) -or $roots.Count -ne 2 -or $passes.Count -ne 20){throw 'Message native test evidence mismatch'}
    $taskPaths=@('backend/internal/systembackupevidence/relay_message.go','backend/internal/systembackupevidence/relay_message_test.go','backend/internal/systembackupevidence/relay_peer.go','backend/internal/systembackupevidence/relay_peer_test.go','backend/internal/systembackupevidence/relay_dispatch.go','backend/internal/systembackupevidence/relay_dispatch_test.go','backend/internal/systembackup/publicadapter/relay.go','backend/internal/systembackupdispatch/contract.go')
    $taskPins=@(foreach($path in $taskPaths){
        $pin=@($taskR.files|Where-Object {$_.path.Replace('\','/') -ceq $path})
        $sha=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if($pin.Count -ne 1 -or $pin[0].sha256 -cne $sha){throw ('Message boundary input changed: '+$path)}
        [ordered]@{path=$path;sha256=$sha}
    })
    $taskFirstID='ab6b39462dd14f6a9152649c4a6866b4'
    $taskFirstPath='docs/evidence/a-relay-message-native-'+$taskFirstID+'.json'
    $taskFirst=Get-Content -LiteralPath $taskFirstPath -Raw|ConvertFrom-Json
    if($taskFirst.tests_started -or -not $taskFirst.cleanup){throw 'First snapshot drift round unresolved'}
    foreach($id in @($taskID,$taskFirstID)){
        if(Test-Path -LiteralPath ('.tmp-a-relay-message-'+$id)){throw 'Message validation owner remains'}
    }
    $taskPeerPath='docs/evidence/d-a-relay-message-source-review-20261028.json'
    $taskPeer=Get-Content -LiteralPath $taskPeerPath -Raw|ConvertFrom-Json
    if($taskPeer.reviewer -cne 'D' -or $taskPeer.status -ne 'accepted_with_existing_boundaries' -or @($taskPeer.files).Count -ne 2){throw 'Independent source review incomplete'}
    foreach($pin in $taskPeer.files){
        if((Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Independent source review byte mismatch'}
    }
    $taskReport=[ordered]@{
        kind='a_relay_message_validation.v1';date='2026-10-28';status='passed_for_exact_snapshot'
        native_receipt=$taskPrefix+'.json';native_exit=0;native_roots=2;native_pass_events=20;fail_skip=0
        native_log_sha256=(Get-FileHash -LiteralPath ($taskPrefix+'.native.jsonl') -Algorithm SHA256).Hash.ToLowerInvariant()
        linux_compile_exit=0;linux_binary=$taskR.linux_evidence_binary
        boundary_inputs=$taskPins;current_boundary_inputs_match_snapshot=$true;whole_current_checkout_tested=$false;frozen_source_postcheck_performed=$false
        workspace_changed_since_snapshot=$taskR.changed_since_snapshot;workspace_source_paths_changed=$taskR.source_paths_changed
        initial_snapshot_drift_receipt=$taskFirstPath;initial_round_tests_started=$false
        independent_source_review=$taskPeerPath;independent_source_review_bytes_match=$true
        cleanup=$true;two_owner_directories_absent=$true;dependencies_installed=$false;actual_SQL=$false;production_approved=$false;field_slots_closed=0
    }
    $taskReport|ConvertTo-Json -Depth 10|Set-Content -LiteralPath 'docs/evidence/a-relay-message-validation-20261028.json' -Encoding utf8
    Write-Output 'Message adapter: 2 roots / 20 passes, Linux compiled, boundary pins match, cleanup'
} finally {Pop-Location}
