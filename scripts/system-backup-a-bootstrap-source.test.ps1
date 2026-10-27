$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-a-bootstrap-source.ps1')
$sourceTestWorkspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceTestOwned=Join-Path $sourceTestWorkspace ('.tmp-abs-'+[guid]::NewGuid().ToString('N').Substring(0,16))
$sourceTestCount=0
function Write-SourceTestFile {
    param([string]$Root,[string]$Path,[string]$Content='synthetic')
    $target=Join-Path $Root $Path
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.File]::WriteAllText($target,$Content)
}
function New-SourceTestFixture {
    param([string]$Name)
    $root=Join-Path $sourceTestOwned $Name
    foreach($path in @('backend/internal/systembackupsecurity/security.go','backend/internal/systembackupsecurity/security_test.go',
        'backend/internal/systembackupsecurity/testdata/fixture.sql','backend/internal/systembackupread/read.go','backend/internal/systembackupread/read_test.go',
        'backend/internal/systembackupcontract/contract.go','backend/internal/systembackupbootstrapsecurity/bootstrap.go','backend/internal/systembackupbootstrapsecurity/bootstrap_test.go',
        'backend/internal/systembackupproducer/producer.go','backend/internal/systembackupproducer/producer_test.go',
        'backend/cmd/system-backup-bootstrap/main.go','backend/cmd/system-backup-bootstrap/main_test.go','backend/internal/db/migrations/001.sql',
        'contracts/system-backup/v12/contract.json','docs/evidence/ignored.json')+(Get-ABootstrapRequiredFiles)){
        Write-SourceTestFile -Root $root -Path $path
    }
    return $root
}
function Assert-SourceTest {
    param([bool]$Condition,[string]$Message)
    if(-not $Condition){throw $Message}
    $script:sourceTestCount++
    Write-Output ('PASS '+$Message)
}
try {
    $root=New-SourceTestFixture 'differences'
    $baseline=Get-ABootstrapSourceState -Root $root
    Assert-SourceTest ($baseline.source_files -eq 19 -and $baseline.missing_required.Count -eq 0) 'selected production including producer dependency, security tests, command tests and required fixtures; excluded unrelated tests and receipts'
    $same=Compare-ABootstrapSourceState -Root $root -Baseline $baseline
    Assert-SourceTest ($same.matches -and $same.source_sha256 -eq $baseline.source_sha256) 'unchanged source matches'
    Write-SourceTestFile $root 'backend/internal/systembackupread/new.go' 'new input'
    Write-SourceTestFile $root 'backend/internal/systembackupsecurity/security.go' 'mutation'
    Remove-Item -LiteralPath (Join-Path $root 'contracts/system-backup/v12/contract.json')
    $delta=Compare-ABootstrapSourceState -Root $root -Baseline $baseline
    Assert-SourceTest (-not $delta.matches -and $delta.added.Count -eq 1 -and $delta.added[0] -eq 'backend/internal/systembackupread/new.go' -and
        $delta.removed.Count -eq 1 -and $delta.changed.Count -eq 1) 'added, deleted and modified inputs are separately reported'
    Remove-Item -LiteralPath (Join-Path $root 'backend/go.sum')
    $delta=Compare-ABootstrapSourceState -Root $root -Baseline $baseline
    Assert-SourceTest ($delta.missing_required -contains 'backend/go.sum' -and $delta.removed -contains 'backend/go.sum') 'deleted required input fails comparison with an explicit path'
    $root=New-SourceTestFixture 'scope'
    $baseline=Get-ABootstrapSourceState -Root $root
    Write-SourceTestFile $root 'backend/internal/systembackupread/unrelated_test.go'
    Write-SourceTestFile $root 'docs/evidence/unrelated-receipt.json'
    Assert-SourceTest (Compare-ABootstrapSourceState -Root $root -Baseline $baseline).matches 'unselected tests and run receipts do not invalidate the source scope'
    Write-SourceTestFile $root 'backend/internal/systembackupproducer/new_test.go'
    Assert-SourceTest (Compare-ABootstrapSourceState -Root $root -Baseline $baseline).matches 'producer dependency tests are not misrepresented as executed bootstrap-package tests'
    Write-SourceTestFile $root '.gitignore' 'ignored.go'
    Write-SourceTestFile $root 'backend/internal/systembackupread/ignored.go'
    Assert-SourceTest (-not (Compare-ABootstrapSourceState -Root $root -Baseline $baseline).matches) 'ignored build source is still detected'
    $bad=[ordered]@{files=$baseline.files;source_sha256=('0'*64)}
    $rejected=$false
    try {Compare-ABootstrapSourceState -Root $root -Baseline $bad | Out-Null}catch{$rejected=$true}
    Assert-SourceTest $rejected 'inconsistent baseline digest is rejected'
    $duplicates=@($baseline.files)+@($baseline.files[0])
    $rejected=$false
    try {Compare-ABootstrapPins -Expected $duplicates -Actual $baseline.files | Out-Null}catch{$rejected=$true}
    Assert-SourceTest $rejected 'duplicate baseline paths are rejected'

    $root=New-SourceTestFixture 'producer'
    $baseline=Get-ABootstrapSourceState -Root $root
    Write-SourceTestFile $root 'backend/internal/systembackupproducer/new.go' 'new dependency'
    Write-SourceTestFile $root 'backend/internal/systembackupproducer/producer.go' 'changed dependency'
    $delta=Compare-ABootstrapSourceState -Root $root -Baseline $baseline
    Assert-SourceTest (-not $delta.matches -and $delta.added -contains 'backend/internal/systembackupproducer/new.go' -and
        $delta.changed -contains 'backend/internal/systembackupproducer/producer.go') 'new and modified producer production dependencies invalidate the bootstrap source'

    # Run the actual wrapper with synthetic source and a fake Go executor. This
    # exercises receipt/exit/cleanup behavior without compiling or claiming Go passed.
    $scenarioNumber=0
    foreach($scenario in @('unchanged','added','removed','modified','validation-script','frozen-added','go-failed')){
        # Keep nested frozen-fixture paths below Windows PowerShell 5.1 MAX_PATH.
        $root=New-SourceTestFixture ('w'+$scenarioNumber)
        $scenarioNumber++
        foreach($name in @('system-backup-a-bootstrap-security-validation.ps1','system-backup-a-bootstrap-source.ps1','system-backup-d-index-source-snapshot.ps1')){
            $target=Join-Path $root ('scripts/'+$name)
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $target
        }
        $fake=@'
function Initialize-AEvidenceTelemetry {param([string]$Scratch)}
function Invoke-AEvidenceGoStep {
    param([string[]]$Arguments,[string]$Stage)
    if($env:A_BOOTSTRAP_TEST_SCENARIO -eq 'go-failed'){throw 'synthetic Go gate failure'}
    if($Stage -ne 'server-build'){return}
    $fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    switch($env:A_BOOTSTRAP_TEST_SCENARIO){
        'added' {[IO.File]::WriteAllText((Join-Path $fixture 'backend/internal/systembackupread/added.go'),'added')}
        'removed' {Remove-Item -LiteralPath (Join-Path $fixture 'backend/go.sum')}
        'modified' {[IO.File]::WriteAllText((Join-Path $fixture 'backend/internal/systembackupread/read.go'),'modified')}
        'validation-script' {[IO.File]::AppendAllText((Join-Path $fixture 'scripts/system-backup-a-evidence-go-step.ps1'),"`n# changed")}
        'frozen-added' {[IO.File]::WriteAllText((Join-Path (Get-Location).Path 'internal/systembackupread/injected.go'),'injected')}
    }
}
'@
        Write-SourceTestFile $root 'scripts/system-backup-a-evidence-go-step.ps1' $fake
        $oldScenario=[Environment]::GetEnvironmentVariable('A_BOOTSTRAP_TEST_SCENARIO','Process')
        $oldGoFlags=[Environment]::GetEnvironmentVariable('GOFLAGS','Process')
        $failed=$false
        $wrapperError=''
        try {
            $env:A_BOOTSTRAP_TEST_SCENARIO=$scenario
            & (Join-Path $root 'scripts/system-backup-a-bootstrap-security-validation.ps1')
        } catch {$failed=$true;$wrapperError=$_.Exception.Message} finally {[Environment]::SetEnvironmentVariable('A_BOOTSTRAP_TEST_SCENARIO',$oldScenario,'Process')}
        $receipts=@(Get-ChildItem -LiteralPath (Join-Path $root 'docs/evidence') -Filter 'a-bootstrap-security-local-*.json')
        Assert-SourceTest ($receipts.Count -eq 1) ($scenario+': creates one receipt')
        $receipt=Get-Content -Raw -LiteralPath $receipts[0].FullName | ConvertFrom-Json
        Assert-SourceTest ($receipt.cleanup_verified -and @(Get-ChildItem -Force -LiteralPath $root -Filter '.tmp-a-evidence-*').Count -eq 0 -and
            [string][Environment]::GetEnvironmentVariable('GOFLAGS','Process') -ceq [string]$oldGoFlags) ($scenario+': cleans owned snapshot and restores environment')
        if($scenario -eq 'unchanged'){
            Assert-SourceTest (-not $failed -and $receipt.frozen_validation_passed -and $receipt.current_inputs_match) ('unchanged wrapper succeeds with separate frozen/current results; error='+$wrapperError)
        } elseif($scenario -in @('frozen-added','go-failed')){
            Assert-SourceTest ($failed -and -not $receipt.frozen_validation_passed -and $receipt.status -eq 'failed') ($scenario+': failed frozen validation is never promoted')
        } else {
            Assert-SourceTest ($failed -and $receipt.frozen_validation_passed -and -not $receipt.current_inputs_match -and
                $receipt.status -eq 'frozen_security_validation_passed_current_inputs_drifted_or_unverifiable') ($scenario+': frozen success with current drift exits with failure')
            if($scenario -eq 'validation-script'){
                Assert-SourceTest ($receipt.current_source.matches -and -not $receipt.current_validation_inputs.matches) 'validation helper mutation is independently detected'
            }
        }
    }
    Write-Output ('PASSED bootstrap source checks='+$sourceTestCount)
} finally {
    $resolved=[IO.Path]::GetFullPath($sourceTestOwned)
    if([IO.Path]::GetDirectoryName($resolved) -ne $sourceTestWorkspace -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-abs-[a-f0-9]{16}$' -or
        ((Test-Path -LiteralPath $resolved) -and ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint))){throw 'Unsafe source fixture cleanup'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
    Write-Output ('CLEANED bootstrap source fixtures='+(-not(Test-Path -LiteralPath $resolved)))
}
