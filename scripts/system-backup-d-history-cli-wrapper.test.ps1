# Offline orchestration tests only. The scoped go.exe function emits inert
# fixture files; no compiler, SSH, database, or package manager is invoked.
# Remote cases replace only the SSH process boundary in the copied wrapper.
$ErrorActionPreference='Stop'
$testRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot=Join-Path $testRoot ('.tmp-history-cli-wrapper-'+[guid]::NewGuid().ToString('N'))
$mockState=@{mutate=$false;source='';mode='none';probeCalls=0;runnerCalls=0;checks=0;vetCalls=0;delays=[Collections.Generic.List[int]]::new()}
function Start-Sleep {param([int]$Seconds) $mockState.delays.Add($Seconds)}
function go.exe {
    $buildArgs=@($args)
    if($buildArgs[0] -eq 'vet'){
        $mockState.checks++
        $mockState.vetCalls++
        if($mockState.mode -in @('vet-transient','vet-syntax') -and $mockState.vetCalls -eq 1){
            if($mockState.mode -eq 'vet-transient'){Write-Output 'crypto/internal/fips140/aes: C:\Program Files\Go\pkg\tool\windows_amd64\vet.exe: exit status 0xc0000043'}
            else {Write-Output './fixture.go:3: undefined: invalidSymbol'}
            $global:LASTEXITCODE=1
            return
        }
        $global:LASTEXITCODE=0
        return
    }
    $outIndex=[Array]::IndexOf($buildArgs,'-o')
    if($outIndex -ge 0){
        $stage=if($buildArgs[0] -eq 'build'){'runner'}else{'probe'}
        $counter=$stage+'Calls'
        $mockState[$counter]++
        $marker=Join-Path $env:GOCACHE ($stage+'-attempt-marker')
        if($mockState[$counter] -gt 1 -and -not (Test-Path -LiteralPath $marker)){throw 'retry discarded same-run cache'}
        [IO.File]::WriteAllText($marker,'retained')
        $transient=($mockState.mode -eq 'probe-transient' -and $stage -eq 'probe' -and $mockState[$counter] -eq 1) -or ($mockState.mode -eq 'runner-transient' -and $stage -eq 'runner' -and $mockState[$counter] -eq 1)
        $failure=$transient -or ($stage -eq 'probe' -and $mockState.mode -in @('persistent','syntax','mixed','other-code','sharing-source-drift','create-retry-success'))
        if($failure){
            [IO.File]::WriteAllText($buildArgs[$outIndex+1],'partial failed artifact')
            if($mockState.mode -in @('syntax','mixed','create-retry-success')){Write-Output './fixture.go:3: undefined: invalidSymbol'}
            if($mockState.mode -notin @('syntax','create-retry-success')){
                $code=if($mockState.mode -eq 'other-code'){'0xc0000005'}else{'0xc0000043'}
                $failedTool='asm'
                if($mockState.mode -eq 'probe-transient'){
                    Write-Output '# clawreef/internal/db [clawreef/internal/db.test]'
                    $failedTool='compile'
                }
                if($mockState.mode -eq 'runner-transient'){
                    Write-Output '# clawreef/cmd/system-backup-migrate'
                    $failedTool='link'
                }
                Write-Output ('internal/cpu: C:\Program Files\Go\pkg\tool\windows_amd64\'+$failedTool+'.exe: exit status '+$code)
            }
            if($mockState.mode -eq 'sharing-source-drift'){[IO.File]::AppendAllText($mockState.source,"`n// changed during failure")}
            $global:LASTEXITCODE=1
            return
        }
        [IO.File]::WriteAllText($buildArgs[$outIndex+1],'inert test fixture')
    } else {$mockState.checks++}
    if($mockState.mutate -and $buildArgs[0] -eq 'build'){
        [IO.File]::AppendAllText($mockState.source,"`n// simulated concurrent edit")
    }
    $global:LASTEXITCODE=0
}
try {
    [IO.Directory]::CreateDirectory((Join-Path $fixtureRoot 'scripts'))|Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $fixtureRoot 'backend'))|Out-Null
    $fixtureWrapper=Join-Path $fixtureRoot 'scripts/system-backup-d-invariants.ps1'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'system-backup-d-invariants.ps1') -Destination $fixtureWrapper
    $mockState.source=Join-Path $fixtureRoot 'backend/fixture.go'
    [IO.File]::WriteAllText($mockState.source,'package fixture')
    $oldProxy=[Environment]::GetEnvironmentVariable('GOPROXY','Process')
    foreach($drift in @($false,$true)){
        $mockState.mutate=$drift
        $mockState.probeCalls=0; $mockState.runnerCalls=0; $mockState.checks=0; $mockState.delays.Clear()
        $lines=[Collections.Generic.List[string]]::new()
        $caught=$null
        try { & $fixtureWrapper -HistoryCLI | ForEach-Object {$lines.Add([string]$_)} }
        catch { $caught=$_.Exception.Message }
        if($drift){
            if($caught -notlike '*Backend source changed during CLI/probe build*'){throw ("source drift did not reject; caught="+$caught+" output="+($lines -join '|'))}
            if(@($lines|Where-Object {$_ -like 'LOCAL_PASS*'}).Count){throw 'source drift reported success'}
        } else {
            if($caught){throw $caught}
            if(@($lines|Where-Object {$_ -like 'HISTORY_CLI_BINARY_SHA256=*'}).Count -ne 1 -or @($lines|Where-Object {$_ -like 'HISTORY_CLI_SOURCE_SHA256=*'}).Count -ne 1){throw 'runner/source pins absent'}
            if(@($lines|Where-Object {$_ -like 'LOCAL_PASS*real_mysql=not_run'}).Count -ne 1){throw 'local result missing or claims real MySQL'}
        }
        if(@(Get-ChildItem -LiteralPath $fixtureRoot -Directory -Filter '.tmp-d-invariants-*').Count){throw 'wrapper scratch leaked'}
        if(([string][Environment]::GetEnvironmentVariable('GOPROXY','Process')) -cne ([string]$oldProxy)){throw 'wrapper environment not restored'}
        Write-Output "PASS wrapper-mock source-drift=$drift cleanup=true environment-restored=true"
    }
    $mockState.mutate=$false
    foreach($mode in @('vet-transient','vet-syntax')){
        $mockState.mode=$mode; $mockState.probeCalls=0; $mockState.runnerCalls=0; $mockState.checks=0; $mockState.vetCalls=0; $mockState.delays.Clear()
        $lines=[Collections.Generic.List[string]]::new(); $caught=$null
        try {& $fixtureWrapper -HistoryCLI | ForEach-Object {$lines.Add([string]$_)}}
        catch {$caught=$_.Exception.Message}
        if($mode -eq 'vet-transient'){
            if($caught -or $mockState.vetCalls -ne 3 -or ($mockState.delays -join ',') -ne '2' -or @($lines | Where-Object {$_ -like 'LOCAL_PASS*'}).Count -ne 1){throw "vet sharing retry failed: caught=$caught calls=$($mockState.vetCalls) delays=$($mockState.delays -join ',') output=$($lines -join '|')"}
        } else {
            if($caught -notlike 'D serial vet failed after 1 attempt*' -or $mockState.vetCalls -ne 1 -or $mockState.delays.Count -ne 0 -or @($lines | Where-Object {$_ -like 'LOCAL_PASS*'}).Count){throw 'non-sharing vet failure retried or passed'}
        }
        if(@(Get-ChildItem -LiteralPath $fixtureRoot -Force -Directory -Filter '.tmp-d-invariants-*').Count){throw 'vet retry scratch leaked'}
        Write-Output "PASS wrapper-mock vet=$mode calls=$($mockState.vetCalls) cleanup=true"
    }
    $mockState.mutate=$false
    foreach($mode in @('none','probe-transient','runner-transient','persistent','syntax','mixed','other-code','sharing-source-drift')){
        $mockState.mode=$mode; $mockState.probeCalls=0; $mockState.runnerCalls=0; $mockState.checks=0; $mockState.delays.Clear()
        $lines=[Collections.Generic.List[string]]::new(); $caught=$null
        try {& $fixtureWrapper -HistoryCLI -BuildOnly | ForEach-Object {$lines.Add([string]$_)}}
        catch {$caught=$_.Exception.Message}
        $pass=$mode -in @('none','probe-transient','runner-transient')
        if($pass){
            if($caught){throw $caught}
            if(@($lines|Where-Object {$_ -like 'LOCAL_PASS unit-tests=skipped vet=skipped*'}).Count -ne 1){throw 'BuildOnly misreported tests/vet'}
        } else {
            $expectedError=if($mode -eq 'sharing-source-drift'){'*source changed after compiler failure*'}else{'*build failed after*'}
            if($caught -notlike $expectedError){throw ("wrong failure: "+$mode+' / '+$caught)}
            if(@($lines|Where-Object {$_ -like 'LOCAL_PASS*'}).Count){throw 'failed build reported success'}
        }
        $expectedProbe=switch($mode){'probe-transient'{2};'persistent'{3};default{1}}
        $expectedRunner=if($mode -eq 'runner-transient'){2}elseif($pass){1}else{0}
        $expectedDelays=switch($mode){'probe-transient'{'2'};'runner-transient'{'2'};'persistent'{'2,4'};default{''}}
        if($mockState.probeCalls -ne $expectedProbe -or $mockState.runnerCalls -ne $expectedRunner -or ($mockState.delays -join ',') -ne $expectedDelays -or $mockState.checks -ne 0){throw ('unexpected retry/check count: '+$mode)}
        if(@(Get-ChildItem -LiteralPath $fixtureRoot -Force -Directory -Filter '.tmp-d-invariants-*').Count){throw 'retry scratch leaked'}
        if(([string][Environment]::GetEnvironmentVariable('GOPROXY','Process')) -cne ([string]$oldProxy)){throw 'retry environment not restored'}
        Write-Output "PASS wrapper-mock build-only=$mode probe-attempts=$expectedProbe runner-attempts=$expectedRunner cleanup=true"
    }
    $wrapperText=[IO.File]::ReadAllText($fixtureWrapper)
    $parseTokens=$null; $parseErrors=$null
    $wrapperAST=[Management.Automation.Language.Parser]::ParseInput($wrapperText,[ref]$parseTokens,[ref]$parseErrors)
    if($parseErrors.Count){throw 'wrapper parse failed'}
    $sshFunction=$wrapperAST.Find({param($ast) $ast -is [Management.Automation.Language.FunctionDefinitionAst] -and $ast.Name -eq 'Invoke-ProbeSshCommand'},$false)
    if(-not $sshFunction){throw 'SSH process boundary missing'}
    $sshMock=@'
