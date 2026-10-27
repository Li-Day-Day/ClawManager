param([switch]$SecurityOnly,[switch]$MaintenanceReceiptsOnly,[switch]$BackfillServiceOnly)
$ErrorActionPreference='Stop'
# Inspect/evaluate the actual harness expressions without invoking Go/SSH/bash.
$writerTokens=$null; $writerErrors=$null
$writerScript=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$writerAST=[Management.Automation.Language.Parser]::ParseFile($writerScript,[ref]$writerTokens,[ref]$writerErrors)
if($writerErrors.Count){throw 'Writer harness parse errors'}
function Get-WriterAssignment([string]$Name) {
    $writerNodes=@($writerAST.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -ceq ('$'+$Name)},$true))
    if($writerNodes.Count -ne 1){throw "Ambiguous writer assignment: $Name"}
    return [scriptblock]::Create($writerNodes[0].Extent.Text)
}
$ConfigWriterOnly=$true; $ConfigProofOnly=$true
$ConfigWriterSecurityOnly=[bool]$SecurityOnly
$ConfigMaintenanceReceiptOnly=[bool]($MaintenanceReceiptsOnly -or $BackfillServiceOnly)
$ConfigBackfillServiceOnly=[bool]$BackfillServiceOnly
$ConfigMaintenanceAuthorityOnly=$false
$BusinessHistoryOnly=$false; $BusinessRestoreOnly=$false; $AdminReadOnly=$false; $AdminReadIndexCandidate=$false
$ProducerService=$false; $ProducerRecoveryOnly=$false; $LoginStateOnly=$false; $LoginSessionsOnly=$false
$evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
$archiveHash='a'*64; $digest='b'*64; $evidenceMigrationHash='c'*64; $evidenceBinaryHash='d'*64; $evidenceDDLHash='e'*64
$evidenceHTTPHash='';$evidenceIndexHash='';$evidenceIndexDDLHash='';$evidenceCandidateHash=''
$evidenceIndexFlag='0';$evidenceCandidateFlag='0';$recoveryOnlyFlag='0';$RecoveryTest='D';$AdminReadIndexVariant='all'
foreach($name in @('invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight','evidenceProbeName','evidencePhaseSource','evidenceProfile','configProofSeedPattern')){. (Get-WriterAssignment $name)}
$writerExpectedPhase=if($BackfillServiceOnly){'scripts/system-backup-d-config-canonical-backfill-phase.sh'}elseif($MaintenanceReceiptsOnly){'scripts/system-backup-d-config-maintenance-receipt-phase.sh'}elseif($SecurityOnly){'scripts/system-backup-a-config-writer-security-phase.sh'}else{'scripts/system-backup-d-config-writer-phase.sh'}
$writerExpectedProfile=if($BackfillServiceOnly){'d-config-canonical-backfill'}elseif($MaintenanceReceiptsOnly){'d-config-maintenance-receipt'}elseif($SecurityOnly){'a-config-writer-security'}else{'d-config-writer'}
$writerExpectedBinary=if($BackfillServiceOnly){'d-config-canonical-backfill.test'}elseif($MaintenanceReceiptsOnly){'d-config-maintenance-receipt.test'}else{'d-config-writer.test'}
$writerExpectedSeed=if($MaintenanceReceiptsOnly -or $BackfillServiceOnly){'^TestDConfigMaintenanceReceiptMySQLSeed$'}else{'^Test(DConfigWriterMySQLSeed|AConfigWriterSecurityClockSeed)$'}
if($evidenceProbeName -cne $writerExpectedBinary -or $evidencePhaseSource -cne $writerExpectedPhase -or $evidenceProfile -cne $writerExpectedProfile -or $configProofSeedPattern -cne $writerExpectedSeed){throw 'Writer profile selects incorrect payload or seed'}
$writerCommands=@($writerAST.FindAll({param($node) $node -is [Management.Automation.Language.ExpandableStringExpressionAst] -and $node.Extent.Text.Contains('tar -xf bundle.tar;') -and $node.Extent.Text.Contains('KUBE_CONTEXT=')},$true))
if($writerCommands.Count -ne 1){throw 'Ambiguous writer remote command'}
$writerCommand=. ([scriptblock]::Create($writerCommands[0].Extent.Text))
foreach($part in @("; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE=",' D_DB_INVARIANT_SMOKE=1 ',' D_PROVIDER_REGISTRATION_SMOKE=1 ',' A_BUSINESS_HISTORY_SMOKE=0 ',' A_BUSINESS_RESTORE_SMOKE=0 ',"D_INVARIANT_BINARY='$evidenceRemote/$writerExpectedBinary'","D_INVARIANT_BINARY_SHA256='$evidenceBinaryHash'","D_PROVIDER_REGISTRATION_DDL_SHA256='$evidenceDDLHash'",' D_CONFIG_CANDIDATE=0 ',' D_ADMIN_INDEX_CANDIDATE=0 ')){if(-not $writerCommand.Contains($part)){throw ('Writer dispatch binding lost: '+$part)}}
if(@([regex]::Matches($writerCommand,'bash -n ')).Count -ne 3 -or -not $writerCommand.EndsWith(' bash scripts/system-backup-fresh-migration-smoke.sh')){throw 'Writer shell preflight/dispatch changed'}
$writerPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot ('../'+$writerExpectedPhase)))
$writerExpectedPattern=if($BackfillServiceOnly){'-test.run "^TestDConfigCanonicalBackfillMySQL$"'}elseif($MaintenanceReceiptsOnly){'-test.run "^TestDConfigMaintenanceReceiptMySQL$"'}elseif($SecurityOnly){'-test.run "^TestDConfigWriterMySQL$/^a_security$"'}else{'-test.run "^TestDConfigWriterMySQL$"'}
if(-not $writerPhase.Contains($writerExpectedPattern) -or $writerPhase.Contains('TestAConfigProofMySQL') -or -not $writerPhase.Contains('production_approval=no')){throw 'Writer phase runs wrong tests or loses scope marker'}
$writerGo=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../backend/internal/systembackupsecurity/config_writer_mysql_test.go'))
if(-not $writerGo.Contains('runAConfigWriterSecurityCases(t, ctx, db, cfg, identity)')){throw 'Security subtest is not reachable from the selected MySQL root'}
# Parse and reject invalid profiles before scratch/build/remote calls.
foreach($mixed in @(@{ConfigProofOnly=$true},@{AdminReadOnly=$true},@{LoginStateOnly=$true})){
    $rejected=$false
    try{& $writerScript -ConfigWriterOnly @mixed}catch{if($_.Exception.Message -match 'Choose the config proof|requires its dedicated validation profile'){$rejected=$true}else{throw}}
    if(-not $rejected){throw 'Mixed writer profile accepted'}
}
foreach($invalid in @(@{ConfigMaintenanceReceiptOnly=$true},@{ConfigMaintenanceReceiptOnly=$true;ConfigWriterOnly=$true;ConfigWriterSecurityOnly=$true},@{ConfigBackfillServiceOnly=$true;ConfigWriterOnly=$true})){
    $rejected=$false
    try{& $writerScript @invalid}catch{if($_.Exception.Message -match 'ConfigMaintenanceReceiptOnly requires the separate config writer validation profile|ConfigBackfillServiceOnly requires the maintenance validation profile'){$rejected=$true}else{throw}}
    if(-not $rejected){throw 'Mixed maintenance storage profile accepted'}
}
Write-Output 'PASS config-writer-dispatch payload/seed/phase/exclusive-profile/hash/full-catalog/preflight; no remote actions or build artifacts'
