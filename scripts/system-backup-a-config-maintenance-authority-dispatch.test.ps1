$ErrorActionPreference='Stop'
$authorityDispatchTokens=$null;$authorityDispatchErrors=$null
$authorityDispatchScript=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$authorityDispatchAST=[Management.Automation.Language.Parser]::ParseFile($authorityDispatchScript,[ref]$authorityDispatchTokens,[ref]$authorityDispatchErrors)
if($authorityDispatchErrors.Count){throw 'Authority harness parse errors'}
function Get-AuthorityDispatchAssignment([string]$Name){
    $authorityNodes=@($authorityDispatchAST.FindAll({param($node)$node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -ceq ('$'+$Name)},$true))
    if($authorityNodes.Count -ne 1){throw ('Ambiguous authority assignment: '+$Name)}
    [scriptblock]::Create($authorityNodes[0].Extent.Text)
}
$ConfigWriterOnly=$true;$ConfigProofOnly=$true;$ConfigMaintenanceReceiptOnly=$true;$ConfigMaintenanceAuthorityOnly=$true
$ConfigBackfillServiceOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
$evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
$archiveHash='a'*64;$digest='b'*64;$evidenceMigrationHash='c'*64;$evidenceBinaryHash='d'*64;$evidenceDDLHash='e'*64
$evidenceHTTPHash='';$evidenceIndexHash='';$evidenceIndexDDLHash='';$evidenceCandidateHash=''
$evidenceIndexFlag='0';$evidenceCandidateFlag='0';$recoveryOnlyFlag='0';$RecoveryTest='D';$AdminReadIndexVariant='all'
foreach($authorityName in @('invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight','evidenceProbeName','evidencePhaseSource','evidenceProfile','configProofSeedPattern')){. (Get-AuthorityDispatchAssignment $authorityName)}
if($evidenceProbeName -cne 'a-config-maintenance-authority.test' -or $evidencePhaseSource -cne 'scripts/system-backup-a-config-maintenance-authority-phase.sh' -or $evidenceProfile -cne 'a-config-maintenance-authority' -or $configProofSeedPattern -cne '^Test(DConfigMaintenanceReceiptMySQLSeed|AConfigWriterSecurityClockSeed|AConfigMaintenanceAuthorityMySQLSeed)$'){throw 'Authority profile selected wrong payload/seed/phase'}
$authorityCommandNodes=@($authorityDispatchAST.FindAll({param($node)$node -is [Management.Automation.Language.ExpandableStringExpressionAst] -and $node.Extent.Text.Contains('tar -xf bundle.tar;') -and $node.Extent.Text.Contains('KUBE_CONTEXT=')},$true))
if($authorityCommandNodes.Count -ne 1){throw 'Ambiguous authority remote command'}
$authorityCommand=. ([scriptblock]::Create($authorityCommandNodes[0].Extent.Text))
foreach($authorityPart in @("; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE=",' D_DB_INVARIANT_SMOKE=1 ',' D_PROVIDER_REGISTRATION_SMOKE=1 ',' A_BUSINESS_HISTORY_SMOKE=0 ',' A_BUSINESS_RESTORE_SMOKE=0 ',"D_INVARIANT_BINARY='$evidenceRemote/a-config-maintenance-authority.test'","D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash'","D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash'",' D_CONFIG_CANDIDATE=0 ',' D_ADMIN_INDEX_CANDIDATE=0 ')){if(-not $authorityCommand.Contains($authorityPart)){throw ('Authority dispatch binding lost: '+$authorityPart)}}
if([regex]::Matches($authorityCommand,'bash -n ').Count -ne 3 -or -not $authorityCommand.EndsWith(' bash scripts/system-backup-fresh-migration-smoke.sh')){throw 'Authority preflight/fresh-catalog dispatch changed'}
$authorityPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-config-maintenance-authority-phase.sh'))
if(-not $authorityPhase.Contains('-test.run "^TestAConfigMaintenanceAuthorityMySQL$"') -or $authorityPhase.Contains('TestDConfigCanonicalBackfillMySQL') -or $authorityPhase.Contains('TestDConfigWriterMySQL') -or -not $authorityPhase.Contains('actual_authentication=no production_approval=no')){throw 'Authority phase lost exclusive root/synthetic authentication marker'}
foreach($authorityInvalid in @(@{ConfigMaintenanceAuthorityOnly=$true},@{ConfigMaintenanceAuthorityOnly=$true;ConfigWriterOnly=$true},@{ConfigMaintenanceAuthorityOnly=$true;ConfigWriterOnly=$true;ConfigMaintenanceReceiptOnly=$true;ConfigBackfillServiceOnly=$true},@{ConfigMaintenanceAuthorityOnly=$true;ConfigWriterOnly=$true;ConfigMaintenanceReceiptOnly=$true;ConfigWriterSecurityOnly=$true})){
    $authorityRejected=$false
    try{& $authorityDispatchScript @authorityInvalid}catch{if($_.Exception.Message -match 'ConfigMaintenanceAuthorityOnly requires its exclusive maintenance authority profile|ConfigMaintenanceReceiptOnly requires the separate config writer validation profile'){$authorityRejected=$true}else{throw}}
    if(-not $authorityRejected){throw 'Unbound/mixed authority profile accepted'}
}
Write-Output 'PASS A maintenance authority dispatch: exclusive root, exact payload/seed/phase, fixed hashes, full catalog and early mixed-profile rejection; no remote actions or build artifacts'
