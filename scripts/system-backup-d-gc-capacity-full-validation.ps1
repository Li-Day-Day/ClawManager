[CmdletBinding()]
param([string]$CompilationCacheSeed)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$gcFullRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$gcFullID=[guid]::NewGuid().ToString('N')
$gcFullOwner=Join-Path $gcFullRoot ('.tmp-d-index-cache-'+$gcFullID)
$gcFullSource=Join-Path $gcFullOwner 'source'
$gcFullPrefix=Join-Path $gcFullRoot ('docs/evidence/d-gc-capacity-full-local-'+$gcFullID)
$gcFullNames=@('GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOPATH','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$gcFullSaved=@{};foreach($gcFullName in $gcFullNames){$gcFullSaved[$gcFullName]=[Environment]::GetEnvironmentVariable($gcFullName,'Process')}
$gcFullFailure=$null;$gcFullResults=@();$gcFullStable=$false;$gcFullBinaryHash=$null
try {
    if(Test-Path -LiteralPath $gcFullOwner){throw 'Owner already exists'}
    [IO.Directory]::CreateDirectory($gcFullOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $gcFullOwner 'owner.txt'),[IO.Path]::GetFileName($gcFullOwner))
    foreach($gcFullDirectory in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $gcFullOwner $gcFullDirectory))|Out-Null}
    & node (Join-Path $PSScriptRoot 'system-backup-d-gc-full-snapshot.mjs') capture $gcFullRoot $gcFullSource ($gcFullPrefix+'-source.json')
    if($LASTEXITCODE -ne 0){throw 'Fresh source snapshot refused'}
    if($CompilationCacheSeed){
        $gcFullSeedPath=(Resolve-Path -LiteralPath $CompilationCacheSeed).Path
        $gcFullSeedOwner=[IO.Path]::GetDirectoryName($gcFullSeedPath)
        if([IO.Path]::GetDirectoryName($gcFullSeedOwner) -cne $gcFullRoot -or [IO.Path]::GetFileName($gcFullSeedOwner) -cnotmatch '^\.tmp-d-(index-cache|bootstrap-consumer)-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($gcFullSeedPath) -cne 'cache'){throw 'Unowned compilation source'}
        if(((Get-Item -Force -LiteralPath $gcFullSeedOwner).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected compilation source'}
        & node (Join-Path $PSScriptRoot 'system-backup-d-gc-full-profile-cache-seed.mjs') $gcFullRoot $gcFullSeedPath (Join-Path $gcFullOwner 'cache') > ($gcFullPrefix+'-compilation-seed.json')
        if($LASTEXITCODE -ne 0){throw 'Compilation seed failed before starting compiler'}
    }
    $env:GOWORK='off';$env:GOFLAGS='';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $gcFullOwner 'cache';$env:GOTMPDIR=Join-Path $gcFullOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $gcFullOwner 'telemetry'
    $env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location (Join-Path $gcFullSource 'backend')
    try {
        $gcFullSteps=@(
            @{name='adapter';args=@('test','-mod=readonly','-json','-count=1','-timeout=240s','-p=2','-run','^Test(ConfigMutationCapacityPrepared|DownloadGCFull)','./internal/systembackupevidence','./internal/systembackupsecurity')},
            @{name='complete';args=@('test','-mod=readonly','-json','-count=1','-timeout=2700s','-p=2','./internal/systembackupevidence','./internal/systembackupgcmetadata','./internal/systembackupsecurity')},
            @{name='seeds';args=@('test','-mod=readonly','-tags','systembackup_mysql','-json','-count=1','-timeout=300s','-p=2','-run','^Test(DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed)$','./internal/systembackupevidence')},
            @{name='linux-tagged';args=@('test','-mod=readonly','-tags','systembackup_mysql','-c','-o',(Join-Path $gcFullOwner 'gc-full-linux.test'),'./internal/systembackupevidence')}
        )
        foreach($gcFullStep in $gcFullSteps){
            if($gcFullStep.name -eq 'linux-tagged'){$env:GOOS='linux'}
            $gcFullArguments=$gcFullStep.args
            & go @gcFullArguments > ($gcFullPrefix+'-'+$gcFullStep.name+'.jsonl') 2>&1
            $gcFullExit=$LASTEXITCODE
            if($gcFullStep.name -eq 'linux-tagged' -and $gcFullExit -eq 0){$gcFullBinaryHash=(Get-FileHash -LiteralPath (Join-Path $gcFullOwner 'gc-full-linux.test') -Algorithm SHA256).Hash.ToLowerInvariant()}
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
    $gcFullReceipt=[ordered]@{kind='d_gc_capacity_full_local_validation.v1';source_manifest=($gcFullPrefix+'-source.json');steps=$gcFullResults;error=$gcFullFailure;frozen_inputs_stable=$gcFullStable;owner=$gcFullOwner;owner_removed=(-not(Test-Path -LiteralPath $gcFullOwner));dependencies_installed=$false;linux_binary_sha256=$gcFullBinaryHash;binary_removed=$true;profile_cases=33;cold_group_cases=7;actual_mysql=$false;production_approved=$false}
    [IO.File]::WriteAllText(($gcFullPrefix+'.json'),($gcFullReceipt|ConvertTo-Json -Depth 8))
    Write-Output ('GC_FULL_RECEIPT='+$gcFullPrefix+'.json')
}
if($gcFullFailure){throw $gcFullFailure}
