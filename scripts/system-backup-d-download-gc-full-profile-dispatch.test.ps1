$ErrorActionPreference='Stop'
$gcFullTokens=$null;$gcFullErrors=$null
$gcFullHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$gcFullAST=[Management.Automation.Language.Parser]::ParseFile($gcFullHarness,[ref]$gcFullTokens,[ref]$gcFullErrors)
if($gcFullErrors.Count){throw 'Full-profile dispatcher parse errors'}
$ConfigDownloadGCFullCollectOnly=$false;$ConfigDownloadGCFullProfileOnly=$true;$ConfigDownloadGCFreezeOnly=$true;$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
foreach($gcFullFlag in @('ConfigDownloadGCTaskOnly','ConfigDownloadGCRoleOnly','ConfigDownloadProducerOnly','ConfigDownloadTaskChainOnly','ConfigDownloadOwnersOnly','ConfigDownloadAdmissionOnly','ConfigNonceTimeOnly','ConfigMaintenanceAuthorityOnly','ConfigBackfillServiceOnly','ConfigMaintenanceReceiptOnly','ConfigWriterSecurityOnly','BusinessHistoryOnly','BusinessRestoreOnly','AdminReadOnly','AdminReadIndexCandidate','AdminReadConfigCandidate','ProducerService','ProducerRecoveryOnly','LoginStateOnly','LoginSessionsOnly')){Set-Variable -Name $gcFullFlag -Value $false}
foreach($gcFullName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern','downloadEvidenceTestTimeout')){
    $gcFullNodes=@($gcFullAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$gcFullName)},$true))
    if($gcFullName -eq 'evidenceProbePackage'){$gcFullNodes=@($gcFullNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($gcFullNodes.Count -ne 1){throw ('Ambiguous full-profile assignment '+$gcFullName)}
    . ([scriptblock]::Create($gcFullNodes[0].Extent.Text))
}
if($evidenceProbeName -cne 'd-download-gc-full-profile.test' -or $evidenceProbePackage -cne './internal/systembackupevidence' -or $evidencePhaseSource -cne 'scripts/system-backup-d-download-gc-full-profile-phase.sh' -or $evidenceProfile -cne 'd-download-gc-full-profile' -or $configProofSeedPattern -cne '^TestDDownloadGCFullProfileMySQLSeed$' -or $downloadEvidenceTestTimeout -cne '2700s'){throw 'Full-profile package/root/phase/seed/budget binding changed'}
$gcFullPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-download-gc-full-profile-phase.sh'))
foreach($gcFullRequired in @('-test.run "^TestDDownloadGCFullProfileMySQL$"','-test.list "^TestDDownloadGCFullProfileMySQL$"','-test.count=1','new_cases=33','-eq 33','--- SKIP:','worker-profile-and-independent-observer','freeze_adapter=fixed_owner','public_collect=no','full_group=no','full_gc=not_run','production_approval=no','RUN_NAMESPACE_UID','D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','trap')){if(-not $gcFullPhase.Contains($gcFullRequired)){throw ('Full-profile remote binding missing '+$gcFullRequired)}}
foreach($gcFullForbidden in @('TestDDownloadGCFreezeMySQL|','TestDDownloadGCOwnerLifecycleMySQL','TestADownloadGCRoleMySQL','new_cases=42','full_gc=passed','public_collect=yes')){if($gcFullPhase.Contains($gcFullForbidden)){throw 'Full-profile repeats or overstates prior actual suites'}}
foreach($gcFullFlag in @('ConfigDownloadGCFreezeOnly','ConfigDownloadGCRoleOnly','ConfigDownloadGCTaskOnly','ConfigDownloadOwnersOnly','ConfigDownloadProducerOnly')){
    $gcFullMix=@{ConfigDownloadGCFullProfileOnly=$true;ConfigWriterOnly=$true};$gcFullMix[$gcFullFlag]=$true
    $gcFullRejected=$false
    try{& $gcFullHarness @gcFullMix}catch{if($_.Exception.Message -match 'profiles must be selected separately|exclusive config writer plumbing profile'){$gcFullRejected=$true}else{throw}}
    if(-not $gcFullRejected){throw ('Mixed Full-profile accepted '+$gcFullFlag)}
}
$gcFullWrapper=Join-Path $PSScriptRoot 'system-backup-d-config-writer-validation.ps1'
foreach($gcFullFlag in @('DownloadGCFreezeOnly','DownloadGCRoleOnly','DownloadGCTaskOnly','DownloadOwnersOnly','DownloadProducerOnly')){
    $gcFullMix=@{DownloadGCFullProfileOnly=$true;SourceManifestPath='unused.json'};$gcFullMix[$gcFullFlag]=$true
    $gcFullRejected=$false
    try{& $gcFullWrapper @gcFullMix}catch{if($_.Exception.Message -match 'profiles must be selected separately|exclusive validation profile'){$gcFullRejected=$true}else{throw}}
    if(-not $gcFullRejected){throw ('Mixed Full-profile wrapper accepted '+$gcFullFlag)}
}
Write-Output 'PASS full-profile-dispatch new_cases=33 public_collect=no old_role10_gc42_not_selected=yes builds=no remote=no'
