[CmdletBinding()]
param([string]$CompilationCacheSeed,[Parameter(Mandatory=$true)][string]$FrozenSourceBase,[switch]$RemoveOwnedStaging)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$gcFullRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gcFullID=[guid]::NewGuid().ToString('N')
$gcFullOwner=Join-Path $gcFullRoot ('.tmp-d-index-cache-'+$gcFullID)
$gcFullSource=Join-Path $gcFullOwner 'source'
$gcFullPrefix=Join-Path $gcFullRoot ('docs/evidence/d-gc-full-supplement-'+$gcFullID)
$gcFullNames=@('GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOPATH','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$gcFullSaved=@{};foreach($gcFullName in $gcFullNames){$gcFullSaved[$gcFullName]=[Environment]::GetEnvironmentVariable($gcFullName,'Process')}
$gcFullFailure=$null;$gcFullResults=@();$gcFullStable=$false;$gcFullBinaryHash=$null
try {
    if(Test-Path -LiteralPath $gcFullOwner){throw 'Owner already exists'}
    [IO.Directory]::CreateDirectory($gcFullOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $gcFullOwner 'owner.txt'),[IO.Path]::GetFileName($gcFullOwner))
    foreach($gcFullDirectory in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $gcFullOwner $gcFullDirectory))|Out-Null}
    & node (Join-Path $gcFullRoot 'scripts/system-backup-d-gc-frozen-supplement-snapshot.mjs') $gcFullRoot $FrozenSourceBase $gcFullSource ($gcFullPrefix+'-source.json')
    if($LASTEXITCODE -ne 0){throw 'Fresh source snapshot refused'}
    if($CompilationCacheSeed){
        $gcFullSeedPath=(Resolve-Path -LiteralPath $CompilationCacheSeed).Path
        $gcFullSeedOwner=[IO.Path]::GetDirectoryName($gcFullSeedPath)
        if([IO.Path]::GetDirectoryName($gcFullSeedOwner) -cne $gcFullRoot -or [IO.Path]::GetFileName($gcFullSeedOwner) -cnotmatch '^\.tmp-d-(index-cache|bootstrap-consumer)-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($gcFullSeedPath) -cne 'cache'){throw 'Unowned compilation source'}
        if(((Get-Item -Force -LiteralPath $gcFullSeedOwner).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected compilation source'}
        & node (Join-Path $gcFullRoot 'scripts/system-backup-d-gc-full-profile-cache-seed.mjs') $gcFullRoot $gcFullSeedPath (Join-Path $gcFullOwner 'cache') > ($gcFullPrefix+'-compilation-seed.json')
        if($LASTEXITCODE -ne 0){throw 'Compilation seed failed before starting compiler'}
    }
    $env:GOWORK='off';$env:GOFLAGS='';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $gcFullOwner 'cache';$env:GOTMPDIR=Join-Path $gcFullOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $gcFullOwner 'telemetry'
    $env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location (Join-Path $gcFullSource 'backend')
    try {
        $gcFullSteps=@(
            @{name='evidence';args=@('test','-mod=readonly','-json','-count=1','-timeout=2700s','-p=2','./internal/systembackupevidence')},
            @{name='metadata';args=@('test','-mod=readonly','-json','-count=1','-timeout=300s','-p=2','./internal/systembackupgcmetadata')},
            @{name='seeds';args=@('test','-mod=readonly','-tags','systembackup_mysql','-json','-count=1','-timeout=300s','-p=2','-run','^Test(DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed|DBootstrapOriginalMaterialsMySQLSeed)$','./internal/systembackupevidence')},
            @{name='linux-tagged';args=@('test','-mod=readonly','-p=2','-tags','systembackup_mysql','-c','-o',(Join-Path $gcFullOwner 'gc-full-linux.test'),'./internal/systembackupevidence')},
            @{name='linux-server';args=@('build','-mod=readonly','-p=2','-o',(Join-Path $gcFullOwner 'linux-server'),'./cmd/server')},
            @{name='linux-bootstrap';args=@('build','-mod=readonly','-p=2','-o',(Join-Path $gcFullOwner 'linux-bootstrap'),'./cmd/system-backup-bootstrap')},
            @{name='linux-nonce';args=@('test','-mod=readonly','-p=2','-c','-o',(Join-Path $gcFullOwner 'linux-nonce.test'),'./internal/systembackupnoncebootstrap')},
            @{name='linux-ca';args=@('test','-mod=readonly','-p=2','-c','-o',(Join-Path $gcFullOwner 'linux-ca.test'),'./internal/systembackupcatrust')}
        )
        foreach($gcFullStep in $gcFullSteps){
            if($gcFullStep.name -like 'linux-*'){$env:GOOS='linux'}
            $gcFullArguments=$gcFullStep.args
            & go @gcFullArguments > ($gcFullPrefix+'-'+$gcFullStep.name+'.jsonl') 2>&1
            $gcFullExit=$LASTEXITCODE
            if($gcFullStep.name -eq 'linux-tagged' -and $gcFullExit -eq 0){$gcFullBinaryHash=(Get-FileHash -LiteralPath (Join-Path $gcFullOwner 'gc-full-linux.test') -Algorithm SHA256).Hash.ToLowerInvariant()}
            $gcFullStepBinaryHash=$null
            if($gcFullStep.name -like 'linux-*' -and $gcFullExit -eq 0){$gcFullOutputIndex=[array]::IndexOf($gcFullArguments,'-o')+1;$gcFullStepBinaryHash=(Get-FileHash -LiteralPath $gcFullArguments[$gcFullOutputIndex] -Algorithm SHA256).Hash.ToLowerInvariant()}
            $gcFullResults+=@([ordered]@{name=$gcFullStep.name;exit_code=$gcFullExit;log=($gcFullPrefix+'-'+$gcFullStep.name+'.jsonl');binary_sha256=$gcFullStepBinaryHash})
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
    $gcFullStaging=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($FrozenSourceBase))
    if($RemoveOwnedStaging -and (Test-Path -LiteralPath $gcFullStaging)){
        $gcFullStagingResolved=(Resolve-Path -LiteralPath $gcFullStaging).Path
        if([IO.Path]::GetDirectoryName($gcFullStagingResolved) -cne $gcFullRoot -or [IO.Path]::GetFileName($gcFullStagingResolved) -cnotmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or $gcFullStagingResolved -ceq $gcFullOwner -or [IO.Path]::GetFileName([IO.Path]::GetFullPath($FrozenSourceBase)) -cne 'source' -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($CompilationCacheSeed)) -cne $gcFullStagingResolved -or ((Get-Item -Force -LiteralPath $gcFullStagingResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $gcFullStagingResolved 'owner.txt')) -cne [IO.Path]::GetFileName($gcFullStagingResolved)){throw 'Refusing staging cleanup outside exact declared GC owner'}
        Remove-Item -LiteralPath $gcFullStagingResolved -Recurse -Force
    }
    $gcFullReceipt=[ordered]@{kind='d_gc_full_supplement_validation.v1';driver_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();source_manifest=($gcFullPrefix+'-source.json');steps=$gcFullResults;error=$gcFullFailure;frozen_inputs_stable=$gcFullStable;owner=$gcFullOwner;owner_removed=(-not(Test-Path -LiteralPath $gcFullOwner));staging_owner=$gcFullStaging;staging_cleanup_requested=[bool]$RemoveOwnedStaging;staging_owner_removed=(-not(Test-Path -LiteralPath $gcFullStaging));dependencies_installed=$false;linux_binary_sha256=$gcFullBinaryHash;binary_removed=$true;profile_cases=33;cold_group_cases=7;bootstrap_original_local_seed_only=$true;bootstrap_actual_cases_executed=0;actual_mysql=$false;production_approved=$false}
    [IO.File]::WriteAllText(($gcFullPrefix+'.json'),($gcFullReceipt|ConvertTo-Json -Depth 8))
    Write-Output ('GC_FULL_RECEIPT='+$gcFullPrefix+'.json')
}
if($gcFullFailure){throw $gcFullFailure}
