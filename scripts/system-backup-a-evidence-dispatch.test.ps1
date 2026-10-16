$ErrorActionPreference='Stop'
# Evaluate only the production string expression and four profile assignments.
# Never execute the validation script, SSH, Go, bash or the remote command.
$aDispatchTokens=$null
$aDispatchErrors=$null
$aDispatchPath=Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'
$aDispatchAst=[Management.Automation.Language.Parser]::ParseFile($aDispatchPath,[ref]$aDispatchTokens,[ref]$aDispatchErrors)
if($aDispatchErrors.Count){throw 'Validation script has PowerShell parse errors'}
$aDispatchStrings=@($aDispatchAst.FindAll({param($node)
    $node -is [Management.Automation.Language.ExpandableStringExpressionAst] -and
    $node.Extent.Text.Contains('tar -xf bundle.tar;') -and $node.Extent.Text.Contains('KUBE_CONTEXT=')
},$true))
if($aDispatchStrings.Count -ne 1){throw 'Expected one production remote validation command'}
$aDispatchProfileAssignments=@()
foreach($aDispatchVariable in @('invariantFlag','businessFlag','businessRestoreFlag','evidenceBashPreflight')){
    $aDispatchMatches=@($aDispatchAst.FindAll({param($node)
        $node -is [Management.Automation.Language.AssignmentStatementAst] -and
        $node.Left.Extent.Text -ceq ('$'+$aDispatchVariable)
    },$true))
    if($aDispatchMatches.Count -ne 1){throw "Expected one profile assignment: $aDispatchVariable"}
    $aDispatchProfileAssignments+=[scriptblock]::Create($aDispatchMatches[0].Extent.Text)
}
function Get-DispatchFixture([bool]$BusinessHistoryOnly,[bool]$BusinessRestoreOnly,[string]$Expression,[string]$IndexVariant='all',[bool]$IndexCandidate=$false,[bool]$ProofCandidate=$false){
    $ConfigProofOnly=$ProofCandidate
    $evidenceRemote='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef'
    $archiveHash='a'*64; $digest='b'*64; $evidenceMigrationHash='c'*64
    $evidenceBinaryHash='d'*64; $evidenceHTTPHash='e'*64; $evidenceIndexHash='f'*64
    $evidenceIndexDDLHash='1'*64; $evidenceCandidateHash='2'*64; $evidenceDDLHash='3'*64
    $evidenceProbeName=if($ConfigProofOnly){'a-config-proof.test'}elseif($BusinessRestoreOnly){'a-business-restore.test'}elseif($BusinessHistoryOnly){'a-business-history.test'}else{'d-provider-registration.test'}
    $AdminReadIndexCandidate=$IndexCandidate; $AdminReadIndexVariant=$IndexVariant; $recoveryOnlyFlag='0'; $RecoveryTest='D'; $evidenceIndexFlag='0'; $evidenceCandidateFlag='0'
    foreach($aDispatchAssignment in $aDispatchProfileAssignments){. $aDispatchAssignment}
    return (. ([scriptblock]::Create($Expression)))
}
function Assert-Dispatch([string]$Command,[string]$Profile){
    $aDispatchBusiness=if($Profile -eq 'default'){'0'}else{'1'}
    $aDispatchInvariant=if($Profile -eq 'default'){'1'}else{'0'}
    $aDispatchRestore=if($Profile -eq 'restore'){'1'}else{'0'}
    if($Command -cnotmatch "; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE="){
        throw "Missing exact KUBE_CONTEXT environment assignment: $Profile"
    }
    foreach($aDispatchPair in @(
        "D_DB_INVARIANT_SMOKE=$aDispatchInvariant", "D_PROVIDER_REGISTRATION_SMOKE=$aDispatchInvariant",
        "A_BUSINESS_HISTORY_SMOKE=$aDispatchBusiness", "A_BUSINESS_RESTORE_SMOKE=$aDispatchRestore"
    )){if(-not $Command.Contains(' '+$aDispatchPair+' ')){throw "Incorrect profile flag: $aDispatchPair"}}
    if(-not $Command.EndsWith(' bash scripts/system-backup-fresh-migration-smoke.sh')){throw 'Harness command changed'}
    if(-not $Command.Contains("A_BUSINESS_BINARY_SHA256='"+('d'*64)+"'")){throw 'Probe digest lost'}
    if(-not $Command.Contains("D_MIGRATION_BINARY_SHA256='"+('c'*64)+"'")){throw 'Migration digest lost'}
    $aDispatchChecks=@([regex]::Matches($Command,'bash -n ([^;]+);'))
    if($Profile -eq 'restore'){
        $aDispatchPaths=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-a-business-history-phase.sh','scripts/system-backup-d-migration-phase.sh')
        if($aDispatchChecks.Count -ne $aDispatchPaths.Count){throw 'Expected a separate bash syntax check per script'}
        for($aDispatchIndex=0;$aDispatchIndex -lt $aDispatchPaths.Count;$aDispatchIndex++){
            if($aDispatchChecks[$aDispatchIndex].Groups[1].Value -cne $aDispatchPaths[$aDispatchIndex]){throw 'Wrong bash syntax-check target'}
            if($aDispatchChecks[$aDispatchIndex].Index -gt $Command.IndexOf(' KUBE_CONTEXT=')){throw 'Preflight must precede harness'}
        }
    }elseif($aDispatchChecks.Count){throw 'Unexpected profile preflight'}
}
$aDispatchExpression=$aDispatchStrings[0].Extent.Text
$aDispatchCases=0
$aDispatchCommand=Get-DispatchFixture $false $false $aDispatchExpression 'all' $false $true
foreach($aProofPart in @(" KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE=",' D_DB_INVARIANT_SMOKE=1 ',' D_PROVIDER_REGISTRATION_SMOKE=1 ',' A_BUSINESS_HISTORY_SMOKE=0 ',' A_BUSINESS_RESTORE_SMOKE=0 ',"D_INVARIANT_BINARY='/tmp/clawmanager-a-evidence-0123456789abcdef0123456789abcdef/a-config-proof.test'")){
    if(-not $aDispatchCommand.Contains($aProofPart)){throw ('Config proof dispatch lost binding: '+$aProofPart)}
}
if(@([regex]::Matches($aDispatchCommand,'bash -n ')).Count -ne 3 -or -not $aDispatchCommand.Contains('bash -n scripts/system-backup-d-provider-registration-phase.sh; ')){throw 'Config proof shell preflight missing'}
$aDispatchCases++
Write-Output 'PASS production-dispatch-config-proof'
$aProofPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-config-proof-phase.sh'))
if(-not $aProofPhase.Contains('-test.run "^TestAConfigProofMySQL$"') -or $aProofPhase.Contains('TestALoginSessions') -or $aProofPhase.Contains('mysql_query "CREATE TABLE users')){throw 'Config proof must select only its new test on the full migrated schema'}
$aDispatchCases++
Write-Output 'PASS config-proof-exclusive-remote-test'
$aProofRejected=$false
try{& $aDispatchPath -ConfigProofOnly -LoginSessionsOnly}catch{if($_.Exception.Message -cne 'ConfigProofOnly requires its dedicated validation profile'){throw};$aProofRejected=$true}
if(-not $aProofRejected){throw 'Mixed config proof profile was accepted'}
$aDispatchCases++
Write-Output 'PASS reject-mixed-config-proof-profile'
foreach($aDispatchVariant in @('page','status','all')){
    $aDispatchCommand=Get-DispatchFixture $false $false $aDispatchExpression $aDispatchVariant $true
    if(-not $aDispatchCommand.Contains(" D_ADMIN_INDEX_VARIANT='$aDispatchVariant' ")){throw 'Index variant lost during production remote dispatch'}
    if(-not $aDispatchCommand.Contains('bash -n scripts/system-backup-d-provider-registration-phase.sh;')){throw 'Grouped shell preflight missing'}
    $aDispatchCases++
    Write-Output "PASS production-dispatch-index-$aDispatchVariant"
}
foreach($aDispatchProfile in @('default','history','restore')){
    $aDispatchCommand=Get-DispatchFixture ($aDispatchProfile -eq 'history') ($aDispatchProfile -eq 'restore') $aDispatchExpression
    Assert-Dispatch $aDispatchCommand $aDispatchProfile
    $aDispatchCases++
    Write-Output "PASS production-dispatch-$aDispatchProfile"
}
# Prove these assertions reject the exact production regression seen remotely.
$aDispatchBroken=$aDispatchExpression.Replace('${evidenceBashPreflight}KUBE_CONTEXT','$evidenceBashPreflightKUBE_CONTEXT')
if($aDispatchBroken -ceq $aDispatchExpression){throw 'Regression mutation did not alter production expression'}
foreach($aDispatchProfile in @('history','restore')){
    $aDispatchCommand=Get-DispatchFixture ($aDispatchProfile -eq 'history') ($aDispatchProfile -eq 'restore') $aDispatchBroken
    $aDispatchRejected=$false
    try{Assert-Dispatch $aDispatchCommand $aDispatchProfile}catch{
        if($_.Exception.Message -notlike 'Missing exact KUBE_CONTEXT*'){throw}
        $aDispatchRejected=$true
    }
    if(-not $aDispatchRejected){throw "Original interpolation defect escaped regression: $aDispatchProfile"}
    $aDispatchCases++
    Write-Output "PASS reject-original-dispatch-defect-$aDispatchProfile"
}
Write-Output "PASS evidence remote dispatch: $aDispatchCases cases; no remote actions, dependencies or build artifacts"
