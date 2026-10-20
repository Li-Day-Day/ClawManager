$ErrorActionPreference='Stop'
$nonceTokens=$null;$nonceErrors=$null
$nonceHarness=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$nonceAST=[Management.Automation.Language.Parser]::ParseFile($nonceHarness,[ref]$nonceTokens,[ref]$nonceErrors)
if($nonceErrors.Count){throw 'Nonce harness parse errors'}
$ConfigNonceTimeOnly=$true;$ConfigWriterOnly=$true;$ConfigProofOnly=$true
$ConfigMaintenanceAuthorityOnly=$false;$ConfigBackfillServiceOnly=$false;$ConfigMaintenanceReceiptOnly=$false;$ConfigWriterSecurityOnly=$false
$BusinessHistoryOnly=$false;$BusinessRestoreOnly=$false;$AdminReadOnly=$false;$AdminReadIndexCandidate=$false
$ProducerService=$false;$ProducerRecoveryOnly=$false;$LoginStateOnly=$false;$LoginSessionsOnly=$false
$nonceValues=@{}
foreach($nonceName in @('evidenceProbeName','evidencePhaseSource','evidenceProfile','configProofSeedPattern','invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight')){
    $nonceNodes=@($nonceAST.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq ('$'+$nonceName)},$true))
    if($nonceNodes.Count -ne 1){throw ('Ambiguous nonce assignment '+$nonceName)}
    . ([scriptblock]::Create($nonceNodes[0].Extent.Text))
    $nonceValues[$nonceName]=Get-Variable -Name $nonceName -ValueOnly
}
if($evidenceProbeName -ne 'd-config-writer.test' -or $evidencePhaseSource -ne 'scripts/system-backup-a-nonce-acceptance-phase.sh' -or $evidenceProfile -ne 'a-nonce-acceptance' -or $configProofSeedPattern -ne '^Test(DConfigWriterMySQLSeed|ANonceAcceptanceMySQLSeed)$'){throw 'Nonce profile dispatches wrong binary/phase/seed'}
if($invariantFlag -ne '1' -or $businessFlag -ne '0' -or $businessRestoreFlag -ne '0' -or [regex]::Matches($evidenceBashPreflight,'bash -n ').Count -ne 3){throw 'Nonce full-catalog/preflight isolation changed'}
$noncePhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-nonce-acceptance-phase.sh'))
if(-not $noncePhase.Contains('-test.run "^TestANonceAcceptanceMySQL$"') -or $noncePhase.Contains('-test.run "^TestDConfigWriterMySQL') -or -not $noncePhase.Contains('new_cases=8') -or -not $noncePhase.Contains('production_approval=no')){throw 'Nonce phase includes old suites or loses scope marker'}
foreach($nonceGuard in @('D_INVARIANT_BINARY_SHA256','D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','trap','rm -f /tmp/a-nonce-acceptance.test /tmp/a-nonce-acceptance-inputs.json')){if(-not $noncePhase.Contains($nonceGuard)){throw ('Nonce phase lost '+$nonceGuard)}}
$nonceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nonceGo=[IO.File]::ReadAllText((Join-Path $nonceRoot 'backend/internal/systembackupsecurity/nonce_acceptance_time_a_mysql_test.go'))
foreach($nonceSymbol in @('func TestANonceAcceptanceMySQL(', 'configWriterMySQLDatabase(t)', 'runANonceProviderTimes(t, ctx, db, cfg, identity)', 'runANonceConfigTimes(t, ctx, db, cfg, identity)')){if(-not $nonceGo.Contains($nonceSymbol)){throw ('Nonce root is not reachable: '+$nonceSymbol)}}
foreach($nonceMixed in @(@{},@{ConfigWriterOnly=$true;ConfigWriterSecurityOnly=$true},@{ConfigWriterOnly=$true;ConfigMaintenanceReceiptOnly=$true},@{ConfigWriterOnly=$true;BackfillRowGuards=$true})){
    $nonceRejected=$false
    try{& $nonceHarness -ConfigNonceTimeOnly @nonceMixed}catch{if($_.Exception.Message -match 'ConfigNonceTimeOnly requires the exclusive'){$nonceRejected=$true}else{throw}}
    if(-not $nonceRejected){throw 'Mixed nonce profile accepted'}
}
Write-Output 'PASS nonce-acceptance-dispatch: exact new root/seed/phase, binary/input/UID pins, full-catalog, preflight, cleanup and exclusive profile; no build or remote'
