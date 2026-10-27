[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$HandlePath,[Parameter(Mandatory=$true)][string]$CachePath)
$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false
$dRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$dH=Get-Content -Raw -LiteralPath $HandlePath|ConvertFrom-Json
$dOwner=$dH.owner;$dManifest=Join-Path $dRoot $dH.manifest;$dPrefix=Join-Path $dRoot ($dH.prefix+'.windows')
$dHelper=Join-Path $PSScriptRoot 'd1-joint-native-source-20261027.mjs'
$dRunnerHash=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
if([IO.Path]::GetDirectoryName($dOwner) -cne $dRoot -or [IO.File]::ReadAllText((Join-Path $dOwner 'owner.txt')) -cne [IO.Path]::GetFileName($dOwner)){throw 'Invalid private source owner'}
$CachePath=[IO.Path]::GetFullPath($CachePath)
if(-not $CachePath.StartsWith($dRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath $CachePath)){throw 'Expected existing Root CAS cache'}
$dVars=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOMAXPROCS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOTELEMETRY','TEST_TELEMETRY_DIR','TEMP','TMP')
$dPrior=@{};foreach($n in $dVars){$dPrior[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
$dResult=[ordered]@{kind='d1_joint_windows_phase.v1';status='failed';owner=$dOwner;source_manifest=$dH.manifest;source_sha256=$dH.source_sha256;steps=@();other_Go_at_start=@(Get-Process go -ErrorAction SilentlyContinue|ForEach-Object {$_.Id});explicit_Root_schedule='isolated Windows p1 while human completes Linux in separate source and cache';cache=$CachePath;Go_started=$false;source_postcheck=$false;owner_kept_for_Linux_continuation=$true;dependencies_installed=$false;actual_SQL=$false;production_approved=$false;error=$null;runner_sha256=$dRunnerHash}
try{
    & node $dHelper check $dManifest
    if($LASTEXITCODE -ne 0){throw 'Private source precheck rejected'}
    foreach($dir in @('tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $dOwner $dir))|Out-Null}
    $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='1';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTELEMETRY='off';$env:GOCACHE=$CachePath;$env:GOTMPDIR=Join-Path $dOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $dOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location (Join-Path $dH.source 'backend')
    try{
        $dCommands=@(
            ,@('list','-deps','-test','-json','./internal/systembackupcontroller','./internal/systembackupcleanup')
            ,@('test','-json','-count=1','-timeout=300s','./internal/systembackupcontroller','./internal/systembackupcleanup')
        )
        foreach($goArgs in $dCommands){
            $dLog=$dPrefix+'.step-'+$dResult.steps.Count+'.jsonl';[IO.File]::WriteAllText($dLog,'')
            $dResult.Go_started=$true
            & go @goArgs *> $dLog
            $dExit=$LASTEXITCODE
            $dResult.steps+=@([ordered]@{command=@('go')+$goArgs;platform='windows';exit_code=$dExit;log=$dLog;sha256=(Get-FileHash -LiteralPath $dLog -Algorithm SHA256).Hash.ToLowerInvariant()})
            Write-Output ('WINDOWS_STAGE='+$dResult.steps.Count+' exit='+$dExit)
            if($dExit -ne 0){throw 'Joint Windows native failed'}
        }
    }finally{Pop-Location}
    & node $dHelper check $dManifest
    if($LASTEXITCODE -ne 0){throw 'Private source changed during Windows tests'}
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $dRunnerHash){throw 'Windows driver drift'}
    $dResult.source_postcheck=$true;$dResult.status='passed_Windows_packages_pending_Linux_and_cmd_compilation'
}catch{$dResult.error=$_.Exception.Message}finally{
    foreach($n in $dPrior.Keys){[Environment]::SetEnvironmentVariable($n,$dPrior[$n],'Process')}
    [IO.File]::WriteAllText(($dPrefix+'.json'),($dResult|ConvertTo-Json -Depth 8))
    Write-Output ('WINDOWS_PHASE_RESULT='+$dPrefix+'.json')
}
if($dResult.error){throw $dResult.error}
