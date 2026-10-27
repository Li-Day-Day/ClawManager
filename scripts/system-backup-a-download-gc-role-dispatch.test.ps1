$ErrorActionPreference='Stop'
$gcTokens=$null;$gcErrors=$null
$gcHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$gcAST=[Management.Automation.Language.Parser]::ParseFile($gcHarness,[ref]$gcTokens,[ref]$gcErrors)
if($gcErrors.Count){throw 'GC role harness parse errors'}
$ConfigDownloadGCRoleOnly=$true;$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
$ConfigDownloadProducerOnly=$false;$ConfigDownloadTaskChainOnly=$false;$ConfigDownloadOwnersOnly=$false;$ConfigDownloadAdmissionOnly=$false
$ConfigNonceTimeOnly=$false;$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
foreach($gcName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight')){
    $gcNodes=@($gcAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$gcName)},$true))
    if($gcName -eq 'evidenceProbePackage'){$gcNodes=@($gcNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($gcNodes.Count -ne 1){throw ('Ambiguous GC role assignment '+$gcName)}
    . ([scriptblock]::Create($gcNodes[0].Extent.Text))
}
if($evidenceProbeName -ne 'a-download-gc-role.test' -or $evidenceProbePackage -ne './internal/systembackupevidence' -or $evidencePhaseSource -ne 'scripts/system-backup-a-download-gc-role-phase.sh' -or $evidenceProfile -ne 'a-download-gc-role' -or $configProofSeedPattern -ne '^Test(ADownloadGCRoleMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'){throw 'GC role root/seed/phase binding changed'}
if($invariantFlag -ne '1' -or $businessFlag -ne '0' -or $businessRestoreFlag -ne '0' -or [regex]::Matches($evidenceBashPreflight,'bash -n ').Count -ne 3){throw 'GC role full-catalog/preflight changed'}
$gcPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-download-gc-role-phase.sh'))
foreach($gcPart in @('-test.run "^TestADownloadGCRoleMySQL$"','-test.count=1','new_cases=10','actual_sql_accounts=yes','metadata_observer=privileged','maintenance=absent','full_gc=not_run','role_approval=no','production_approval=no','D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','trap','rm -f /tmp/a-download-gc-role.test /tmp/a-download-gc-role-inputs.json')){if(-not $gcPhase.Contains($gcPart)){throw ('GC role phase lost '+$gcPart)}}
foreach($gcOld in @('TestASQLTaskDownloadOwnersMySQL','TestADownloadAdmissionMySQL','TestDDownloadResultRetentionMySQL','TestASensitiveDownloadMFAMySQL$')){if($gcPhase.Contains($gcOld)){throw 'GC role phase repeats accepted/pending remote suites'}}
foreach($gcMixed in @(@{},@{ConfigWriterOnly=$true;ConfigDownloadProducerOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadTaskChainOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadOwnersOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadAdmissionOnly=$true},@{ConfigWriterOnly=$true;ConfigDownloadMFAOnly=$true},@{ConfigWriterOnly=$true;ConfigNonceTimeOnly=$true},@{ConfigWriterOnly=$true;IncludeAuth=$true},@{ConfigWriterOnly=$true;AdminReadConfigCandidate=$true})){
    $gcRejected=$false
    try{& $gcHarness -ConfigDownloadGCRoleOnly @gcMixed}catch{if($_.Exception.Message -match 'ConfigDownloadGCRoleOnly requires its exclusive'){$gcRejected=$true}else{throw}}
    if(-not $gcRejected){throw 'Mixed GC role profile accepted'}
}
$gcWrapper=Join-Path $PSScriptRoot 'system-backup-d-config-writer-validation.ps1'
foreach($gcFlag in @('DownloadProducerOnly','DownloadTaskChainOnly','DownloadOwnersOnly','DownloadAdmissionOnly','DownloadMFAOnly','NonceTimeOnly','SecurityOnly','MaintenanceReceiptsOnly','BackfillServiceOnly','BackfillRowGuards')){
    $gcMix=@{DownloadGCRoleOnly=$true;SourceManifestPath='not-used.json'};$gcMix[$gcFlag]=$true
    $gcRejected=$false
    try{& $gcWrapper @gcMix}catch{if($_.Exception.Message -match 'DownloadGCRoleOnly requires an exclusive'){$gcRejected=$true}else{throw}}
    if(-not $gcRejected){throw ('Mixed outer GC role profile accepted '+$gcFlag)}
}
Write-Output 'PASS download-gc-role-dispatch: exclusive ten restricted-account cases, two detached seeds, full catalog, privileged observer, UID/hash pins and exact cleanup; full GC and role approval excluded'
