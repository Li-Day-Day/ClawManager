$ErrorActionPreference='Stop'
$gcTaskTokens=$null;$gcTaskErrors=$null
$gcTaskHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$gcTaskAST=[Management.Automation.Language.Parser]::ParseFile($gcTaskHarness,[ref]$gcTaskTokens,[ref]$gcTaskErrors)
if($gcTaskErrors.Count){throw 'GC task harness parse errors'}
$ConfigDownloadGCTaskOnly=$true;$ConfigDownloadGCRoleOnly=$false;$ConfigDownloadProducerOnly=$false;$ConfigDownloadTaskChainOnly=$false;$ConfigDownloadOwnersOnly=$false;$ConfigDownloadAdmissionOnly=$false
$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
$ConfigNonceTimeOnly=$false;$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false;$AdminReadConfigCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
$evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
$archiveHash='a'*64;$digest='b'*64;$evidenceMigrationHash='c'*64;$evidenceBinaryHash='d'*64;$evidenceDDLHash='e'*64
$evidenceHTTPHash='';$evidenceIndexHash='';$evidenceIndexDDLHash='';$evidenceCandidateHash='';$evidenceIndexFlag='0';$evidenceCandidateFlag='0';$recoveryOnlyFlag='0';$RecoveryTest='D';$AdminReadIndexVariant='all'
foreach($gcTaskName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight')){
    $gcTaskNodes=@($gcTaskAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$gcTaskName)},$true))
    if($gcTaskName -eq 'evidenceProbePackage'){$gcTaskNodes=@($gcTaskNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($gcTaskNodes.Count -ne 1){throw ('Ambiguous GC task assignment '+$gcTaskName)}
    . ([scriptblock]::Create($gcTaskNodes[0].Extent.Text))
}
if($evidenceProbeName -ne 'd-download-gc-task.test' -or $evidenceProbePackage -ne './internal/systembackupevidence' -or $evidencePhaseSource -ne 'scripts/system-backup-d-download-gc-task-phase.sh' -or $evidenceProfile -ne 'd-download-gc-task' -or $configProofSeedPattern -ne '^Test(DDownloadGCTaskMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'){throw 'GC task root/seed/phase binding changed'}
if($invariantFlag -ne '1' -or $businessFlag -ne '0' -or $businessRestoreFlag -ne '0' -or [regex]::Matches($evidenceBashPreflight,'bash -n ').Count -ne 3){throw 'GC task full-catalog/preflight isolation changed'}
$gcTaskCommands=@($gcTaskAST.FindAll({param($n)$n -is [Management.Automation.Language.ExpandableStringExpressionAst] -and $n.Extent.Text.Contains('tar -xf bundle.tar;') -and $n.Extent.Text.Contains('KUBE_CONTEXT=')},$true))
if($gcTaskCommands.Count -ne 1){throw 'Ambiguous GC task remote command'}
$gcTaskCommand=. ([scriptblock]::Create($gcTaskCommands[0].Extent.Text))
foreach($gcTaskPart in @("; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE=",' D_DB_INVARIANT_SMOKE=1 ',' D_PROVIDER_REGISTRATION_SMOKE=1 ',' A_BUSINESS_HISTORY_SMOKE=0 ',' A_BUSINESS_RESTORE_SMOKE=0 ',"D_INVARIANT_BINARY='$evidenceRemote/d-download-gc-task.test'","D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash'","D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash'")){if(-not $gcTaskCommand.Contains($gcTaskPart)){throw ('GC task dispatch pin lost: '+$gcTaskPart)}}
$gcTaskPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-download-gc-task-phase.sh'))
foreach($gcTaskPart in @('-test.run "^TestDDownloadGCTaskMySQL$"','-test.count=1','new_cases=18','component=SQLDownloadGCTaskEligibility','scope=synthetic','full_gc=not_run','role_approval=no','production_approval=no','D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','trap','rm -f /tmp/d-download-gc-task.test /tmp/d-download-gc-task-inputs.json')){if(-not $gcTaskPhase.Contains($gcTaskPart)){throw ('GC task phase lost '+$gcTaskPart)}}
foreach($gcTaskOld in @('TestADownloadGCRoleMySQL','TestDProducerDownloadOwnersMySQL','TestDTaskOwnerDownloadChainMySQL','TestADownloadAdmissionMySQL','TestDDownloadResultRetentionMySQL','TestASensitiveDownloadMFAMySQL','TestASQLTaskDownloadOwnersMySQL')){if($gcTaskPhase.Contains($gcTaskOld)){throw 'GC task profile repeats an earlier remote suite'}}
foreach($gcTaskFlag in @('ConfigDownloadGCRoleOnly','ConfigDownloadProducerOnly','ConfigDownloadTaskChainOnly','ConfigDownloadOwnersOnly','ConfigDownloadAdmissionOnly','ConfigDownloadMFAOnly','ConfigNonceTimeOnly','ConfigWriterSecurityOnly','ConfigMaintenanceReceiptOnly','ConfigBackfillServiceOnly','ConfigMaintenanceAuthorityOnly','BackfillRowGuards','ProducerService','ProducerRecoveryOnly','AdminReadOnly','AdminReadConfigCandidate','AdminReadIndexCandidate','BusinessHistoryOnly','BusinessRestoreOnly','LoginStateOnly','LoginSessionsOnly','IncludeSecurity','IncludeAuth','AuthSourceOnly')){
    $gcTaskMix=@{ConfigDownloadGCTaskOnly=$true;ConfigWriterOnly=$true};$gcTaskMix[$gcTaskFlag]=$true
    $gcTaskRejected=$false
    try{& $gcTaskHarness @gcTaskMix}catch{if($_.Exception.Message -match 'ConfigDownloadGCTaskOnly requires its exclusive'){$gcTaskRejected=$true}else{throw}}
    if(-not $gcTaskRejected){throw ('Mixed GC task harness profile accepted: '+$gcTaskFlag)}
}
$gcTaskRejected=$false
try{& $gcTaskHarness -ConfigDownloadGCTaskOnly}catch{if($_.Exception.Message -match 'ConfigDownloadGCTaskOnly requires its exclusive'){$gcTaskRejected=$true}else{throw}}
if(-not $gcTaskRejected){throw 'GC task harness accepted missing writer plumbing'}
$gcTaskWrapper=Join-Path $PSScriptRoot 'system-backup-d-config-writer-validation.ps1'
foreach($gcTaskFlag in @('DownloadGCRoleOnly','DownloadProducerOnly','DownloadTaskChainOnly','DownloadOwnersOnly','DownloadAdmissionOnly','DownloadMFAOnly','NonceTimeOnly','SecurityOnly','MaintenanceReceiptsOnly','BackfillServiceOnly','BackfillRowGuards')){
    $gcTaskMix=@{DownloadGCTaskOnly=$true;SourceManifestPath='not-used.json'};$gcTaskMix[$gcTaskFlag]=$true
    $gcTaskRejected=$false
    try{& $gcTaskWrapper @gcTaskMix}catch{if($_.Exception.Message -match 'DownloadGCTaskOnly requires an exclusive'){$gcTaskRejected=$true}else{throw}}
    if(-not $gcTaskRejected){throw ('Mixed GC task wrapper profile accepted: '+$gcTaskFlag)}
}
Write-Output 'PASS download-gc-task-dispatch: eighteen component cases, two seeds, exact package/binary/phase, full catalog/UID/hash pins and cleanup; full GC and role approval excluded; no build or remote'