function Invoke-ProbeSshCommand {
    param([string]$Command)
    $mockState.sshCommands.Add($Command)
    $mockState.sshOptions=@($probeSshOptions)
    if($Command -match 'D_PROBE_SSH_READY_[0-9a-f]{32}'){
        $marker=$Matches[0]
        if($mockState.mode -like '*-exit'){return @{ExitCode=255;Lines=@()}}
        if($mockState.mode -like '*-marker'){return @{ExitCode=0;Lines=@('unrelated banner')}}
        if($mockState.mode -eq 'check-throw'){throw 'mock SSH launch failure'}
        return @{ExitCode=0;Lines=@('login banner',$marker)}
    }
    if($Command -match 'get pods -l app=clawmanager-app'){
        if($mockState.mode -eq 'check-image-mismatch'){
            return @{ExitCode=0;Lines=@('containerd://10.130.14.23:5000/clawmanager@sha256:4f8ed9600eff963103feec1fcc23f37397ef48ce3961e7542c41e4e0faed7cdd')}
        }
        return @{ExitCode=0;Lines=@('containerd://10.130.14.23:5000/clawmanager@sha256:1ba8cc47f468610e6875117f75fe42ce9fdb15e1cd2e6f877ac8ff2f99e2baa0')}
    }
    if($Command -match 'D_PROBE_SCRATCH_READY_[0-9a-f]{32}'){
        $marker=$Matches[0]
        if($mockState.mode -eq 'create-retry-success' -and $mockState.sshCommands.Count -eq 3){return @{ExitCode=0;Lines=@($marker)}}
        if($mockState.mode -in @('create-retry-success','create-retry-exhausted')){return @{ExitCode=255;Lines=@();Diagnostics=@('Connection closed by 10.130.14.23 port 22')}}
        if($mockState.mode -eq 'create-auth-denied'){return @{ExitCode=255;Lines=@();Diagnostics=@('Permission denied','Connection closed by 10.130.14.23 port 22')}}
        if($mockState.mode -eq 'create-foreign-owner'){return @{ExitCode=73;Lines=@()}}
        if($mockState.mode -eq 'create-no-ack'){return @{ExitCode=0;Lines=@()}}
        return @{ExitCode=255;Lines=@()}
    }
    if($Command -match 'D_PROBE_SCRATCH_CLEAN_[0-9a-f]{32}'){
        $marker=$Matches[0]
        if($mockState.mode -eq 'create-lost-unclean'){return @{ExitCode=1;Lines=@()}}
        if($mockState.mode -eq 'create-lost-throw'){throw 'mock cleanup launch failure'}
        if($mockState.mode -eq 'create-lost-no-ack'){return @{ExitCode=0;Lines=@()}}
        return @{ExitCode=0;Lines=@($marker)}
    }
    throw 'unexpected SSH command; test execution must not start'
}
'@
    [IO.File]::WriteAllText($fixtureWrapper,$wrapperText.Replace($sshFunction.Extent.Text,$sshMock))
    foreach($file in @('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-history-cli-phase.sh','backend/internal/systembackupcontroller/bootstrap.go','backend/internal/db/migrations/fixture.sql')){
        $fixtureFile=Join-Path $fixtureRoot $file
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($fixtureFile))|Out-Null
        [IO.File]::WriteAllText($fixtureFile,'inert transport fixture')
    }
    $mockState.sshCommands=[Collections.Generic.List[string]]::new()
    foreach($mode in @('check-pass','check-image-mismatch','check-exit','check-marker','check-throw','remote-exit','remote-marker','create-lost-clean','create-lost-unclean','create-lost-throw','create-lost-no-ack','create-retry-success','create-retry-exhausted','create-auth-denied','create-foreign-owner','create-no-ack')){
        $mockState.mode=$mode; $mockState.probeCalls=0; $mockState.runnerCalls=0; $mockState.checks=0; $mockState.sshCommands.Clear(); $mockState.delays.Clear()
        $lines=[Collections.Generic.List[string]]::new(); $caught=$null
        try {
            if($mode -like 'check-*'){& $fixtureWrapper -CheckRemote -Verbose:($mode -eq 'check-pass') | ForEach-Object {$lines.Add([string]$_)}}
            else {& $fixtureWrapper -HistoryCLI -BuildOnly -Remote | ForEach-Object {$lines.Add([string]$_)}}
        } catch {$caught=$_.Exception.Message}
        $creation=$mode -like 'create-*'
        if($mode -eq 'check-pass'){
            if($caught -or @($lines | Where-Object {$_ -like 'D_PROBE_SSH_PREFLIGHT_PASS*'}).Count -ne 1 -or @($lines | Where-Object {$_ -like 'D_PROBE_IMAGE_PREFLIGHT_PASS*'}).Count -ne 1){throw 'check-only success missing'}
        } elseif($mode -eq 'check-image-mismatch'){
            if($caught -notlike 'Source app digest is 4f8ed960*Rerun with -ExpectedAppDigest*' -or @($lines | Where-Object {$_ -like 'LOCAL_PASS*'}).Count){throw 'mismatched image was not rejected before build'}
        } elseif($mode -eq 'check-throw'){
            if($caught -ne 'mock SSH launch failure'){throw 'SSH launch failure swallowed'}
        } elseif(-not $creation){
            if($caught -notlike 'SSH command preflight failed*'){throw ('wrong preflight failure: '+$caught)}
        } else {
            $cleanupFails=$mode -in @('create-lost-unclean','create-lost-throw','create-lost-no-ack')
            $expectedError=if($cleanupFails){'Remote probe scratch cleanup is unverified*'}elseif($mode -eq 'create-retry-success'){'Linux integration-probe build failed after 1*'}else{'Remote scratch creation unconfirmed*'}
            if($caught -notlike $expectedError){throw ('wrong scratch failure: '+$caught)}
            $cleanOutput=@($lines | Where-Object {$_ -eq 'CLEANED remote-probe-scratch=yes'}).Count
            if($cleanOutput -ne [int](-not $cleanupFails)){throw 'unverified cleanup claimed success'}
            $cleanupCommand=$mockState.sshCommands[$mockState.sshCommands.Count-1]
            if($cleanupCommand -notmatch 'cmp -s' -or $cleanupCommand -notmatch 'test ! -L' -or $cleanupCommand -notmatch '/.owner'){throw 'cleanup ownership guard missing'}
            if(@($lines | Where-Object {$_ -like 'D_PROBE_REMOTE_SCRATCH path=* owner=*'}).Count -ne 1){throw 'scratch identity not logged'}
        }
        $expectedBuilds=if($mode -eq 'create-retry-success'){1}else{0}
        $expectedSSH=if($mode -eq 'create-retry-success'){4}elseif($mode -eq 'create-retry-exhausted'){5}elseif($creation){3}elseif($mode -in @('check-pass','check-image-mismatch')){2}else{1}
        $expectedDelays=if($mode -eq 'create-retry-success'){'2'}elseif($mode -eq 'create-retry-exhausted'){'2,4'}else{''}
        if(($mockState.delays -join ',') -ne $expectedDelays){throw 'unexpected SSH retry delays'}
        if($mode -like 'create-retry-*'){
            $createCalls=@($mockState.sshCommands | Where-Object {$_ -match 'D_PROBE_SCRATCH_READY_'})
            if(@($createCalls | Select-Object -Unique).Count -ne 1){throw 'SSH retry changed owner/command'}
        }
        if($mockState.sshOptions -notcontains 'StrictHostKeyChecking=yes' -or $mockState.sshOptions -notcontains 'NumberOfPasswordPrompts=1' -or ($mode -eq 'check-pass' -and $mockState.sshOptions -notcontains '-v')){throw 'SSH diagnostic/authentication options changed'}
        if($mockState.probeCalls -ne $expectedBuilds -or $mockState.runnerCalls -ne 0 -or $mockState.checks -ne 0 -or $mockState.sshCommands.Count -ne $expectedSSH){throw ('unexpected preflight/build/SSH calls: '+$mode)}
        if(@(Get-ChildItem -LiteralPath $fixtureRoot -Force -Directory -Filter '.tmp-d-invariants-*').Count){throw 'SSH failure leaked local scratch'}
        if(([string][Environment]::GetEnvironmentVariable('GOPROXY','Process')) -cne ([string]$oldProxy)){throw 'SSH failure left changed environment'}
        Write-Output "PASS wrapper-mock ssh=$mode local-cleanup=true"
    }
} finally {
    if(Test-Path -LiteralPath $fixtureRoot){
        $resolved=(Resolve-Path -LiteralPath $fixtureRoot).Path
        if($resolved -ne $fixtureRoot -or -not $resolved.StartsWith($testRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Refusing fixture cleanup outside workspace'}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
