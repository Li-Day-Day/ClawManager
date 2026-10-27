$ErrorActionPreference='Stop'
$gcFreezeTokens=$null;$gcFreezeErrors=$null
$gcFreezeHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$gcFreezeAST=[Management.Automation.Language.Parser]::ParseFile($gcFreezeHarness,[ref]$gcFreezeTokens,[ref]$gcFreezeErrors)
if($gcFreezeErrors.Count){throw 'GC freeze harness parse errors'}
$ConfigDownloadGCFreezeOnly=$true;$ConfigDownloadGCTaskOnly=$false;$ConfigDownloadGCRoleOnly=$false;$ConfigDownloadProducerOnly=$false;$ConfigDownloadTaskChainOnly=$false;$ConfigDownloadOwnersOnly=$false;$ConfigDownloadAdmissionOnly=$false
$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
$ConfigNonceTimeOnly=$false;$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false;$AdminReadConfigCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
$evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
$archiveHash='a'*64;$digest='b'*64;$evidenceMigrationHash='c'*64;$evidenceBinaryHash='d'*64;$evidenceDDLHash='e'*64
$evidenceHTTPHash='';$evidenceIndexHash='';$evidenceIndexDDLHash='';$evidenceCandidateHash='';$evidenceIndexFlag='0';$evidenceCandidateFlag='0';$recoveryOnlyFlag='0';$RecoveryTest='D';$AdminReadIndexVariant='all'
foreach($gcFreezeName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight','downloadEvidenceTestTimeout')){
    $gcFreezeNodes=@($gcFreezeAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$gcFreezeName)},$true))
    if($gcFreezeName -eq 'evidenceProbePackage'){$gcFreezeNodes=@($gcFreezeNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($gcFreezeNodes.Count -ne 1){throw ('Ambiguous GC freeze assignment '+$gcFreezeName)}
    . ([scriptblock]::Create($gcFreezeNodes[0].Extent.Text))
}
if($evidenceProbeName -ne 'd-download-gc-freeze.test' -or $evidenceProbePackage -ne './internal/systembackupevidence' -or $evidencePhaseSource -ne 'scripts/system-backup-d-download-gc-freeze-phase.sh' -or $evidenceProfile -ne 'd-download-gc-freeze' -or $configProofSeedPattern -ne '^Test(DDownloadGCFreezeMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'){throw 'GC freeze root/seed/phase binding changed'}
if($invariantFlag -ne '1' -or $businessFlag -ne '0' -or $businessRestoreFlag -ne '0' -or [regex]::Matches($evidenceBashPreflight,'bash -n ').Count -ne 3){throw 'GC freeze full-catalog/preflight isolation changed'}
if($downloadEvidenceTestTimeout -ne '2700s'){throw 'Freeze framework timeout lost'}
$gcFreezeBudget=@($gcFreezeAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq '$downloadEvidenceTestTimeout'},$true))
if($gcFreezeBudget.Count -ne 1){throw 'Ambiguous download framework budget'}
$ConfigDownloadGCFreezeOnly=$false
. ([scriptblock]::Create($gcFreezeBudget[0].Extent.Text))
if($downloadEvidenceTestTimeout -ne '900s'){throw 'Existing download profile framework budget changed'}
$ConfigDownloadGCFreezeOnly=$true
. ([scriptblock]::Create($gcFreezeBudget[0].Extent.Text))
$gcFreezeFullGate=@($gcFreezeAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.Extent.Text.Contains('Invoke-AEvidenceGoStep') -and $n.Extent.Text.Contains('$downloadEvidenceTestTimeout')},$true))
if($gcFreezeFullGate.Count -ne 1 -or -not $gcFreezeFullGate[0].Extent.Text.Contains('./internal/systembackupsecurity') -or -not $gcFreezeFullGate[0].Extent.Text.Contains('./internal/systembackupevidence') -or $gcFreezeFullGate[0].Extent.Text.Contains('-vet=off') -or $gcFreezeFullGate[0].Extent.Text.Contains("'-run'")){throw 'Freeze framework budget weakened the full default-vet gate'}
$gcFreezeCommands=@($gcFreezeAST.FindAll({param($n)$n -is [Management.Automation.Language.ExpandableStringExpressionAst] -and $n.Extent.Text.Contains('tar -xf bundle.tar;') -and $n.Extent.Text.Contains('KUBE_CONTEXT=')},$true))
if($gcFreezeCommands.Count -ne 1){throw 'Ambiguous GC freeze remote command'}
$gcFreezeCommand=. ([scriptblock]::Create($gcFreezeCommands[0].Extent.Text))
foreach($gcFreezePart in @("; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE=",' D_DB_INVARIANT_SMOKE=1 ',' D_PROVIDER_REGISTRATION_SMOKE=1 ',' A_BUSINESS_HISTORY_SMOKE=0 ',' A_BUSINESS_RESTORE_SMOKE=0 ',"D_INVARIANT_BINARY='$evidenceRemote/d-download-gc-freeze.test'","D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash'","D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash'")){if(-not $gcFreezeCommand.Contains($gcFreezePart)){throw ('GC freeze dispatch pin lost: '+$gcFreezePart)}}
$gcFreezePhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-download-gc-freeze-phase.sh'))
foreach($gcFreezePart in @('-test.run "^(TestDDownloadGCFreezeMySQL|TestDDownloadGCOwnerLifecycleMySQL)$"','-test.count=1','new_cases=42','prerequisite_cases=34','lifecycle_cases=8','component=backup-lock-prerequisites-and-owner-lifecycle','scope=synthetic','full_gc=not_run','freeze_adapter=not_wired','role_approval=no','production_approval=no','D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','trap','rm -f /tmp/d-download-gc-freeze.test /tmp/d-download-gc-freeze-inputs.json')){if(-not $gcFreezePhase.Contains($gcFreezePart)){throw ('GC freeze phase lost '+$gcFreezePart)}}
foreach($gcFreezeOld in @('TestDDownloadGCTaskMySQL','TestADownloadGCRoleMySQL','TestDProducerDownloadOwnersMySQL','TestDTaskOwnerDownloadChainMySQL','TestADownloadAdmissionMySQL','TestDDownloadResultRetentionMySQL','TestASensitiveDownloadMFAMySQL','TestASQLTaskDownloadOwnersMySQL')){if($gcFreezePhase.Contains($gcFreezeOld)){throw 'GC freeze profile repeats an earlier remote suite'}}
foreach($gcFreezeFlag in @('ConfigDownloadGCTaskOnly','ConfigDownloadGCRoleOnly','ConfigDownloadProducerOnly','ConfigDownloadTaskChainOnly','ConfigDownloadOwnersOnly','ConfigDownloadAdmissionOnly','ConfigDownloadMFAOnly','ConfigNonceTimeOnly','ConfigWriterSecurityOnly','ConfigMaintenanceReceiptOnly','ConfigBackfillServiceOnly','ConfigMaintenanceAuthorityOnly','BackfillRowGuards','ProducerService','ProducerRecoveryOnly','AdminReadOnly','AdminReadConfigCandidate','AdminReadIndexCandidate','BusinessHistoryOnly','BusinessRestoreOnly','LoginStateOnly','LoginSessionsOnly','IncludeSecurity','IncludeAuth','AuthSourceOnly')){
    $gcFreezeMix=@{ConfigDownloadGCFreezeOnly=$true;ConfigWriterOnly=$true};$gcFreezeMix[$gcFreezeFlag]=$true
    $gcFreezeRejected=$false
    try{& $gcFreezeHarness @gcFreezeMix}catch{if($_.Exception.Message -match 'ConfigDownloadGCFreezeOnly requires its exclusive'){$gcFreezeRejected=$true}else{throw}}
    if(-not $gcFreezeRejected){throw ('Mixed GC freeze harness profile accepted: '+$gcFreezeFlag)}
}
$gcFreezeRejected=$false
try{& $gcFreezeHarness -ConfigDownloadGCFreezeOnly}catch{if($_.Exception.Message -match 'ConfigDownloadGCFreezeOnly requires its exclusive'){$gcFreezeRejected=$true}else{throw}}
if(-not $gcFreezeRejected){throw 'GC freeze harness accepted missing writer plumbing'}
$gcFreezeWrapper=Join-Path $PSScriptRoot 'system-backup-d-config-writer-validation.ps1'
foreach($gcFreezeFlag in @('DownloadGCTaskOnly','DownloadGCRoleOnly','DownloadProducerOnly','DownloadTaskChainOnly','DownloadOwnersOnly','DownloadAdmissionOnly','DownloadMFAOnly','NonceTimeOnly','SecurityOnly','MaintenanceReceiptsOnly','BackfillServiceOnly','BackfillRowGuards')){
    $gcFreezeMix=@{DownloadGCFreezeOnly=$true;SourceManifestPath='not-used.json'};$gcFreezeMix[$gcFreezeFlag]=$true
    $gcFreezeRejected=$false
    try{& $gcFreezeWrapper @gcFreezeMix}catch{if($_.Exception.Message -match 'DownloadGCFreezeOnly requires an exclusive'){$gcFreezeRejected=$true}else{throw}}
    if(-not $gcFreezeRejected){throw ('Mixed GC freeze wrapper profile accepted: '+$gcFreezeFlag)}
}
Write-Output 'PASS download-gc-freeze-dispatch: thirty-four prerequisite and eight owner-lifecycle cases, two seeds, exact package/binary/phase, full catalog/UID/hash pins and cleanup; full GC and role approval excluded; no build or remote'
