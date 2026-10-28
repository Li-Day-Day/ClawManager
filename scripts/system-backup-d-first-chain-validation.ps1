[CmdletBinding()]
param([string]$CompilationCacheSeed,[switch]$ApiOnly,[switch]$ExecutionOnly,[switch]$LinuxBuildOnly,[switch]$SkillGateOnly)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
if(@($ApiOnly,$ExecutionOnly,$LinuxBuildOnly,$SkillGateOnly|Where-Object {$_}).Count -gt 1){throw 'Choose one validation profile'}
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskID=[Guid]::NewGuid().ToString('N')
$taskOwner=Join-Path $taskRoot ('.tmp-d-first-chain-'+$taskID)
$taskSource=Join-Path $taskOwner 'source'
$taskPrefix=Join-Path $taskRoot ('docs/evidence/d-first-chain-native-'+$taskID)
$taskReport=[ordered]@{kind='d_first_chain_native.v1';id=$taskID;status='running';dependencies_installed=$false;actual_sql=$false;real_chain_passed=$false;cleanup=$false;steps=@()}
$taskReport.profile=if($SkillGateOnly){'skill-gate'}elseif($LinuxBuildOnly){'linux-build'}elseif($ExecutionOnly){'execution'}elseif($ApiOnly){'api'}else{'api-server'}
$taskReport.head=(& git -C $taskRoot rev-parse HEAD)
$taskReport.pr_head=(& git -C $taskRoot rev-parse origin/pr-1)
$taskReport.script_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$taskReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($taskPrefix+'.json') -Encoding utf8
$taskVars=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$taskSaved=@{};foreach($name in $taskVars){$taskSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
function TaskPins([string]$root,[string[]]$paths){@($paths|ForEach-Object{$p=Join-Path $root $_;$f=Get-Item -LiteralPath $p;if($f.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected source rejected'};[ordered]@{path=$_;size=$f.Length;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}})}
function TaskGo([string]$phase,[string[]]$goArgs){
    & go @goArgs 2>&1 | Tee-Object -FilePath ($taskPrefix+'.'+$phase+'.jsonl') | Out-Null
    $code=$LASTEXITCODE;$taskReport.steps+=@([ordered]@{phase=$phase;command=@('go')+$goArgs;exit=$code})
    $taskReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($taskPrefix+'.json') -Encoding utf8
    if($code -ne 0){throw ('Go failed: '+$phase)}
    if($goArgs[0] -eq 'test'){
        $events=@(Get-Content -LiteralPath ($taskPrefix+'.'+$phase+'.jsonl')|ForEach-Object{try{$_|ConvertFrom-Json}catch{}})
        if(@($events|Where-Object{$_.Action -eq 'pass' -and $_.Test}).Count -eq 0 -or @($events|Where-Object{$_.Action -eq 'fail' -or $_.Action -eq 'skip'}).Count -ne 0){throw ('Invalid test events: '+$phase)}
    }
}
Push-Location $taskRoot
try{
    $paths=@(& rg --files backend contracts|ForEach-Object{$_.Replace('\','/')}|Sort-Object -Unique -CaseSensitive)
    if($LASTEXITCODE -ne 0){throw 'Source enumeration failed'}
    $taskReport.source=TaskPins $taskRoot $paths
    foreach($path in $paths){$dest=Join-Path $taskSource $path;New-Item -ItemType Directory -Force -Path (Split-Path $dest)|Out-Null;Copy-Item -LiteralPath (Join-Path $taskRoot $path) -Destination $dest}
    if((TaskPins $taskSource $paths|ConvertTo-Json -Compress -Depth 5) -cne ($taskReport.source|ConvertTo-Json -Compress -Depth 5)){throw 'Frozen source mismatch'}
    $taskReport.source_precheck=$true
    $env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GO111MODULE='on';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $taskOwner 'cache';$env:GOTMPDIR=Join-Path $taskOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $taskOwner 'telemetry';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    foreach($dir in @($env:GOCACHE,$env:GOTMPDIR,$env:TEST_TELEMETRY_DIR)){New-Item -ItemType Directory -Force -Path $dir|Out-Null}
    if($CompilationCacheSeed){
        $seed=(Resolve-Path -LiteralPath $CompilationCacheSeed).Path
        if(Get-Command robocopy -ErrorAction SilentlyContinue){
            # Copy only: no /MIR, purge, move or writes to the shared seed.
            & robocopy $seed $env:GOCACHE /E /XJ /R:0 /W:0 /MT:8 /NFL /NDL /NJH /NJS /NP | Out-Null
            if($LASTEXITCODE -ge 8){throw 'Compilation cache copy failed'}
        }else{
            Get-ChildItem -LiteralPath $seed -Directory|Where-Object Name -Match '^[0-9a-f]{2}$'|ForEach-Object{Copy-Item -LiteralPath $_.FullName -Destination $env:GOCACHE -Recurse}
        }
    }
    Set-Location -LiteralPath (Join-Path $taskSource 'backend')
    if($SkillGateOnly){
        TaskGo 'skill-gate' @('test','-mod=readonly','-p=2','-count=1','-json','-run','TestMaterializeBackupGate','./internal/services')
    }elseif($LinuxBuildOnly){
        $env:GOOS='linux'
        $binary=Join-Path $taskOwner 'system-backup-controller-linux-amd64'
        TaskGo 'linux-controller-build' @('build','-mod=readonly','-p=2','-o',$binary,'./cmd/system-backup-controller')
        $taskReport.binary=[ordered]@{os='linux';arch='amd64';executed=$false;size=(Get-Item -LiteralPath $binary).Length;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()}
    }elseif($ExecutionOnly){
        TaskGo 'b-public-adapter' @('test','-mod=readonly','-p=2','-count=1','-json','./internal/systembackup/publicadapter','./internal/systembackup/domain','./internal/systembackup/flow','./internal/systembackup/kube')
        TaskGo 'execution-controller' @('test','-mod=readonly','-p=2','-count=1','-json','-run','Test(ExecutionAuthority|TaskExecutionLoop|LeaderLoop|BackupStart|TaskClaim|SQLDeadlineAcquire)','./internal/systembackupcontroller')
        TaskGo 'execution-dispatch' @('test','-mod=readonly','-p=2','-count=1','-json','./internal/systembackupdispatch')
        TaskGo 'execution-main' @('test','-mod=readonly','-p=2','-count=1','-json','-run','Test(TaskExecutionProduction|LeaderControlLoop)','./cmd/system-backup-controller')
        $binary=Join-Path $taskOwner 'system-backup-controller.exe'
        TaskGo 'execution-build' @('build','-mod=readonly','-p=2','-o',$binary,'./cmd/system-backup-controller')
        $taskReport.binary=[ordered]@{size=(Get-Item -LiteralPath $binary).Length;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()}
    }else{
    TaskGo 'api' @('test','-mod=readonly','-p=2','-count=1','-json','./internal/systembackupapi')
    if(-not $ApiOnly){
    TaskGo 'server-tasks' @('test','-mod=readonly','-p=2','-count=1','-json','-run','TestBackupTask(Route|Production|Owner|Details)','./cmd/server')
    $binary=Join-Path $taskOwner 'server.exe'
    TaskGo 'server-build' @('build','-mod=readonly','-p=2','-o',$binary,'./cmd/server')
    $taskReport.binary=[ordered]@{size=(Get-Item -LiteralPath $binary).Length;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    }
    if((TaskPins $taskSource $paths|ConvertTo-Json -Compress -Depth 5) -cne ($taskReport.source|ConvertTo-Json -Compress -Depth 5)){throw 'Frozen source changed'}
    $taskReport.source_postcheck=$true;$taskReport.status='passed'
    $currentPaths=@(& rg --files (Join-Path $taskRoot 'backend') (Join-Path $taskRoot 'contracts')|ForEach-Object{$_.Substring($taskRoot.Length+1).Replace('\','/')}|Sort-Object -Unique -CaseSensitive)
    $taskReport.source_current_match=(($currentPaths -join "`n") -ceq ($paths -join "`n")) -and ((TaskPins $taskRoot $paths|ConvertTo-Json -Compress -Depth 5) -ceq ($taskReport.source|ConvertTo-Json -Compress -Depth 5))
}catch{$taskReport.status='failed';$taskReport.error=$_.Exception.Message}
finally{
    Set-Location -LiteralPath $taskRoot
    foreach($name in $taskVars){[Environment]::SetEnvironmentVariable($name,$taskSaved[$name],'Process')}
    $resolved=[IO.Path]::GetFullPath($taskOwner)
    if($resolved.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -eq ('.tmp-d-first-chain-'+$taskID)){
        if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
        $taskReport.cleanup= -not (Test-Path -LiteralPath $resolved)
    }
    $taskReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($taskPrefix+'.json') -Encoding utf8
    Pop-Location
}
Write-Output ($taskPrefix+'.json')
if($taskReport.status -ne 'passed' -or -not $taskReport.cleanup){exit 1}
