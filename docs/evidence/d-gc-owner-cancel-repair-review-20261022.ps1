$ErrorActionPreference='Stop'
$cancelReviewRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
function Assert-CancelReview([bool]$Condition,[string]$Message) {
    if(-not $Condition){throw $Message}
}
function Get-CancelReviewPin([string]$Path) {
    $item=Get-Item -LiteralPath (Join-Path $cancelReviewRoot $Path)
    [ordered]@{path=$Path;size=$item.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()}
}
$cancelOldLogPath='docs/evidence/d-download-gc-owner-lifecycle-remote-20261022-144052-85261cfe.txt'
$cancelOldSourcePath='docs/evidence/d-download-gc-owner-lifecycle-remote-20261022-144052-85261cfe-source.json'
$cancelNewLogPath='docs/evidence/d-gc-owner-cancel-repair-20261022-local.txt'
$cancelNewSourcePath='docs/evidence/d-gc-owner-cancel-repair-20261022-source.json'
$cancelProbePath='backend/internal/systembackupevidence/download_gc_owner_lifecycle_mysql_test.go'
$cancelOldLog=[IO.File]::ReadAllText((Join-Path $cancelReviewRoot $cancelOldLogPath)).Replace("`r",'')
$cancelNewLog=[IO.File]::ReadAllText((Join-Path $cancelReviewRoot $cancelNewLogPath)).Replace("`r",'')
$cancelOldSource=Get-Content -Raw -LiteralPath (Join-Path $cancelReviewRoot $cancelOldSourcePath) | ConvertFrom-Json
$cancelNewSource=Get-Content -Raw -LiteralPath (Join-Path $cancelReviewRoot $cancelNewSourcePath) | ConvertFrom-Json
$cancelOldPasses=@([regex]::Matches($cancelOldLog,'(?m)^\s*--- PASS: TestDDownloadGCOwnerLifecycleMySQL/([^ \n]+)') | ForEach-Object {$_.Groups[1].Value})
$cancelOldFailures=@([regex]::Matches($cancelOldLog,'(?m)^\s*--- FAIL: TestDDownloadGCOwnerLifecycleMySQL/([^ \n]+)') | ForEach-Object {$_.Groups[1].Value})
$cancelPrerequisitePasses=[regex]::Matches($cancelOldLog,'(?m)^\s*--- PASS: TestDDownloadGCFreezeMySQL/[^\n]+').Count
Assert-CancelReview ($cancelPrerequisitePasses -eq 34 -and $cancelOldPasses.Count -eq 7 -and $cancelOldFailures.Count -eq 1 -and $cancelOldFailures[0] -ceq 'canceled_holder') 'Original 34+7/one-failure result changed'
Assert-CancelReview ($cancelOldLog -match '(?m)^--- FAIL: TestDDownloadGCOwnerLifecycleMySQL ' -and $cancelOldLog -match '(?m)^download_gc_owner_lifecycle_exit=1$') 'Original parent/exit failure missing'
Assert-CancelReview (-not $cancelOldLog.Contains('PASS d-download-gc-freeze-mysql binary_sha256=')) 'Original failed phase unexpectedly has final success'
Assert-CancelReview ($cancelOldLog.Contains('CLEANUP_PENDING owner lifecycle connection=68 thread=417')) 'Original pending identity missing'
$cancelNamespace='sbk-mig-261022070931-3083';$cancelUID='6ba6fa1c-b4ab-4311-adbf-c89ff147479b'
Assert-CancelReview ($cancelOldLog.Contains('CLEANED namespace='+$cancelNamespace+' uid='+$cancelUID)) 'Original namespace cleanup report missing'
foreach($cancelMarker in @('CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True')){
    Assert-CancelReview ($cancelOldLog.Contains($cancelMarker)) ('Original cleanup report missing: '+$cancelMarker)
}
$cancelPriorPreparation=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-preparation-20261022-r2.json') | ConvertFrom-Json
$cancelPriorProbe=$cancelPriorPreparation.changed_files | Where-Object path -CEQ $cancelProbePath
$cancelHash=[Security.Cryptography.SHA256]::Create()
try{$cancelPriorHash=([BitConverter]::ToString($cancelHash.ComputeHash([Convert]::FromBase64String($cancelPriorProbe.tested_bytes_base64)))).Replace('-','').ToLowerInvariant()}finally{$cancelHash.Dispose()}
$cancelOldProbePin=$cancelOldSource.files | Where-Object path -CEQ $cancelProbePath
Assert-CancelReview ($cancelPriorHash -ceq $cancelOldProbePin.sha256) 'Archived previous probe does not match operator source'
foreach($cancelMarker in @('LOCAL_PASS config-standalone-seed=yes','LOCAL_PASS d-download-gc-freeze-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run','LOCAL_PASS pinned-migration-runner-compiled=yes','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False')){
    Assert-CancelReview ($cancelNewLog.Contains($cancelMarker)) ('Local validation marker missing: '+$cancelMarker)
}
Assert-CancelReview ($cancelNewLog -match '(?m)^local_validation_exit=0$') 'Local gate did not exit zero'
Assert-CancelReview ($cancelNewLog -notmatch '(?m)^\s*--- FAIL:|^panic:|^fatal error:|^RUN namespace=') 'Local gate failed or executed a remote fixture'
$cancelSections=@([regex]::Matches($cancelNewLog,'(?ms)(.*?)^ok[ \t]+(clawreef/[^ \t\n]+)[ \t]+([0-9.]+)s[ \t]*$') | ForEach-Object {
    [ordered]@{package=$_.Groups[2].Value;seconds=$_.Groups[3].Value;roots=[regex]::Matches($_.Groups[1].Value,'(?m)^--- PASS: ').Count;pass_events=[regex]::Matches($_.Groups[1].Value,'(?m)^[ \t]*--- PASS: ').Count}
})
Assert-CancelReview ($cancelSections.Count -ge 3 -and $cancelSections[0].package -ceq 'clawreef/internal/systembackupsecurity' -and $cancelSections[1].package -ceq 'clawreef/internal/systembackupevidence' -and $cancelSections[2].roots -eq 2) 'Complete packages and tagged seed summaries missing'
. (Join-Path $cancelReviewRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
Assert-CancelReview ((Get-DIndexPinDigest -Pins $cancelOldSource.files) -ceq $cancelOldSource.source_sha256) 'Original manifest digest invalid'
Assert-CancelReview ((Get-DIndexPinDigest -Pins $cancelNewSource.files) -ceq $cancelNewSource.source_sha256) 'Local manifest digest invalid'
$cancelCriticalPaths=@($cancelProbePath,'backend/internal/systembackupevidence/download_gc_owner_lifecycle_wire_test.go','backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go','backend/internal/systembackupevidence/download_retention_gc_connection.go','backend/internal/systembackupevidence/download_retention_gc_connection_test.go','scripts/system-backup-d-download-gc-freeze-phase.sh','scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1','backend/go.mod','backend/go.sum')
$cancelCriticalPins=@(foreach($cancelCritical in $cancelCriticalPaths){
    $cancelPin=Get-CancelReviewPin $cancelCritical
    $cancelFrozen=@($cancelNewSource.files | Where-Object path -CEQ $cancelCritical)
    Assert-CancelReview ($cancelFrozen.Count -eq 1 -and $cancelFrozen[0].sha256 -ceq $cancelPin.sha256) ('Current critical input differs from tested source: '+$cancelCritical)
    $cancelPin
})
$cancelOwners=@(foreach($cancelLog in @($cancelOldLog,$cancelNewLog)){
    $cancelOwnerMatch=[regex]::Match($cancelLog,'(?m)^LOCAL_OWNER config-writer-source=([^\n]+)$')
    Assert-CancelReview $cancelOwnerMatch.Success 'Exact local owner missing'
    $cancelOwner=[IO.Path]::GetFullPath($cancelOwnerMatch.Groups[1].Value)
    Assert-CancelReview ([IO.Path]::GetDirectoryName($cancelOwner) -ceq $cancelReviewRoot -and [IO.Path]::GetFileName($cancelOwner) -match '^\.tmp-d-index-cache-[a-f0-9]{32}$') 'Local owner outside workspace'
    Assert-CancelReview (-not(Test-Path -LiteralPath $cancelOwner)) ('Local owner remains: '+$cancelOwner)
    Assert-CancelReview ($cancelLog.Contains('LOCAL_CLEANUP config-writer-source-owned='+$cancelOwner+' removed=True')) 'Exact local cleanup report missing'
    [ordered]@{owner=$cancelOwner;absent_verified=$true;reported_removed=$true}
})
$cancelReceipt=[ordered]@{
    kind='d_gc_owner_cancel_observation_repair';status='local_gate_passed_cleaned_actual_mysql_pending'
    original=[ordered]@{log=(Get-CancelReviewPin $cancelOldLogPath);source=(Get-CancelReviewPin $cancelOldSourcePath);source_sha256=$cancelOldSource.source_sha256;prerequisite_passed=34;lifecycle_passed=$cancelOldPasses;lifecycle_failed=$cancelOldFailures;exit=1;parent_pass_text_is_not_success=$true;namespace=$cancelNamespace;uid=$cancelUID;pending_connection=68;pending_thread=417;namespace_and_scratch_cleanup_reported=$true;independent_remote_cleanup_check=$false;probe_sha256=$cancelPriorHash}
    repair=[ordered]@{changed_go_files=@($cancelProbePath);production_go_files_changed=$false;client_cancel_budget_seconds=10;cancel_release_observer_budget_seconds=40;other_release_observer_budget_seconds=5;server_sleep_seconds=30;exact_ticket_observation_required=$true;context_canceled_required=$true;parent_pass_requires_no_failed_children=$true;mysql_source='https://github.com/mysql/mysql-server/blob/mysql-8.4.8/sql/item_func.cc#L4899-L4926';server_disconnect_poll_seconds=5;diagnosis='Observed 5.01s failure is consistent with racing the 5s server disconnect poll; no post-cancel server trace was captured in the original run.'}
    local=[ordered]@{log=(Get-CancelReviewPin $cancelNewLogPath);source=(Get-CancelReviewPin $cancelNewSourcePath);source_sha256=$cancelNewSource.source_sha256;source_files=$cancelNewSource.files.Count;package_sections=$cancelSections;exit=0;default_vet=$true;standalone_seed=$true;windows_and_linux_probe_compiled=$true;linux_migration_compiled=$true;frozen_postcheck=$true;current_critical_pins=$cancelCriticalPins;current_whole_tree_tested=$false}
    cleanup=$cancelOwners;dependencies_installed=$false;remote_executed_by_repair=$false;repaired_actual_mysql_executed=$false;freeze_adapter_wired=$false;full_gc_accepted=$false;production_approved=$false
    reviewed_utc=[DateTime]::UtcNow.ToString('o')
}
$cancelReceiptPath=Join-Path $PSScriptRoot 'd-gc-owner-cancel-repair-20261022.json'
Assert-CancelReview (-not(Test-Path -LiteralPath $cancelReceiptPath)) 'Receipt already exists; preserve the previous review'
[IO.File]::WriteAllText($cancelReceiptPath,($cancelReceipt | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
Write-Output ('PASS owner-cancel-repair original=41/42-failed local_exit=0 cleanup=verified actual_mysql=pending receipt='+$cancelReceiptPath)
