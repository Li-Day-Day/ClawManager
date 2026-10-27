[CmdletBinding()]
param([string]$CompilationCacheSeed)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$gcFullRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$gcFullID=[guid]::NewGuid().ToString('N')
$gcFullOwner=Join-Path $gcFullRoot ('.tmp-d-index-cache-'+$gcFullID)
$gcFullSource=Join-Path $gcFullOwner 'source'
$gcFullPrefix=Join-Path $gcFullRoot ('docs/evidence/d-gc-full-local-'+$gcFullID)
$gcFullNames=@('GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOPATH','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$gcFullSaved=@{};foreach($gcFullName in $gcFullNames){$gcFullSaved[$gcFullName]=[Environment]::GetEnvironmentVariable($gcFullName,'Process')}
$gcFullFailure=$null;$gcFullResults=@();$gcFullStable=$false
try {
    if(Test-Path -LiteralPath $gcFullOwner){throw 'Owner already exists'}
    [IO.Directory]::CreateDirectory($gcFullOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $gcFullOwner 'owner.txt'),[IO.Path]::GetFileName($gcFullOwner))
    foreach($gcFullDirectory in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $gcFullOwner $gcFullDirectory))|Out-Null}
    & node (Join-Path $PSScriptRoot 'system-backup-d-gc-full-snapshot.mjs') capture $gcFullRoot $gcFullSource ($gcFullPrefix+'-source.json')
    if($LASTEXITCODE -ne 0){throw 'Fresh source snapshot refused'}
    if($CompilationCacheSeed){
        & node (Join-Path $PSScriptRoot 'system-backup-d-gc-full-snapshot.mjs') seed $gcFullRoot $CompilationCacheSeed (Join-Path $gcFullOwner 'cache') ($gcFullPrefix+'-compilation-seed.json')
        if($LASTEXITCODE -ne 0){throw 'Compilation seed failed before starting compiler'}
    }
    $env:GOWORK='off';$env:GOFLAGS='';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $gcFullOwner 'cache';$env:GOTMPDIR=Join-Path $gcFullOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $gcFullOwner 'telemetry'
    $env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location (Join-Path $gcFullSource 'backend')
    try {
        $gcFullSteps=@(
            @{name='adapter';args=@('test','-mod=readonly','-json','-count=1','-timeout=240s','-p=2','-run','^TestDownloadGCFull','./internal/systembackupevidence')},
            @{name='complete';args=@('test','-mod=readonly','-json','-count=1','-timeout=600s','-p=2','./internal/systembackupevidence','./internal/systembackupgcmetadata')},
            @{name='linux-tagged';args=@('test','-mod=readonly','-tags','systembackup_mysql','-c','-o',(Join-Path $gcFullOwner 'gc-full-linux.test'),'./internal/systembackupevidence')}
        )
        foreach($gcFullStep in $gcFullSteps){
            if($gcFullStep.name -eq 'linux-tagged'){$env:GOOS='linux'}
            $gcFullArguments=$gcFullStep.args
            & go @gcFullArguments > ($gcFullPrefix+'-'+$gcFullStep.name+'.jsonl') 2>&1
            $gcFullExit=$LASTEXITCODE
            $gcFullResults+=@([ordered]@{name=$gcFullStep.name;exit_code=$gcFullExit;log=($gcFullPrefix+'-'+$gcFullStep.name+'.jsonl')})
            Write-Output ('GC_FULL_STEP '+$gcFullStep.name+' exit='+$gcFullExit)
            if($gcFullExit -ne 0){throw ('GC full validation failed: '+$gcFullStep.name)}
        }
    } finally {Pop-Location}
    & node (Join-Path $gcFullSource 'scripts/system-backup-d-gc-full-snapshot.mjs') check $gcFullSource ($gcFullPrefix+'-source.json')
    if($LASTEXITCODE -ne 0){throw 'Frozen source postcheck failed'}
    $gcFullStable=$true
} catch {$gcFullFailure=$_.Exception.Message} finally {
    foreach($gcFullName in $gcFullNames){[Environment]::SetEnvironmentVariable($gcFullName,$gcFullSaved[$gcFullName],'Process')}
    if(Test-Path -LiteralPath $gcFullOwner){
        $gcFullResolved=(Resolve-Path -LiteralPath $gcFullOwner).Path
        if([IO.Path]::GetDirectoryName($gcFullResolved) -cne $gcFullRoot -or [IO.Path]::GetFileName($gcFullResolved) -cne ('.tmp-d-index-cache-'+$gcFullID) -or ((Get-Item -Force -LiteralPath $gcFullResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $gcFullResolved 'owner.txt')) -cne [IO.Path]::GetFileName($gcFullResolved)){throw 'Refusing cleanup outside exact run owner'}
        Remove-Item -LiteralPath $gcFullResolved -Recurse -Force
    }
    $gcFullReceipt=[ordered]@{kind='d_gc_full_local_validation.v1';source_manifest=($gcFullPrefix+'-source.json');steps=$gcFullResults;error=$gcFullFailure;frozen_inputs_stable=$gcFullStable;owner=$gcFullOwner;owner_removed=(-not(Test-Path -LiteralPath $gcFullOwner));dependencies_installed=$false;actual_mysql=$false;production_approved=$false}
    [IO.File]::WriteAllText(($gcFullPrefix+'.json'),($gcFullReceipt|ConvertTo-Json -Depth 8))
    Write-Output ('GC_FULL_RECEIPT='+$gcFullPrefix+'.json')
}
if($gcFullFailure){throw $gcFullFailure}
