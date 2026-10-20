$ErrorActionPreference='Stop'
$chainTokens=$null;$chainErrors=$null
$chainHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$chainAST=[Management.Automation.Language.Parser]::ParseFile($chainHarness,[ref]$chainTokens,[ref]$chainErrors)
if($chainErrors.Count){throw 'Producer owner harness parse errors'}
$ConfigDownloadProducerOnly=$true;$ConfigDownloadTaskChainOnly=$false;$ConfigDownloadOwnersOnly=$false
$ConfigDownloadAdmissionOnly=$true;$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
$ConfigNonceTimeOnly=$false;$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
$evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
$archiveHash='a'*64;$digest='b'*64;$evidenceMigrationHash='c'*64;$evidenceBinaryHash='d'*64;$evidenceDDLHash='e'*64
$evidenceHTTPHash='';$evidenceIndexHash='';$evidenceIndexDDLHash='';$evidenceCandidateHash='';$evidenceIndexFlag='0';$evidenceCandidateFlag='0';$recoveryOnlyFlag='0';$RecoveryTest='D';$AdminReadIndexVariant='all'
foreach($chainName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight')){
    $chainNodes=@($chainAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$chainName)},$true))
    if($chainName -eq 'evidenceProbePackage'){$chainNodes=@($chainNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($chainNodes.Count -ne 1){throw ('Ambiguous producer owner assignment '+$chainName)}
    . ([scriptblock]::Create($chainNodes[0].Extent.Text))
}
if($evidenceProbeName -ne 'd-download-producer-owner.test' -or $evidenceProbePackage -ne './internal/systembackupevidence' -or $evidencePhaseSource -ne 'scripts/system-backup-d-download-producer-phase.sh' -or $evidenceProfile -ne 'd-download-producer-owner' -or $configProofSeedPattern -ne '^Test(DProducerDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'){throw 'Producer owner dispatch lost exact binary/package/phase/three seeds'}
if($invariantFlag -ne '1' -or $businessFlag -ne '0' -or $businessRestoreFlag -ne '0' -or [regex]::Matches($evidenceBashPreflight,'bash -n ').Count -ne 3){throw 'Producer owner full-catalog/preflight isolation changed'}
$producerPayloadNodes=@($chainAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq '$evidenceDDL' -and $n.Extent.Text.Contains('download_producer_probe_inputs.json')},$true))
if($producerPayloadNodes.Count -ne 1){throw 'Producer profile lost its independent input capsule'}
$evidenceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. ([scriptblock]::Create($producerPayloadNodes[0].Extent.Text))
$producerPayload=$evidenceDDL|ConvertFrom-Json
if($producerPayload.kind -ne 'd_download_producer_probe_inputs.v2' -or $producerPayload.admission_sha256 -ne 'c76f218ff8e440707249ec829401514da1def8305a8778fe22a89ea499b54b0f' -or $producerPayload.producer_ddl_sha256 -ne '26e64e491ca677fbd0e53e1d619cb905733adcfb8f0567b7ad47a22ae0a84d1c' -or -not $producerPayload.capability_evidence){throw 'Producer capsule lost original admission, C1 scope or detached content pins'}
$chainCommands=@($chainAST.FindAll({param($n)$n -is [Management.Automation.Language.ExpandableStringExpressionAst] -and $n.Extent.Text.Contains('tar -xf bundle.tar;') -and $n.Extent.Text.Contains('KUBE_CONTEXT=')},$true))
if($chainCommands.Count -ne 1){throw 'Ambiguous producer owner remote command'}
$chainCommand=. ([scriptblock]::Create($chainCommands[0].Extent.Text))
foreach($chainPart in @("; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE=",' D_DB_INVARIANT_SMOKE=1 ',' D_PROVIDER_REGISTRATION_SMOKE=1 ',' A_BUSINESS_HISTORY_SMOKE=0 ',' A_BUSINESS_RESTORE_SMOKE=0 ',"D_INVARIANT_BINARY='$evidenceRemote/d-download-producer-owner.test'","D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash'","D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash'")){if(-not $chainCommand.Contains($chainPart)){throw ('Producer owner dispatch pin lost: '+$chainPart)}}
$chainPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-download-producer-phase.sh'))
foreach($chainPart in @('-test.run "^TestDProducerDownloadOwnersMySQL$"','new_cases=18','owner_adapter=SQLDownloadOwners','provider_transport=synthetic','production_tasks=no','production_approval=no','D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','trap','rm -f /tmp/d-download-producer-owner.test /tmp/d-download-producer-owner-inputs.json')){if(-not $chainPhase.Contains($chainPart)){throw ('Producer owner phase lost '+$chainPart)}}
foreach($chainOld in @('TestDTaskOwnerDownloadChainMySQL','TestADownloadAdmissionMySQL','TestDDownloadResultRetentionMySQL','TestASensitiveDownloadMFAMySQL','TestASQLTaskDownloadOwnersMySQL','TestANonceAcceptanceMySQL','TestDConfigWriterMySQL')){if($chainPhase.Contains($chainOld)){throw 'Producer owner repeats another remote suite'}}
foreach($chainMixed in @(@{},@{ConfigWriterOnly=$true;ConfigDownloadTaskChainOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadOwnersOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadAdmissionOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadMFAOnly=$true},@{ConfigWriterOnly=$true;ConfigNonceTimeOnly=$true},@{ConfigWriterOnly=$true;ConfigWriterSecurityOnly=$true},@{ConfigWriterOnly=$true;ConfigMaintenanceReceiptOnly=$true},@{ConfigWriterOnly=$true;BackfillRowGuards=$true},@{ConfigWriterOnly=$true;ProducerService=$true},@{ConfigWriterOnly=$true;AdminReadOnly=$true},@{ConfigWriterOnly=$true;BusinessRestoreOnly=$true})){
    $chainRejected=$false
    try{& $chainHarness -ConfigDownloadProducerOnly @chainMixed}catch{if($_.Exception.Message -match 'ConfigDownloadProducerOnly requires its exclusive'){$chainRejected=$true}else{throw}}
    if(-not $chainRejected){throw 'Mixed producer owner profile accepted'}
}
Write-Output 'PASS download-task-chain-dispatch: exact eighteen-case root, three seeds, package/binary/phase, catalog/UID/payload pins, cleanup and exclusive profile; no build or remote'
