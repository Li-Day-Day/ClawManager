$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskID='e2381802c9954132ada5e8a531ceab28'
$taskNative='docs/evidence/a-relay-peer-native-'+$taskID
$taskRecovery='docs/evidence/a-relay-peer-recovery-'+$taskID
$taskRun=Get-Content -LiteralPath (Join-Path $taskRoot ($taskNative+'.running.json')) -Raw|ConvertFrom-Json
$taskRecovered=Get-Content -LiteralPath (Join-Path $taskRoot ($taskRecovery+'.json')) -Raw|ConvertFrom-Json
if($taskRun.native_exit -ne 0 -or $taskRecovered.status -ne 'native_log_complete_linux_compiled' -or $taskRecovered.linux_exit -ne 0 -or -not $taskRecovered.cleanup -or -not $taskRecovered.frozen_source_postcheck){throw 'Incomplete validation/cleanup'}
$taskFrozen=@{};foreach($pin in $taskRecovered.frozen_files){$taskFrozen[$pin.path.Replace('\','/')]=$pin.sha256}
$taskMismatch=@($taskRun.files|Where-Object {$taskFrozen[$_.path.Replace('\','/')] -cne $_.sha256}|ForEach-Object path)
if($taskMismatch.Count){throw 'Recovery input differs from the original frozen input'}
$taskEvents=@(Get-Content -LiteralPath (Join-Path $taskRoot ($taskNative+'.native.jsonl'))|ForEach-Object {$_|ConvertFrom-Json})
$taskRuns=@($taskEvents|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object Test|Sort-Object)
$taskPasses=@($taskEvents|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object Test|Sort-Object)
if(($taskRuns|ConvertTo-Json -Compress) -cne ($taskPasses|ConvertTo-Json -Compress) -or @($taskEvents|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count){throw 'Native event mismatch'}
$taskA=@('relay_peer.go','relay_peer_test.go','relay_dispatch.go','relay_dispatch_test.go')|ForEach-Object {
    $relative='backend/internal/systembackupevidence/'+$_
    $sha=(Get-FileHash -LiteralPath (Join-Path $taskRoot $relative) -Algorithm SHA256).Hash.ToLowerInvariant()
    if($sha -cne $taskFrozen[$relative]){throw 'Current A source differs from tested source'}
    [ordered]@{path=$relative;sha256=$sha}
}
$taskDrift=@($taskRun.files|Where-Object {$_.path -notmatch '/\.tmp-'}|ForEach-Object {
    $path=Join-Path $taskRoot $_.path
    if(-not(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $_.sha256){$_.path}
})
$taskOwner=Join-Path $taskRoot ('.tmp-a-relay-peer-'+$taskID)
if(Test-Path -LiteralPath $taskOwner){throw 'Owner still exists'}
$taskReceipt=[ordered]@{
    kind='a_dispatch_relay_validation.v1';date='2026-10-28';status='passed_for_frozen_inputs'
    native_exit=$taskRun.native_exit;native_roots=@($taskPasses|Where-Object {$_ -notmatch '/'}).Count;native_pass_events=$taskPasses.Count;native_fail_skip=0
    native_log=$taskNative+'.native.jsonl';native_log_sha256=(Get-FileHash -LiteralPath (Join-Path $taskRoot ($taskNative+'.native.jsonl')) -Algorithm SHA256).Hash.ToLowerInvariant()
    original_linux_exit=$taskRun.linux_evidence_exit;original_linux_log=$taskNative+'.linux_evidence.jsonl';original_driver_final_exit_known=$false
    recovery=$taskRecovery+'.json';recovery_linux_exit=$taskRecovered.linux_exit;linux_binary=$taskRecovered.linux_binary
    same_frozen_inputs=$true;frozen_source_postcheck=$true;current_A_matches_snapshot=$true;A_sources=@($taskA)
    changed_workspace_paths=$taskDrift;whole_current_checkout_tested=$false
    dependencies_installed=$false;actual_SQL=$false;production_authorized=$false;field_slots_closed=0;cleanup=$true
}
$taskOutput=Join-Path $taskRoot 'docs/evidence/a-dispatch-relay-validation-20261028.json'
$taskReceipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $taskOutput -Encoding utf8
Write-Output $taskOutput
