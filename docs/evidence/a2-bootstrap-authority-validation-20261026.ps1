[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$pinnedRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $pinnedRoot 'scripts/system-backup-a-bootstrap-source.ps1')
. (Join-Path $pinnedRoot 'scripts/system-backup-a-evidence-go-step.ps1')
$pinnedOwner=Join-Path $pinnedRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$pinnedSource=Join-Path $pinnedOwner 'source'
$pinnedPrefix=Join-Path $PSScriptRoot ('a2-bootstrap-authority-native-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
$pinnedEnvNames=@('GOENV','GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TEMP','TMP')
$pinnedOldEnv=@{};foreach($pinnedName in $pinnedEnvNames){$pinnedOldEnv[$pinnedName]=[Environment]::GetEnvironmentVariable($pinnedName,'Process')}
$pinnedBaseline=$null;$pinnedFailure=$null
$pinnedResult=[ordered]@{kind='a2_bootstrap_authority_native.v1';scope='two_full_ordinary_packages_and_two_Linux_compiles_not_producer_tests_or_actual_SQL';status='failed';started_at=[DateTime]::UtcNow.ToString('o');source_files=0;source_sha256='';files=@();steps=@();owner=$pinnedOwner;owner_removed=$false;frozen_postcheck=$false;current_inputs_match=$false;target_current_match=$false;default_vet=$true;dependencies_installed=$false;remote_contacted=$false;actual_SQL=$false;production_approved=$false}
$pinnedValidation=@('docs/evidence/a2-bootstrap-authority-validation-20261026.ps1','scripts/system-backup-a-bootstrap-source.ps1','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-evidence-go-step.ps1','docs/evidence/a2-bootstrap-capture-native-20261026-110655-6428e6cd-step-0.log')
$pinnedResult.validation_inputs=@(Get-DIndexInputPins -Root $pinnedRoot -Files $pinnedValidation)
function Invoke-PinnedStep([string[]]$Arguments){
    $stepLog=$pinnedPrefix+'-step-'+$script:pinnedResult.steps.Count+'.log'
    $writer=[IO.StreamWriter]::new($stepLog,$false,[Text.UTF8Encoding]::new($false))
    $global:LASTEXITCODE=$null
    Write-Output ('A2_PINNED_STEP_START platform='+$env:GOOS+' arguments='+($Arguments -join ' '))
    try{& go @Arguments 2>&1 | ForEach-Object {$writer.WriteLine($_.ToString())}}finally{$writer.Dispose()}
    $nativeExit=$global:LASTEXITCODE
    $script:pinnedResult.steps+=@([ordered]@{command=@('go')+$Arguments;platform=$env:GOOS;native_exit=$nativeExit;log=$stepLog;sha256=(Get-FileHash -LiteralPath $stepLog -Algorithm SHA256).Hash.ToLowerInvariant()})
    Write-Output ('A2_PINNED_STEP_END native_exit='+$nativeExit+' log='+$stepLog)
    if($null -eq $nativeExit -or $nativeExit -ne 0){throw ('Pinned authority native step failed exit='+$nativeExit)}
}
try {
    foreach($dir in @('source','cache','tmp','binary')){[IO.Directory]::CreateDirectory((Join-Path $pinnedOwner $dir))|Out-Null}
    $pinnedBaseline=Get-ABootstrapSourceState -Root $pinnedRoot
    if($pinnedBaseline.missing_required.Count -ne 0){throw 'Missing bootstrap dependency source'}
    $pinnedResult.source_files=$pinnedBaseline.source_files;$pinnedResult.source_sha256=$pinnedBaseline.source_sha256;$pinnedResult.files=$pinnedBaseline.files
    foreach($p in $pinnedBaseline.files){
        $target=Join-Path $pinnedSource $p.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
        Copy-Item -LiteralPath (Join-Path $pinnedRoot $p.path) -Destination $target
        if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.sha256){throw ('Source changed during copy: '+$p.path)}
        (Get-Item -LiteralPath $target).IsReadOnly=$true
    }
    if(-not (Compare-ABootstrapSourceState -Root $pinnedRoot -Baseline $pinnedBaseline).matches){throw 'Source changed during freeze; Go not started'}
    $env:GOENV='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $pinnedOwner 'cache';$env:GOTMPDIR=Join-Path $pinnedOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
    Initialize-AEvidenceTelemetry -Scratch $pinnedOwner
    Write-Output ('A2_PINNED_FROZEN files='+$pinnedBaseline.source_files+' source='+$pinnedBaseline.source_sha256+' owner='+$pinnedOwner)
    Push-Location (Join-Path $pinnedSource 'backend')
    try {
        Invoke-PinnedStep @('test','-json','-count=1','-timeout=10m','./internal/systembackupsecurity','./internal/systembackupbootstrapsecurity')
        $rows=@(Get-Content -LiteralPath $pinnedResult.steps[0].log | ForEach-Object {$_|ConvertFrom-Json})
        if(@($rows|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -ne 0){throw 'Failed/skipped native run'}
        $runs=@($rows|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object {$_.Package+'/'+$_.Test}|Sort-Object -CaseSensitive)
        $passes=@($rows|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Package+'/'+$_.Test}|Sort-Object -CaseSensitive)
        if($runs.Count -eq 0 -or $runs.Count -ne $passes.Count -or @(Compare-Object $runs $passes -CaseSensitive).Count -ne 0 -or @($runs|Select-Object -Unique).Count -ne $runs.Count){throw 'Native test inventory mismatch'}
        $packagePasses=@($rows|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}|ForEach-Object {$_.Package}|Sort-Object -CaseSensitive)
        if($packagePasses.Count -ne 2 -or @($packagePasses|Select-Object -Unique).Count -ne 2 -or $rows[-1].Action -ne 'pass' -or $rows[-1].Test){throw 'Incomplete two-package native run'}
        $requiredRoots=@(Select-String -LiteralPath (Join-Path $pinnedSource 'backend/internal/systembackupsecurity/bootstrap_candidate_authority_test.go') -Pattern '^func (TestPinnedBootstrapCandidateAuthority[A-Za-z0-9]+)\(' | ForEach-Object {'clawreef/internal/systembackupsecurity/'+$_.Matches[0].Groups[1].Value})
        if($requiredRoots.Count -ne 10 -or @($requiredRoots|Where-Object {$_ -cnotin $passes}).Count -ne 0){throw 'Missing A2 pinned authority test root'}
        $priorRows=@(Get-Content -LiteralPath (Join-Path $pinnedRoot 'docs/evidence/a2-bootstrap-capture-native-20261026-110655-6428e6cd-step-0.log') | ForEach-Object {$_|ConvertFrom-Json})
        $priorPasses=@($priorRows|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Package+'/'+$_.Test})
        if($priorPasses.Count -ne 51 -or @($priorPasses|Where-Object {$_ -cnotin $passes}).Count -ne 0){throw 'Original 51 capture relation passes missing'}
        $pinnedResult.package_passes=$packagePasses;$pinnedResult.test_roots=@($rows|Where-Object {$_.Action -eq 'run' -and $_.Test -and $_.Test -notmatch '/'}|ForEach-Object {$_.Package+'/'+$_.Test});$pinnedResult.pass_events=$passes.Count;$pinnedResult.original_capture_passes_preserved=$priorPasses.Count
        $pinnedResult.authority_pass_events=@($passes|Where-Object {$_ -match '/TestPinnedBootstrapCandidateAuthority'}).Count
        $env:GOOS='linux';$pinnedResult.Linux_binaries=@()
        foreach($package in @('systembackupsecurity','systembackupbootstrapsecurity')){
            $binary=Join-Path $pinnedOwner ('binary/'+$package+'.test')
            Invoke-PinnedStep @('test','-c','-o',$binary,('./internal/'+$package))
            $pinnedResult.Linux_binaries+=@([ordered]@{package=$package;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()})
        }
    } finally {Pop-Location}
    if(-not (Compare-ABootstrapSourceState -Root $pinnedSource -Baseline $pinnedBaseline).matches){throw 'Frozen dependency set or bytes changed'}
    $pinnedResult.frozen_postcheck=$true
    $current=Compare-ABootstrapSourceState -Root $pinnedRoot -Baseline $pinnedBaseline
    $pinnedResult.current_inputs_match=$current.matches;$pinnedResult.current_source_delta=$current
    $ownFiles=@('backend/internal/systembackupbootstrapsecurity/producer_candidate_binding.go','backend/internal/systembackupbootstrapsecurity/producer_candidate_binding_test.go','backend/internal/systembackupsecurity/bootstrap_candidate_authority.go','backend/internal/systembackupsecurity/bootstrap_candidate_authority_test.go')
    $ownBefore=@($pinnedBaseline.files|Where-Object {$_.path -in $ownFiles});$ownNow=@(Get-DIndexInputPins -Root $pinnedRoot -Files $ownFiles)
    $pinnedResult.target_current_match=(Compare-ABootstrapPins -Expected $ownBefore -Actual $ownNow).matches
    if(-not $pinnedResult.target_current_match){throw 'A2 target source changed during native validation'}
    $pinnedResult.status='passed_exact_frozen_two_packages'
} catch {
    $pinnedFailure=$_.Exception.Message;$pinnedResult.error=$pinnedFailure
} finally {
    foreach($pinnedName in $pinnedEnvNames){[Environment]::SetEnvironmentVariable($pinnedName,$pinnedOldEnv[$pinnedName],'Process')}
    $resolved=[IO.Path]::GetFullPath($pinnedOwner)
    if([IO.Path]::GetDirectoryName($resolved) -cne $pinnedRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Test-Path -LiteralPath $resolved) -and ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint))){throw 'Unsafe pinned authority cleanup'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
    $pinnedResult.owner_removed=-not(Test-Path -LiteralPath $resolved)
    $pinnedResult.completed_at=[DateTime]::UtcNow.ToString('o')
    $file=[IO.File]::Open(($pinnedPrefix+'.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $writer=[IO.StreamWriter]::new($file,[Text.UTF8Encoding]::new($false))
    try{$writer.WriteLine(($pinnedResult|ConvertTo-Json -Depth 10))}finally{$writer.Dispose()}
    Write-Output ('A2_PINNED_RESULT='+$pinnedPrefix+'.json')
}
if($pinnedFailure){throw $pinnedFailure}
