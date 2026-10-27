$ErrorActionPreference='Stop'
$ownerTokens=$null;$ownerErrors=$null
$ownerHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$ownerAST=[Management.Automation.Language.Parser]::ParseFile($ownerHarness,[ref]$ownerTokens,[ref]$ownerErrors)
if($ownerErrors.Count){throw 'Owner harness parse errors'}
$ConfigDownloadOwnersOnly=$true;$ConfigDownloadAdmissionOnly=$true;$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
$ConfigNonceTimeOnly=$false;$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
foreach($ownerName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight','downloadEvidenceTestTimeout')){
    $ownerNodes=@($ownerAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$ownerName)},$true))
    if($ownerName -eq 'evidenceProbePackage'){$ownerNodes=@($ownerNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($ownerNodes.Count -ne 1){throw ('Ambiguous owner assignment '+$ownerName)}
    . ([scriptblock]::Create($ownerNodes[0].Extent.Text))
}
if($evidenceProbeName -ne 'a-download-owners.test' -or $evidenceProbePackage -ne './internal/systembackupevidence' -or $evidencePhaseSource -ne 'scripts/system-backup-a-download-owners-phase.sh' -or $evidenceProfile -ne 'a-download-owners' -or $configProofSeedPattern -ne '^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'){throw 'SQL owner profile lost exclusive root/seed/phase binding'}
if($downloadEvidenceTestTimeout -ne '2700s'){throw 'Owner full-package framework budget lost'}
$ownerBudget=@($ownerAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq '$downloadEvidenceTestTimeout'},$true))
if($ownerBudget.Count -ne 1){throw 'Ambiguous owner framework budget'}
$ConfigDownloadOwnersOnly=$false
. ([scriptblock]::Create($ownerBudget[0].Extent.Text))
if($downloadEvidenceTestTimeout -ne '900s'){throw 'Other download profile framework budget changed'}
$ConfigDownloadOwnersOnly=$true
. ([scriptblock]::Create($ownerBudget[0].Extent.Text))
$ownerFullGate=@($ownerAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.Extent.Text.Contains('Invoke-AEvidenceGoStep') -and $n.Extent.Text.Contains('$downloadEvidenceTestTimeout')},$true))
if($ownerFullGate.Count -ne 1 -or -not $ownerFullGate[0].Extent.Text.Contains('./internal/systembackupsecurity') -or -not $ownerFullGate[0].Extent.Text.Contains('./internal/systembackupevidence') -or $ownerFullGate[0].Extent.Text.Contains('-vet=off') -or $ownerFullGate[0].Extent.Text.Contains("'-run'")){throw 'Owner budget changed the full default-vet gate'}
if($invariantFlag -ne '1' -or $businessFlag -ne '0' -or $businessRestoreFlag -ne '0' -or [regex]::Matches($evidenceBashPreflight,'bash -n ').Count -ne 3){throw 'SQL owner full-catalog/preflight isolation changed'}
$ownerPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-download-owners-phase.sh'))
foreach($ownerPart in @('-test.run "^TestASQLTaskDownloadOwnersMySQL$"','new_cases=11','owner_adapter=SQLTaskDownloadOwners','production_tasks=no','D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','trap','rm -f /tmp/a-download-owners.test /tmp/a-download-owners-inputs.json')){if(-not $ownerPhase.Contains($ownerPart)){throw ('Owner phase lost '+$ownerPart)}}
if($ownerPhase.Contains('TestADownloadAdmissionMySQL') -or $ownerPhase.Contains('TestDDownloadResultRetentionMySQL') -or $ownerPhase.Contains('TestASensitiveDownloadMFAMySQL$')){throw 'SQL owner phase repeats accepted remote suites'}
foreach($ownerMixed in @(@{},@{ConfigWriterOnly=$true;ConfigDownloadAdmissionOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadMFAOnly=$true},@{ConfigWriterOnly=$true;ConfigNonceTimeOnly=$true},@{ConfigWriterOnly=$true;ConfigWriterSecurityOnly=$true})){
    $ownerRejected=$false
    try{& $ownerHarness -ConfigDownloadOwnersOnly @ownerMixed}catch{if($_.Exception.Message -match 'ConfigDownloadOwnersOnly requires its exclusive'){$ownerRejected=$true}else{throw}}
    if(-not $ownerRejected){throw 'Mixed SQL owner profile accepted'}
}
Write-Output 'PASS download-owners-dispatch: exclusive actual task-owner root, three detached seeds, full catalog, UID/payload pins and exact cleanup; accepted suites not rerun'
