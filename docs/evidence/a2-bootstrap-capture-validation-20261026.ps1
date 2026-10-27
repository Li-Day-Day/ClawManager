[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$captureRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $captureRoot 'scripts/system-backup-a-bootstrap-source.ps1')
. (Join-Path $captureRoot 'scripts/system-backup-a-evidence-go-step.ps1')
$captureOwner=Join-Path $captureRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$captureSource=Join-Path $captureOwner 'source'
$capturePrefix=Join-Path $PSScriptRoot ('a2-bootstrap-capture-native-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
$captureEnvNames=@('GOENV','GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TEMP','TMP')
$captureOldEnv=@{};foreach($captureName in $captureEnvNames){$captureOldEnv[$captureName]=[Environment]::GetEnvironmentVariable($captureName,'Process')}
$captureBaseline=$null;$captureFailure=$null
$captureResult=[ordered]@{kind='a2_bootstrap_capture_targeted_validation.v1';scope='five_new_relation_roots_and_Linux_compile_only_not_joint_gate';status='failed';started_at=[DateTime]::UtcNow.ToString('o');source_files=0;source_sha256='';files=@();steps=@();owner=$captureOwner;owner_removed=$false;frozen_postcheck=$false;current_inputs_match=$false;target_current_match=$false;default_vet=$true;dependencies_installed=$false;remote_contacted=$false;actual_SQL=$false;production_approved=$false}
$captureValidation=@('docs/evidence/a2-bootstrap-capture-validation-20261026.ps1','scripts/system-backup-a-bootstrap-source.ps1','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-evidence-go-step.ps1')
$captureResult.validation_inputs=@(Get-DIndexInputPins -Root $captureRoot -Files $captureValidation)
function Invoke-CaptureStep([string[]]$Arguments){
    $stepLog=$capturePrefix+'-step-'+$script:captureResult.steps.Count+'.log'
    # Successful go test -c is silent; create its empty log before streaming.
    [IO.File]::WriteAllText($stepLog,'',[Text.UTF8Encoding]::new($false))
    $global:LASTEXITCODE=$null
    & go @Arguments 2>&1 | Tee-Object -FilePath $stepLog
    $nativeExit=$global:LASTEXITCODE
    $script:captureResult.steps+=@([ordered]@{command=@('go')+$Arguments;platform=$env:GOOS;native_exit=$nativeExit;log=$stepLog;sha256=(Get-FileHash -LiteralPath $stepLog -Algorithm SHA256).Hash.ToLowerInvariant()})
    if($nativeExit -ne 0){throw ('Capture targeted native step failed exit='+$nativeExit)}
}
try {
    foreach($dir in @('source','cache','tmp','binary')){[IO.Directory]::CreateDirectory((Join-Path $captureOwner $dir))|Out-Null}
    $captureBaseline=Get-ABootstrapSourceState -Root $captureRoot
    if($captureBaseline.missing_required.Count -ne 0){throw 'Missing bootstrap dependency source'}
    $captureResult.source_files=$captureBaseline.source_files
    $captureResult.source_sha256=$captureBaseline.source_sha256
    $captureResult.files=$captureBaseline.files
    foreach($p in $captureBaseline.files){
        $target=Join-Path $captureSource $p.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
        Copy-Item -LiteralPath (Join-Path $captureRoot $p.path) -Destination $target
        if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.sha256){throw ('Source changed during copy: '+$p.path)}
        (Get-Item -LiteralPath $target).IsReadOnly=$true
    }
    if(-not (Compare-ABootstrapSourceState -Root $captureRoot -Baseline $captureBaseline).matches){throw 'Source changed during freeze; Go not started'}
    $env:GOENV='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $captureOwner 'cache';$env:GOTMPDIR=Join-Path $captureOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
    Initialize-AEvidenceTelemetry -Scratch $captureOwner
    Write-Output ('A2_CAPTURE_FROZEN files='+$captureBaseline.source_files+' source='+$captureBaseline.source_sha256+' owner='+$captureOwner)
    Push-Location (Join-Path $captureSource 'backend')
    try {
        Invoke-CaptureStep @('test','-json','-count=1','-timeout=10m','-run','^Test(CandidateConfigHashes|CaptureCandidateRelation)','./internal/systembackupbootstrapsecurity')
        $rows=@(Get-Content -LiteralPath $captureResult.steps[0].log | ForEach-Object {$_|ConvertFrom-Json})
        if(@($rows|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -ne 0){throw 'Failed/skipped targeted run'}
        $runs=@($rows|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object {$_.Test}|Sort-Object -CaseSensitive)
        $passes=@($rows|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Test}|Sort-Object -CaseSensitive)
        if($runs.Count -eq 0 -or $runs.Count -ne $passes.Count -or @(Compare-Object $runs $passes -CaseSensitive).Count -ne 0 -or @($runs|Select-Object -Unique).Count -ne $runs.Count){throw 'Targeted inventory mismatch'}
        $roots=@($runs|Where-Object {$_ -notmatch '/'})
        if($roots.Count -ne 5 -or @($rows|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}).Count -ne 1 -or $rows[-1].Action -ne 'pass' -or $rows[-1].Test){throw 'Incomplete targeted package'}
        $captureResult.roots=$roots;$captureResult.pass_events=$passes.Count
        $env:GOOS='linux'
        $binary=Join-Path $captureOwner 'binary/bootstrapsecurity.test'
        Invoke-CaptureStep @('test','-c','-o',$binary,'./internal/systembackupbootstrapsecurity')
        $captureResult.Linux_binary_sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
    } finally {Pop-Location}
    $frozen=Compare-ABootstrapSourceState -Root $captureSource -Baseline $captureBaseline
    if(-not $frozen.matches){throw 'Frozen dependency set or bytes changed'}
    $captureResult.frozen_postcheck=$true
    $current=Compare-ABootstrapSourceState -Root $captureRoot -Baseline $captureBaseline
    $captureResult.current_inputs_match=$current.matches
    $captureResult.current_source_delta=$current
    $ownFiles=@('backend/internal/systembackupbootstrapsecurity/producer_candidate_binding.go','backend/internal/systembackupbootstrapsecurity/producer_candidate_binding_test.go')
    $ownBefore=@($captureBaseline.files|Where-Object {$_.path -in $ownFiles})
    $ownNow=@(Get-DIndexInputPins -Root $captureRoot -Files $ownFiles)
    $captureResult.target_current_match=(Compare-ABootstrapPins -Expected $ownBefore -Actual $ownNow).matches
    if(-not $captureResult.target_current_match){throw 'A2 target source changed during validation'}
    $captureResult.status='passed_exact_frozen_targeted_scope'
} catch {
    $captureFailure=$_.Exception.Message
    $captureResult.error=$captureFailure
} finally {
    foreach($captureName in $captureEnvNames){[Environment]::SetEnvironmentVariable($captureName,$captureOldEnv[$captureName],'Process')}
    $resolved=[IO.Path]::GetFullPath($captureOwner)
    if([IO.Path]::GetDirectoryName($resolved) -cne $captureRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Test-Path -LiteralPath $resolved) -and ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint))){throw 'Unsafe targeted capture cleanup'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
    $captureResult.owner_removed=-not(Test-Path -LiteralPath $resolved)
    $captureResult.completed_at=[DateTime]::UtcNow.ToString('o')
    $file=[IO.File]::Open(($capturePrefix+'.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $writer=[IO.StreamWriter]::new($file,[Text.UTF8Encoding]::new($false))
    try{$writer.WriteLine(($captureResult|ConvertTo-Json -Depth 10))}finally{$writer.Dispose()}
    Write-Output ('A2_CAPTURE_TARGET_RESULT='+$capturePrefix+'.json')
}
if($captureFailure){throw $captureFailure}
