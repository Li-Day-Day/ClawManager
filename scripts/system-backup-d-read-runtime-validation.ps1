[CmdletBinding()]
param(
    [string]$SeedCache='',
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [ValidateSet('./internal/systembackupread','./cmd/server','./internal/db')]
    [string[]]$TestPackages=@('./internal/systembackupread','./cmd/server','./internal/db')
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$readRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$readID=[guid]::NewGuid().ToString('N')
$readOwned=Join-Path $readRoot ('.tmp-d-index-cache-'+$readID)
$readSource=Join-Path $readOwned 'source'
$readNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TEMP','TMP')
$readPrior=@{}
foreach($readName in $readNames){$readPrior[$readName]=[Environment]::GetEnvironmentVariable($readName,'Process')}
$readResult=[ordered]@{kind='d_read_runtime_local_validation.v1';status='failed';source_sha256='';packages=@($TestPackages|ForEach-Object {$_.Replace('./','clawreef/')});windows_tests=$false;linux_server_build=$false;mysql_probe_compiled=$false;http_mysql_probe_compiled=$false;actual_mysql_run=$false;dependencies_installed=$false;remote_contacted=$false;cleanup_verified=$false;seed_cache_used=$false}
$readResult.build_parallelism=$BuildParallelism
$readReceipt=Join-Path $readRoot ('docs/evidence/d-read-runtime-local-'+$readID+'.json')
$readResult.stage='source_freeze'
$readOutput=New-Object 'System.Collections.Generic.List[string]'
function Invoke-ReadRuntimeGoStep([string[]]$Arguments,[string]$Stage) {
    $readResult.stage=$Stage
    $readOutput.Clear()
    Write-Host ('LOCAL_STAGE '+$Stage)
    Invoke-AEvidenceGoStep -Arguments $Arguments -Stage $Stage 6>&1 | ForEach-Object {
        $readLine=$_.ToString()
        $readOutput.Add($readLine)
        Write-Host $readLine
    }
}
function Get-ReadRuntimeFiles([string]$Root) {
    Push-Location $Root
    try {
        $readFiles=@(& rg --files backend contracts deployments)
        if($LASTEXITCODE -ne 0){throw 'Cannot enumerate read-runtime build inputs'}
        return @((@($readFiles|ForEach-Object {$_.Replace('\','/')}|Where-Object {
            $_ -match '\.(go|mod|sum|json|sql|yaml|yml|conf|js|sh)$' -and $_ -notmatch '(?:^|/)(?:node_modules|vendor|cache|dist|build)(?:/|$)'
        })+@('scripts/system-backup-d-read-runtime-validation.ps1','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-evidence-go-step.ps1'))|Sort-Object -CaseSensitive)
    } finally {Pop-Location}
}
try {
    Write-Host 'LOCAL_STAGE source_freeze'
    foreach($readFolder in @('cache','tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $readOwned $readFolder))|Out-Null}
    [IO.File]::WriteAllText((Join-Path $readOwned 'owner.txt'),[IO.Path]::GetFileName($readOwned))
    if($SeedCache){
        $readSeed=[IO.Path]::GetFullPath($SeedCache)
        if([IO.Path]::GetDirectoryName($readSeed) -ne $readRoot -or [IO.Path]::GetFileName($readSeed) -notmatch '^\.tmp-d-read-cache-seed-[a-f0-9]{32}$' -or
          ((Get-Item -Force -LiteralPath $readSeed).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
          [IO.File]::ReadAllText((Join-Path $readSeed 'owner.txt')) -ne [IO.Path]::GetFileName($readSeed)){throw 'Untrusted cache seed directory'}
        foreach($readCacheDirectory in (Get-ChildItem -LiteralPath (Join-Path $readSeed 'cache') -Directory)){
            if($readCacheDirectory.Name -notmatch '^[0-9a-f]{2}$' -or ($readCacheDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Redirected cache seed entry'}
            Copy-Item -LiteralPath $readCacheDirectory.FullName -Destination (Join-Path $readOwned 'cache') -Recurse -Force
        }
        $readResult.seed_cache_used=$true
    }
    # Freeze actual Go/fixture/manifest inputs, excluding unrelated agents'
    # scripts and evidence files that change while this test is running.
    $readFiles=Get-ReadRuntimeFiles $readRoot
    $readPins=Get-DIndexInputPins -Root $readRoot -Files $readFiles
    foreach($readPin in $readPins){
        $readTarget=Join-Path $readSource $readPin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($readTarget))|Out-Null
        Copy-Item -LiteralPath (Join-Path $readRoot $readPin.path) -Destination $readTarget
        if((Get-FileHash -Algorithm SHA256 -LiteralPath $readTarget).Hash.ToLowerInvariant() -ne $readPin.sha256){throw 'Read-runtime input changed during copy'}
        (Get-Item -LiteralPath $readTarget).IsReadOnly=$true
    }
    $readDigest=Get-DIndexPinDigest -Pins $readPins
    if(($readFiles -join "`n") -ne ((Get-ReadRuntimeFiles $readRoot) -join "`n") -or $readDigest -ne (Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $readRoot -Files $readFiles))){throw 'Read-runtime source changed during freeze'}
    $readSnapshot=[ordered]@{source_sha256=$readDigest;files=$readPins}
    $readResult.source_sha256=$readSnapshot.source_sha256
    $readResult.source_files=$readSnapshot.files.Count
    $readResult.files=$readSnapshot.files
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS=('-mod=readonly -p='+$BuildParallelism)
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOCACHE=Join-Path $readOwned 'cache';$env:GOTMPDIR=Join-Path $readOwned 'tmp'
    $env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
    $env:TEST_TELEMETRY_DIR=Join-Path $readOwned 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $readTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR | Out-String | ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $readTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($readTelemetry.GOTELEMETRYDIR) -ne $env:TEST_TELEMETRY_DIR){throw 'Go telemetry is not isolated'}
    Push-Location (Join-Path $readSource 'backend')
    try {
        Invoke-ReadRuntimeGoStep -Arguments (@('test','-count=1','-timeout=180s','-v')+$TestPackages) -Stage 'test-vet'
        $readResult.windows_tests=$true
        $env:GOOS='linux'
        Invoke-ReadRuntimeGoStep -Arguments @('build','-trimpath','-buildvcs=false','-o',(Join-Path $readOwned 'binary/server'),'./cmd/server') -Stage 'server-build'
        $readResult.linux_server_build=$true
        Invoke-ReadRuntimeGoStep -Arguments @('test','-c','-trimpath','-buildvcs=false','-tags=systembackup_integration','-o',(Join-Path $readOwned 'binary/db.test'),'./internal/db') -Stage 'mysql-probe-build'
        $readResult.mysql_probe_compiled=$true
        Invoke-ReadRuntimeGoStep -Arguments @('test','-c','-trimpath','-buildvcs=false','-tags=systembackup_mysql','-o',(Join-Path $readOwned 'binary/server-read.test'),'./cmd/server') -Stage 'mysql-probe-build'
        $readResult.http_mysql_probe_compiled=$true
    } finally {Pop-Location}
    if(($readFiles -join "`n") -ne ((Get-ReadRuntimeFiles $readSource) -join "`n") -or $readDigest -ne (Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $readSource -Files $readFiles))){throw 'Frozen read-runtime source postcheck failed'}
    $readResult.status='local_runtime_tests_and_linux_build_passed_live_mysql_pending'
    $readResult.stage='complete'
} catch {
    $readResult.error=$_.Exception.Message
    $readResult.failure_tail=@($readOutput|Select-Object -Last 80)
    throw
} finally {
    foreach($readName in $readNames){[Environment]::SetEnvironmentVariable($readName,$readPrior[$readName],'Process')}
    if(Test-Path -LiteralPath $readOwned){
        $readResolved=(Resolve-Path -LiteralPath $readOwned).Path
        if([IO.Path]::GetDirectoryName($readResolved) -ne $readRoot -or [IO.Path]::GetFileName($readResolved) -ne ('.tmp-d-index-cache-'+$readID) -or ((Get-Item -Force -LiteralPath $readResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $readResolved 'owner.txt')) -ne [IO.Path]::GetFileName($readResolved)){throw 'Unsafe read-runtime cleanup path'}
        Remove-Item -LiteralPath $readResolved -Recurse -Force
    }
    $readResult.cleanup_verified=-not(Test-Path -LiteralPath $readOwned)
    if($SeedCache -and $readResult.seed_cache_used){
        # The validated checkpoint is owned by this read-runtime check, not a
        # shared module cache. Remove it with the rest of the test artifacts.
        if([IO.Path]::GetDirectoryName($readSeed) -ne $readRoot -or [IO.File]::ReadAllText((Join-Path $readSeed 'owner.txt')) -ne [IO.Path]::GetFileName($readSeed)){throw 'Unsafe seed cleanup path'}
        Remove-Item -LiteralPath $readSeed -Recurse -Force
        $readResult.seed_cleanup_verified=-not(Test-Path -LiteralPath $readSeed)
    }
    $readJSON=$readResult|ConvertTo-Json -Depth 8
    $readHandle=[IO.File]::Open($readReceipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $readWriter=New-Object IO.StreamWriter($readHandle,(New-Object Text.UTF8Encoding($false)))
    try{$readWriter.WriteLine($readJSON)}finally{$readWriter.Dispose()}
    Write-Host ('CLEANED read_runtime='+$readResult.cleanup_verified)
    Write-Host ('LOCAL_RECEIPT '+$readReceipt)
}
