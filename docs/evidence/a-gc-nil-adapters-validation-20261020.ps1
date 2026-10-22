[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run,[string]$WarmCache='')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefix=Join-Path $PSScriptRoot ('a-gc-nil-adapters-'+$Run)
$owner=Join-Path $root ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $owner 'source'
$environmentNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS','TEMP','TMP')
$saved=@{};foreach($name in $environmentNames){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$expectedRuns=@('TestAGCAuthorityRejectsNilPolicy','TestAGCAuthorityRejectsNilPolicy/interface_nil','TestAGCAuthorityRejectsNilPolicy/pointer_nil','TestAGCRuntimeRejectsNilAbsence','TestAGCRuntimeRejectsNilAbsence/interface_nil','TestAGCRuntimeRejectsNilAbsence/pointer_nil','TestAGCRuntimeRejectsNilAbsence/function_nil','TestAGCAbsenceRejectsNilVerifierBeforeSQL','TestAGCAbsenceRejectsNilVerifierBeforeSQL/interface_nil','TestAGCAbsenceRejectsNilVerifierBeforeSQL/pointer_nil','TestAGCAbsenceRejectsNilVerifierBeforeSQL/function_nil')|Sort-Object
$expectedFailures=@($expectedRuns|Where-Object{$_ -notlike '*/interface_nil'})|Sort-Object
foreach($suffix in @('-native.txt','-source.json','-stages.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing validation evidence'}}
$stages=[Collections.Generic.List[object]]::new()
function Invoke-NilAdapterStage {
    param([string]$Name,[string[]]$Arguments,[switch]$Counterfactual)
    for($attempt=1;$attempt -le 3;$attempt++){
        $stdout=$prefix+'-'+$Name+'-attempt'+$attempt+'.jsonl';$stderr=$prefix+'-'+$Name+'-attempt'+$attempt+'-stderr.txt'
        if((Test-Path -LiteralPath $stdout)-or(Test-Path -LiteralPath $stderr)){throw 'Refusing existing stage output'}
        Write-Host ('STAGE_START name='+$Name+' attempt='+$attempt+' default_vet=yes count=1')
        & 'C:/Program Files/Go/bin/go.exe' @Arguments 1>$stdout 2>$stderr
        $nativeExit=$LASTEXITCODE
        $events=@(Get-Content -LiteralPath $stdout|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
        $failures=@($events|Where-Object{$_.Test -and $_.Action -eq 'fail'}|ForEach-Object{$_.Test}|Sort-Object)
        $buildFailures=@($events|Where-Object{$_.Action -eq 'build-fail' -or $_.FailedBuild})
        $combined=[IO.File]::ReadAllText($stderr)+[IO.File]::ReadAllText($stdout)
        Write-Host ('STAGE_END name='+$Name+' attempt='+$attempt+' exit='+$nativeExit)
        if($nativeExit -ne 0 -and $failures.Count -eq 0 -and $combined -match '(?:vet|asm|compile)\.exe: exit status 0xc000(?:0043|026b)' -and $attempt -lt 3){Write-Host ('KNOWN_TOOL_RETRY stage='+$Name+' same_command=yes');continue}
        if($buildFailures.Count -or @($events|Where-Object{$_.Action -eq 'skip'}).Count){throw 'Build failure or skipped test is not accepted'}
        $ran=@($events|Where-Object{$_.Test -and $_.Action -eq 'run'})
        $ended=@($events|Where-Object{$_.Test -and $_.Action -in @('pass','fail')})
        $runIDs=@($ran|ForEach-Object{$_.Package+'/'+$_.Test}|Sort-Object)
        $endIDs=@($ended|ForEach-Object{$_.Package+'/'+$_.Test}|Sort-Object)
        if(($runIDs -join "`n") -cne ($endIDs -join "`n") -or @($runIDs|Select-Object -Unique).Count -ne $runIDs.Count){throw 'Incomplete/duplicate Go events'}
        if($Counterfactual){
            if($nativeExit -ne 1 -or ($failures -join "`n") -cne ($expectedFailures -join "`n") -or (@($ran.Test|Sort-Object)-join "`n") -cne ($expectedRuns-join "`n")){throw 'Old guards did not fail the exact dependency cases'}
        } else {
            if($nativeExit -ne 0 -or $failures.Count){throw 'Fixed package gate failed'}
            $passedPackages=@($events|Where-Object{-not $_.Test -and $_.Action -eq 'pass'}|ForEach-Object{$_.Package}|Sort-Object)
            $expectedPackages=@('clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence')|Sort-Object
            if(($passedPackages-join "`n") -cne ($expectedPackages-join "`n")){throw 'Two complete packages did not pass'}
            foreach($test in $expectedRuns){if(@($events|Where-Object{$_.Action -eq 'pass' -and $_.Test -ceq $test}).Count -ne 1){throw 'A nil-adapter regression did not pass'}}
        }
        $passed=@($events|Where-Object{$_.Test -and $_.Action -eq 'pass'})
        $stages.Add([ordered]@{name=$Name;attempt=$attempt;exit=$nativeExit;counterfactual=[bool]$Counterfactual;main_pass=@($passed|Where-Object{$_.Test -notlike '*/*'}).Count;all_pass=$passed.Count;failed=$failures;jsonl=[IO.Path]::GetFileName($stdout);stderr=[IO.Path]::GetFileName($stderr);default_vet=$true;count=1})
        Write-Host ('STAGE_ACCEPTED name='+$Name+' counterfactual='+[bool]$Counterfactual+' pass='+$passed.Count+' fail='+$failures.Count)
        return
    }
    throw 'No completed stage'
}
$exitCode=1
Start-Transcript -LiteralPath ($prefix+'-native.txt') -NoClobber|Out-Null
try {
    foreach($dir in @($owner,(Join-Path $owner 'cache'),(Join-Path $owner 'tmp'),(Join-Path $owner 'telemetry'),(Join-Path $owner 'overlays'))){[IO.Directory]::CreateDirectory($dir)|Out-Null}
    [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
    Write-Host ('LOCAL_OWNER nil-adapters='+$owner+' process_id='+$PID)
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64';$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    if($WarmCache){
        $warm=[IO.Path]::GetFullPath($WarmCache)
        $relative=[IO.Path]::GetRelativePath($root,$warm).Replace('\','/')
        if($relative -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}/source/\.tmp-a-evidence-[a-f0-9]{32}/cache$'){throw 'Warm cache must be an existing workspace build cache'}
        $outer=Join-Path $root ($relative.Split('/')[0])
        if([IO.File]::ReadAllText((Join-Path $outer 'owner.txt')) -ne [IO.Path]::GetFileName($outer)){throw 'Warm cache source ownership mismatch'}
        $cursor=$warm
        while($cursor -ne $root){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Warm cache redirected'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
        if(@(Get-ChildItem -LiteralPath $warm -Recurse -Force|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Warm cache contains redirected files'}
        $warmCount=@(Get-ChildItem -LiteralPath $warm -Recurse -File).Count
        foreach($child in Get-ChildItem -LiteralPath $warm -Force){Copy-Item -LiteralPath $child.FullName -Destination $env:GOCACHE -Recurse -Force}
        Write-Host ('WARM_CACHE read_only_source='+$relative+' copied_files='+$warmCount+' count=1 source_or_test_results_reused=no')
    }
    . (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
    $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
    $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8
    Write-Host ('FROZEN files='+$manifest.files.Count+' sha256='+$manifest.source_sha256)
    $replacements=@{}
    foreach($spec in @(
        @{file='gc_authority.go';pairs=@(@{before='nilSystemAdapter(c.Registry.Policy)';after='c.Registry.Policy == nil'},@{before='nilSystemAdapter(v.Verifier)';after='v.Verifier == nil'})},
        @{file='gc_runtime.go';pairs=@(@{before='nilSystemAdapter(c.Absence)';after='c.Absence == nil'})}
    )){
        $target=Join-Path $source ('backend/internal/systembackupevidence/'+$spec.file)
        $old=[IO.File]::ReadAllText($target)
        foreach($pair in $spec.pairs){if([regex]::Matches($old,[regex]::Escape($pair.before)).Count -ne 1){throw 'Counterfactual does not bind an exact guard'};$old=$old.Replace($pair.before,$pair.after)}
        $overlayFile=Join-Path $owner ('overlays/'+$spec.file)
        [IO.File]::WriteAllText($overlayFile,$old,[Text.UTF8Encoding]::new($false));$replacements[$target]=$overlayFile
    }
    $overlay=Join-Path $owner 'overlays/old-guards.json'
    @{Replace=$replacements}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $overlay -Encoding utf8
    Push-Location (Join-Path $source 'backend')
    try {
        Invoke-NilAdapterStage -Name 'old-guards' -Arguments @('test','-json','-count=1','-timeout=900s','-overlay',$overlay,'-run','^TestAGC(AuthorityRejectsNilPolicy|RuntimeRejectsNilAbsence|AbsenceRejectsNilVerifierBeforeSQL)$','./internal/systembackupevidence') -Counterfactual
        Invoke-NilAdapterStage -Name 'fixed-full' -Arguments @('test','-json','-count=1','-timeout=900s','./internal/systembackupsecurity','./internal/systembackupevidence')
    } finally {Pop-Location}
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    Write-Host 'FROZEN_POSTCHECK pass=yes dependencies-installed=no actual-mysql=no'
    $stages|ConvertTo-Json -Depth 7|Set-Content -LiteralPath ($prefix+'-stages.json') -Encoding utf8
    $exitCode=0
} finally {
    try {
        if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($owner)) -ne $root -or [IO.Path]::GetFileName($owner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner)){throw 'Refusing unowned cleanup'}
        if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected cleanup'}
        Get-ChildItem -LiteralPath $owner -Recurse -File -Force|ForEach-Object{$_.IsReadOnly=$false}
        Remove-Item -LiteralPath $owner -Recurse -Force
        Write-Host ('CLEANED owner='+$owner+' removed='+(-not(Test-Path -LiteralPath $owner)))
    } finally {
        foreach($name in $environmentNames){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
        Write-Host ('a_gc_nil_adapters_exit='+$exitCode)
        Stop-Transcript|Out-Null
    }
}
exit $exitCode
