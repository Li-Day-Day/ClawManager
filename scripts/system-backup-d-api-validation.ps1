[CmdletBinding()]
param([string]$SeedOwner='', [ValidateSet('all','task')][string]$Scope='all', [string]$ResumeOwner='')
$ErrorActionPreference='Stop'
$apiRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$apiID=[guid]::NewGuid().ToString('N')
$apiOwner=Join-Path $apiRoot ('.tmp-d-api-'+$apiID)
if($ResumeOwner){
    $apiResume=(Resolve-Path -LiteralPath $ResumeOwner).Path
    if([IO.Path]::GetDirectoryName($apiResume) -ne $apiRoot -or [IO.Path]::GetFileName($apiResume) -notmatch '^\.tmp-d-api-[a-f0-9]{32}$' -or
      ((Get-Item -LiteralPath $apiResume -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      [IO.File]::ReadAllText((Join-Path $apiResume 'owner.txt')) -ne [IO.Path]::GetFileName($apiResume)){throw 'Untrusted API resume owner'}
    $apiOwner=$apiResume
    $apiID=[IO.Path]::GetFileName($apiResume).Substring('.tmp-d-api-'.Length)
    if($SeedOwner){throw 'Resume cannot replace compilation cache'}
}
$apiSource=Join-Path $apiOwner 'source'
$apiReceipt=Join-Path $apiRoot ('docs/evidence/d-api-native-'+$apiID+'.json')
$apiNames=@('GOCACHE','GOTMPDIR','TEMP','TMP','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOFLAGS','GOWORK','GOOS','GOARCH','CGO_ENABLED','GOMAXPROCS','TEST_TELEMETRY_DIR')
$apiPrior=@{}
foreach($apiName in $apiNames){$apiPrior[$apiName]=[Environment]::GetEnvironmentVariable($apiName,'Process')}
$apiResult=[ordered]@{kind='d_api_local_validation.v1';run_id=$apiID;status='failed';dependencies_installed=$false;remote_contacted=$false;real_chain_run=$false;cleanup_verified=$false;steps=@()}
$apiResult.scope=$Scope
function Invoke-ApiGoStep([string]$Stage,[string[]]$Arguments) {
    $apiLog=Join-Path $apiRoot ('docs/evidence/d-api-native-'+$apiID+'.'+$Stage+'.txt')
    & go @Arguments *> $apiLog
    $apiCode=$LASTEXITCODE
    $apiResult.steps+=@([ordered]@{stage=$Stage;exit_code=$apiCode;log=[IO.Path]::GetFileName($apiLog)})
    Write-Host ('API_STAGE '+$Stage+' exit='+$apiCode)
    if($apiCode -ne 0){throw ('Go step failed: '+$Stage)}
}
try {
    foreach($apiDir in @('source','cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $apiOwner $apiDir))|Out-Null}
    [IO.File]::WriteAllText((Join-Path $apiOwner 'owner.txt'),[IO.Path]::GetFileName($apiOwner))
    Push-Location $apiRoot
    try {$apiFiles=@(& rg --files backend contracts | Where-Object {$_ -notmatch '(?:^|[\\/])(?:node_modules|vendor|cache|dist|build)(?:[\\/]|$)'} | Sort-Object -CaseSensitive)} finally {Pop-Location}
    $apiPins=@()
    foreach($apiFile in $apiFiles){
        $apiInput=Join-Path $apiRoot $apiFile
        $apiTarget=Join-Path $apiSource $apiFile
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($apiTarget))|Out-Null
        $apiHash=(Get-FileHash -LiteralPath $apiInput -Algorithm SHA256).Hash.ToLowerInvariant()
        if(-not $ResumeOwner){Copy-Item -LiteralPath $apiInput -Destination $apiTarget}
        if((Get-FileHash -LiteralPath $apiTarget -Algorithm SHA256).Hash.ToLowerInvariant() -ne $apiHash){throw 'Source changed during API snapshot'}
        $apiPins+=@([ordered]@{path=$apiFile.Replace('\','/');sha256=$apiHash})
    }
    $apiResult.files=$apiPins
    if($ResumeOwner){
        Push-Location $apiSource
        try {$apiFrozenFiles=@(& rg --files backend contracts | Where-Object {$_ -notmatch '(?:^|[\\/])(?:node_modules|vendor|cache|dist|build)(?:[\\/]|$)'} | Sort-Object -CaseSensitive)} finally {Pop-Location}
        if(($apiFiles -join "`n") -ne ($apiFrozenFiles -join "`n")){throw 'API resume source set changed'}
        $apiResult.resumed_after_interrupted_process=$true
        $apiInitialLog=Join-Path $apiRoot ('docs/evidence/d-api-native-'+$apiID+'.task-http.txt')
        if(Test-Path -LiteralPath $apiInitialLog){
            Move-Item -LiteralPath $apiInitialLog -Destination (Join-Path $apiRoot ('docs/evidence/d-api-native-'+$apiID+'.task-http.interrupted.txt')) -ErrorAction Stop
        }
    }
    foreach($apiPin in $apiPins){
        if((Get-FileHash -LiteralPath (Join-Path $apiRoot $apiPin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $apiPin.sha256){throw 'API source changed during freeze'}
    }
    Push-Location $apiRoot
    try {$apiAfterFreeze=@(& rg --files backend contracts | Where-Object {$_ -notmatch '(?:^|[\\/])(?:node_modules|vendor|cache|dist|build)(?:[\\/]|$)'} | Sort-Object -CaseSensitive)} finally {Pop-Location}
    if(($apiFiles -join "`n") -ne ($apiAfterFreeze -join "`n")){throw 'API input set changed during freeze'}
    if($SeedOwner){
        $apiSeed=(Resolve-Path -LiteralPath $SeedOwner).Path
        if([IO.Path]::GetDirectoryName($apiSeed) -ne $apiRoot -or [IO.Path]::GetFileName($apiSeed) -notmatch '^\.tmp-d-bootstrap-entry-[a-f0-9]{32}$' -or
          ((Get-Item -LiteralPath $apiSeed -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
          [IO.File]::ReadAllText((Join-Path $apiSeed 'owner.txt')) -ne [IO.Path]::GetFileName($apiSeed)){throw 'Untrusted read-only compilation seed'}
        # Copy existing compilation objects only. Never write to, consume test
        # results from, or delete the other chat's cache/owner directory.
        $apiCopied=0
        foreach($apiShard in (Get-ChildItem -LiteralPath (Join-Path $apiSeed 'cache') -Directory)){
            if($apiShard.Name -notmatch '^[a-f0-9]{2}$' -or ($apiShard.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe compilation shard'}
            $apiShardTarget=Join-Path $apiOwner ('cache/'+$apiShard.Name)
            [IO.Directory]::CreateDirectory($apiShardTarget)|Out-Null
            foreach($apiObject in (Get-ChildItem -LiteralPath $apiShard.FullName -File)){
                if($apiObject.Name -notmatch '^[a-f0-9]{64}-[ad]$' -or ($apiObject.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe compilation object'}
                try{Copy-Item -LiteralPath $apiObject.FullName -Destination (Join-Path $apiShardTarget $apiObject.Name);$apiCopied++}catch [IO.FileNotFoundException]{}
            }
        }
        $apiResult.seed_objects_copied=$apiCopied
    }
    $env:GOCACHE=Join-Path $apiOwner 'cache';$env:GOTMPDIR=Join-Path $apiOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
    $env:TEST_TELEMETRY_DIR=Join-Path $apiOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')))
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOFLAGS='-mod=readonly -p=1';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS='1'
    Push-Location (Join-Path $apiSource 'backend')
    try {
        Invoke-ApiGoStep 'task-http' @('test','-count=1','-timeout=120s','-v','./internal/systembackupapi')
        if($Scope -eq 'all'){
            Invoke-ApiGoStep 'server-composition' @('test','-count=1','-timeout=120s','-run','TestBackupTaskRouteComposition|TestBackupAPITLS|TestLiveBackupRead','-v','./cmd/server')
            Invoke-ApiGoStep 'bootstrap-requirements' @('test','-count=1','-timeout=120s','-v','./cmd/system-backup-bootstrap')
        }
    } finally {Pop-Location}
    foreach($apiPin in $apiPins){
        if((Get-FileHash -LiteralPath (Join-Path $apiSource $apiPin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $apiPin.sha256){throw 'Frozen API source changed'}
    }
    $apiResult.frozen_source_unchanged=$true
    $apiResult.current_source_matches_snapshot=$true
    foreach($apiPin in $apiPins){
        if(-not(Test-Path -LiteralPath (Join-Path $apiRoot $apiPin.path)) -or (Get-FileHash -LiteralPath (Join-Path $apiRoot $apiPin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $apiPin.sha256){$apiResult.current_source_matches_snapshot=$false}
    }
    Push-Location $apiRoot
    try {$apiAtEnd=@(& rg --files backend contracts | Where-Object {$_ -notmatch '(?:^|[\\/])(?:node_modules|vendor|cache|dist|build)(?:[\\/]|$)'} | Sort-Object -CaseSensitive)} finally {Pop-Location}
    if(($apiFiles -join "`n") -ne ($apiAtEnd -join "`n")){$apiResult.current_source_matches_snapshot=$false}
    $apiResult.status=if($Scope -eq 'all'){'local_transport_and_composition_passed_real_chain_pending'}else{'local_task_submission_passed_real_chain_pending'}
} catch {
    # No command line, credentials, provider errors or database inputs in receipt.
    $apiResult.failure='local_validation_failed'
    throw
} finally {
    foreach($apiName in $apiNames){[Environment]::SetEnvironmentVariable($apiName,$apiPrior[$apiName],'Process')}
    if(Test-Path -LiteralPath $apiOwner){
        $apiResolved=(Resolve-Path -LiteralPath $apiOwner).Path
        if([IO.Path]::GetDirectoryName($apiResolved) -ne $apiRoot -or [IO.Path]::GetFileName($apiResolved) -ne ('.tmp-d-api-'+$apiID) -or
          ((Get-Item -LiteralPath $apiResolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
          [IO.File]::ReadAllText((Join-Path $apiResolved 'owner.txt')) -ne [IO.Path]::GetFileName($apiResolved)){throw 'Unsafe API artifact cleanup target'}
        Remove-Item -LiteralPath $apiResolved -Recurse -Force
    }
    $apiResult.cleanup_verified=-not(Test-Path -LiteralPath $apiOwner)
    $apiResult|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $apiReceipt -Encoding utf8
    Write-Host ('API_RECEIPT '+$apiReceipt)
}
