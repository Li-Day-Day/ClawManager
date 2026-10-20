$ErrorActionPreference='Stop'
$mfaTokens=$null;$mfaErrors=$null
$mfaHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$mfaAST=[Management.Automation.Language.Parser]::ParseFile($mfaHarness,[ref]$mfaTokens,[ref]$mfaErrors)
if($mfaErrors.Count){throw 'MFA harness parse errors'}
$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true;$ConfigNonceTimeOnly=$false
$ConfigDownloadAdmissionOnly=$true
$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
$evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
$archiveHash='a'*64;$digest='b'*64;$evidenceMigrationHash='c'*64;$evidenceBinaryHash='d'*64;$evidenceDDLHash='e'*64
$evidenceHTTPHash='';$evidenceIndexHash='';$evidenceIndexDDLHash='';$evidenceCandidateHash='';$evidenceIndexFlag='0';$evidenceCandidateFlag='0';$recoveryOnlyFlag='0';$RecoveryTest='D';$AdminReadIndexVariant='all'
foreach($mfaName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight')){
    $mfaNodes=@($mfaAST.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$mfaName)},$true))
    if($mfaName -eq 'evidenceProbePackage'){$mfaNodes=@($mfaNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($mfaNodes.Count -ne 1){throw ('Ambiguous MFA assignment '+$mfaName)}
    . ([scriptblock]::Create($mfaNodes[0].Extent.Text))
}
if($evidenceProbeName -ne 'a-download-admission.test' -or $evidenceProbePackage -ne './internal/systembackupevidence' -or $evidencePhaseSource -ne 'scripts/system-backup-a-download-admission-phase.sh' -or $evidenceProfile -ne 'a-download-admission' -or $configProofSeedPattern -ne '^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'){throw 'MFA profile dispatches wrong package/binary/phase/seed'}
if($invariantFlag -ne '1' -or $businessFlag -ne '0' -or $businessRestoreFlag -ne '0' -or [regex]::Matches($evidenceBashPreflight,'bash -n ').Count -ne 3){throw 'MFA full-catalog/preflight isolation changed'}
$mfaCommands=@($mfaAST.FindAll({param($n)$n -is [Management.Automation.Language.ExpandableStringExpressionAst] -and $n.Extent.Text.Contains('tar -xf bundle.tar;') -and $n.Extent.Text.Contains('KUBE_CONTEXT=')},$true))
if($mfaCommands.Count -ne 1){throw 'Ambiguous MFA remote command'}
$mfaCommand=. ([scriptblock]::Create($mfaCommands[0].Extent.Text))
foreach($mfaPart in @("; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE=",' D_DB_INVARIANT_SMOKE=1 ',' D_PROVIDER_REGISTRATION_SMOKE=1 ',' A_BUSINESS_HISTORY_SMOKE=0 ',' A_BUSINESS_RESTORE_SMOKE=0 ',"D_INVARIANT_BINARY='$evidenceRemote/a-download-admission.test'","D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash'","D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash'")){if(-not $mfaCommand.Contains($mfaPart)){throw ('MFA dispatch pin lost: '+$mfaPart)}}
$mfaPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-download-admission-phase.sh'))
foreach($mfaPart in @('-test.run "^Test(ADownloadAdmissionMySQL|DDownloadResultRetentionMySQL)$"','new_cases=13','result_retention_cases=11','human_mfa=no','production_approval=no','D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','trap','rm -f /tmp/a-download-admission.test /tmp/a-download-admission-inputs.json')){if(-not $mfaPhase.Contains($mfaPart)){throw ('Admission phase lost '+$mfaPart)}}
if($mfaPhase.Contains('TestANonceAcceptanceMySQL') -or $mfaPhase.Contains('TestDConfigWriterMySQL') -or $mfaPhase.Contains('TestAConfigProofMySQL')){throw 'MFA phase repeats old suites'}
foreach($mfaMixed in @(@{},@{ConfigWriterOnly=$true;ConfigDownloadMFAOnly=$true},@{ConfigWriterOnly=$true;ConfigNonceTimeOnly=$true},@{ConfigWriterOnly=$true;ConfigWriterSecurityOnly=$true},@{ConfigWriterOnly=$true;ConfigMaintenanceReceiptOnly=$true},@{ConfigWriterOnly=$true;BackfillRowGuards=$true})){
    $mfaRejected=$false
    try{& $mfaHarness -ConfigDownloadAdmissionOnly @mfaMixed}catch{if($_.Exception.Message -match 'ConfigDownloadAdmissionOnly requires its exclusive'){$mfaRejected=$true}else{throw}}
    if(-not $mfaRejected){throw 'Mixed MFA profile accepted'}
}
Write-Output 'PASS download-admission-dispatch: exact new root/seed/package/phase, binary/input/UID pins, full catalog, preflight, cleanup and exclusive profile; no build or remote'
