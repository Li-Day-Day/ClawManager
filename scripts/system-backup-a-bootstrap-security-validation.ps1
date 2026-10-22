[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-bootstrap-source.ps1')
$aRbacRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$aRbacOwned=Join-Path $aRbacRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$aRbacSource=Join-Path $aRbacOwned 'source'
$aRbacNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$aRbacPrior=@{}
foreach($aRbacName in $aRbacNames){$aRbacPrior[$aRbacName]=[Environment]::GetEnvironmentVariable($aRbacName,'Process')}
$aRbacResult=[ordered]@{kind='a_bootstrap_security_local_validation';status='failed';started_at=[DateTime]::UtcNow.ToString('o');completed_at=$null;source_files=0;source_sha256='';packages=@('clawreef/internal/systembackupsecurity','clawreef/internal/systembackupbootstrapsecurity','clawreef/cmd/system-backup-bootstrap');test_timeout_seconds=600;build_parallelism=$BuildParallelism;linux_build=$false;default_vet=$true;dependencies_installed=$false;remote_contacted=$false;cleanup_verified=$false}
$aRbacResult.frozen_validation_passed=$false
$aRbacResult.current_inputs_match=$false
$aRbacValidationFiles=@('scripts/system-backup-a-bootstrap-security-validation.ps1','scripts/system-backup-a-evidence-go-step.ps1','scripts/system-backup-a-bootstrap-source.ps1','scripts/system-backup-d-index-source-snapshot.ps1')
$aRbacResult.validation_inputs=@(Get-DIndexInputPins -Root $aRbacRoot -Files $aRbacValidationFiles)
$aRbacEvidence=Join-Path $aRbacRoot ('docs/evidence/a-bootstrap-security-local-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
try {
    foreach($aRbacFolder in @('source','cache','tmp','binary')){[IO.Directory]::CreateDirectory((Join-Path $aRbacOwned $aRbacFolder))|Out-Null}
    $aRbacBaseline=Get-ABootstrapSourceState -Root $aRbacRoot
    if($aRbacBaseline.missing_required.Count -ne 0){throw 'Required bootstrap validation input missing'}
    $aRbacPins=$aRbacBaseline.files
    $aRbacFiles=@($aRbacPins | ForEach-Object {$_.path})
    $aRbacResult.source_files=$aRbacPins.Count
    $aRbacResult.source_sha256=Get-DIndexPinDigest -Pins $aRbacPins
    $aRbacResult.files=$aRbacPins
    foreach($aRbacPin in $aRbacPins){
        $aRbacTarget=Join-Path $aRbacSource $aRbacPin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($aRbacTarget))|Out-Null
        Copy-Item -LiteralPath (Join-Path $aRbacRoot $aRbacPin.path) -Destination $aRbacTarget
        if((Get-FileHash -Algorithm SHA256 -LiteralPath $aRbacTarget).Hash.ToLowerInvariant() -ne $aRbacPin.sha256){throw 'Selected source changed during copy'}
        (Get-Item -LiteralPath $aRbacTarget).IsReadOnly=$true
    }
    if(-not (Compare-ABootstrapSourceState -Root $aRbacRoot -Baseline $aRbacBaseline).matches){throw 'Selected worktree source or file set changed during freeze'}
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS=('-mod=readonly -p='+$BuildParallelism)
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOCACHE=Join-Path $aRbacOwned 'cache';$env:GOTMPDIR=Join-Path $aRbacOwned 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $aRbacOwned
    Push-Location (Join-Path $aRbacSource 'backend')
    try {
        Write-Host ('FROZEN bootstrap_security files='+$aRbacResult.source_files+' sha256='+$aRbacResult.source_sha256)
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=10m','./internal/systembackupsecurity','./internal/systembackupbootstrapsecurity','./cmd/system-backup-bootstrap') -Stage 'test-vet'
        $env:GOOS='linux'
        Invoke-AEvidenceGoStep -Arguments @('build','-trimpath','-buildvcs=false','-o',(Join-Path $aRbacOwned 'binary/bootstrap'),'./cmd/system-backup-bootstrap') -Stage 'server-build'
        $aRbacResult.linux_build=$true
    } finally {Pop-Location}
    $aRbacResult.frozen_source=Compare-ABootstrapSourceState -Root $aRbacSource -Baseline $aRbacBaseline
    if(-not $aRbacResult.frozen_source.matches){throw 'Frozen source or file set postcheck failed'}
    $aRbacResult.frozen_validation_passed=$true
    $aRbacResult.status='local_security_registries_and_requirements_passed_remaining_27_adapters_blocked'
} finally {
    if($null -ne $aRbacBaseline){
        try {
            $aRbacResult.current_source=Compare-ABootstrapSourceState -Root $aRbacRoot -Baseline $aRbacBaseline
            $aRbacResult.current_validation_inputs=Compare-ABootstrapPins -Expected $aRbacResult.validation_inputs -Actual @(Get-DIndexInputPins -Root $aRbacRoot -Files $aRbacValidationFiles)
            $aRbacResult.current_inputs_match=$aRbacResult.current_source.matches -and $aRbacResult.current_validation_inputs.matches
        } catch {$aRbacResult.current_source_check_error=$_.Exception.Message}
    }
    if($aRbacResult.frozen_validation_passed -and -not $aRbacResult.current_inputs_match){$aRbacResult.status='frozen_security_validation_passed_current_inputs_drifted_or_unverifiable'}
    foreach($aRbacName in $aRbacNames){[Environment]::SetEnvironmentVariable($aRbacName,$aRbacPrior[$aRbacName],'Process')}
    if(Test-Path -LiteralPath $aRbacOwned){
        $aRbacResolved=(Resolve-Path -LiteralPath $aRbacOwned).Path
        if([IO.Path]::GetDirectoryName($aRbacResolved) -ne $aRbacRoot -or [IO.Path]::GetFileName($aRbacResolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $aRbacResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe bootstrap validation cleanup path'}
        Remove-Item -LiteralPath $aRbacResolved -Recurse -Force
    }
    $aRbacResult.cleanup_verified=-not(Test-Path -LiteralPath $aRbacOwned)
    $aRbacResult.completed_at=[DateTime]::UtcNow.ToString('o')
    $aRbacJson=$aRbacResult|ConvertTo-Json -Depth 8
    $aRbacHandle=[IO.File]::Open($aRbacEvidence,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $aRbacWriter=New-Object IO.StreamWriter($aRbacHandle,(New-Object Text.UTF8Encoding($false)))
    try{$aRbacWriter.WriteLine($aRbacJson)}finally{$aRbacWriter.Dispose()}
    Write-Host ('CLEANED bootstrap_security='+$aRbacResult.cleanup_verified)
    Write-Host ('LOCAL_RECEIPT '+$aRbacEvidence)
}
if(-not $aRbacResult.current_inputs_match){throw 'Current bootstrap validation inputs differ from the tested snapshot or could not be verified; inspect the local receipt'}
