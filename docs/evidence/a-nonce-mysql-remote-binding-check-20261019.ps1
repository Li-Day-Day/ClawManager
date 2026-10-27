$ErrorActionPreference='Stop'
# Evaluate only AST string/assignment expressions; never execute the SSH call.
$aRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$aHarness=Join-Path $aRoot 'scripts/system-backup-a-evidence-validation.ps1'
$aTokens=$null;$aErrors=$null
$aAST=[Management.Automation.Language.Parser]::ParseFile($aHarness,[ref]$aTokens,[ref]$aErrors)
if($aErrors.Count){throw 'Nonce harness parse errors'}
$ConfigNonceTimeOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
$evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
$archiveHash='a'*64;$digest='b'*64;$evidenceMigrationHash='c'*64;$evidenceBinaryHash='d'*64;$evidenceDDLHash='e'*64
$evidenceHTTPHash='';$evidenceIndexHash='';$evidenceIndexDDLHash='';$evidenceCandidateHash=''
$evidenceIndexFlag='0';$evidenceCandidateFlag='0';$recoveryOnlyFlag='0';$RecoveryTest='D';$AdminReadIndexVariant='all'
foreach($aName in @('evidenceProbeName','evidenceProfile','evidencePhaseSource','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight')){
    $aNodes=@($aAST.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$aName)},$true))
    if($aNodes.Count -ne 1){throw ('Ambiguous binding '+$aName)}
    . ([scriptblock]::Create($aNodes[0].Extent.Text))
}
$aCommands=@($aAST.FindAll({param($n) $n -is [Management.Automation.Language.ExpandableStringExpressionAst] -and $n.Extent.Text.Contains('tar -xf bundle.tar;') -and $n.Extent.Text.Contains('KUBE_CONTEXT=')},$true))
if($aCommands.Count -ne 1){throw 'Ambiguous actual SSH expression'}
$aCommand=. ([scriptblock]::Create($aCommands[0].Extent.Text))
$aRequired=@(
    "; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system'",
    ' D_DB_INVARIANT_SMOKE=1 ', ' D_PROVIDER_REGISTRATION_SMOKE=1 ', ' A_BUSINESS_HISTORY_SMOKE=0 ', ' A_BUSINESS_RESTORE_SMOKE=0 ',
    "D_MIGRATION_BINARY='$evidenceRemote/system-backup-migrate'", "D_MIGRATION_BINARY_SHA256='$evidenceMigrationHash'",
    "D_INVARIANT_BINARY='$evidenceRemote/d-config-writer.test'", "D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash'",
    "D_PROVIDER_REGISTRATION_DDL='$evidenceRemote/d-provider-registration.sql'", "D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash'",
    ' D_CONFIG_CANDIDATE=0 ', ' D_ADMIN_INDEX_CANDIDATE=0 '
)
foreach($aPart in $aRequired){if(-not $aCommand.Contains($aPart)){throw ('Missing actual nonce command binding '+$aPart)}}
if([regex]::Matches($aCommand,'bash -n ').Count -ne 3 -or -not $aCommand.EndsWith(' bash scripts/system-backup-fresh-migration-smoke.sh')){throw 'Nonce shell preflight/dispatch differs'}
if($evidenceProfile -ne 'a-nonce-acceptance' -or $evidencePhaseSource -ne 'scripts/system-backup-a-nonce-acceptance-phase.sh' -or $configProofSeedPattern -ne '^Test(DConfigWriterMySQLSeed|ANonceAcceptanceMySQLSeed)$'){throw 'Nonce selected wrong payload profile'}
$aText=[IO.File]::ReadAllText($aHarness)
if(-not $aText.Contains('$evidencePhaseSource } else { $file }') -or -not $aText.Contains("`$file -eq 'scripts/system-backup-d-provider-registration-phase.sh'")){throw 'Selected nonce phase is not packaged at actual dispatch path'}
Write-Output ('PASS actual nonce SSH-expression binding: '+$aRequired.Count+' command pins plus exact phase/seed/full-catalog/preflight packaging; no SSH, MySQL or build executed')
