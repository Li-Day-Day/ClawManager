$ErrorActionPreference='Stop'
$lifecycleRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$lifecycleRendered=@(& node (Join-Path $PSScriptRoot 'd-gc-full-lifecycle-source-20261026.mjs') render $lifecycleRepo)
if($LASTEXITCODE -ne 0){throw 'Lifecycle selector render failed'}
$lifecycleText=$lifecycleRendered -join "`n"
$lifecycleTokens=$null;$lifecycleErrors=$null
$lifecycleAst=[Management.Automation.Language.Parser]::ParseInput($lifecycleText,[ref]$lifecycleTokens,[ref]$lifecycleErrors)
if($lifecycleErrors.Count){throw 'Lifecycle copied dispatcher parse errors'}
$ConfigDownloadGCFullCollectOnly=$true;$ConfigDownloadGCFullProfileOnly=$true;$ConfigDownloadGCFreezeOnly=$true;$ConfigDownloadMFAOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
foreach($lifecycleFlag in @('ConfigDownloadGCTaskOnly','ConfigDownloadGCRoleOnly','ConfigDownloadProducerOnly','ConfigDownloadTaskChainOnly','ConfigDownloadOwnersOnly','ConfigDownloadAdmissionOnly','ConfigNonceTimeOnly','ConfigMaintenanceAuthorityOnly','ConfigBackfillServiceOnly','ConfigMaintenanceReceiptOnly','ConfigWriterSecurityOnly','BusinessHistoryOnly','BusinessRestoreOnly','AdminReadOnly','AdminReadIndexCandidate','AdminReadConfigCandidate','ProducerService','ProducerRecoveryOnly','LoginStateOnly','LoginSessionsOnly')){Set-Variable -Name $lifecycleFlag -Value $false}
foreach($lifecycleName in @('evidenceProbeName','evidenceProbePackage','evidencePhaseSource','evidenceProfile','configProofSeedPattern')){
    $lifecycleNodes=@($lifecycleAst.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$lifecycleName)},$true))
    if($lifecycleName -eq 'evidenceProbePackage'){$lifecycleNodes=@($lifecycleNodes|Where-Object{$_.Extent.Text.Contains('$ConfigDownloadMFAOnly')})}
    if($lifecycleNodes.Count -ne 1){throw ('Ambiguous lifecycle assignment '+$lifecycleName)}
    . ([scriptblock]::Create($lifecycleNodes[0].Extent.Text))
}
if($evidenceProbeName -cne 'd-download-gc-full-lifecycle.test' -or $evidenceProbePackage -cne './internal/systembackupevidence' -or $evidencePhaseSource -cne 'scripts/system-backup-d-download-gc-full-lifecycle-phase.sh' -or $evidenceProfile -cne 'd-download-gc-full-lifecycle' -or $configProofSeedPattern -cne '^Test(DDownloadGCFullLifecycleMySQLSeed|DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed)$'){throw 'Lifecycle package/phase/profile/seed selection differs'}
# Parse and evaluate assignments only. Never dot-source the harness itself.
foreach($lifecyclePath in @('d-gc-full-lifecycle-operator-20261026.ps1')){
    $lifecycleTokens=$null;$lifecycleErrors=$null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $lifecyclePath),[ref]$lifecycleTokens,[ref]$lifecycleErrors)|Out-Null
    if($lifecycleErrors.Count){throw ('Lifecycle operator parse error '+$lifecyclePath)}
}
Write-Output 'PASS lifecycle-dispatch copied_selector=yes exact_root_phase_seeds=yes ordinary_full_not_repeated=yes parse_errors=0 Go=no SSH=no files_created=no'
