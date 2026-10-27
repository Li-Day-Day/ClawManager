[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$closeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$closeToken=[guid]::NewGuid().ToString('N')
$closeOwner=Join-Path $closeRoot ('.tmp-d-index-cache-'+$closeToken)
$closePrefix=Join-Path $PSScriptRoot ('d-local-closeout-'+$closeToken)
$closeManifest=$closePrefix+'-source.json'
$closeVariables=@('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$closePrevious=@{};foreach($closeVariable in $closeVariables){$closePrevious[$closeVariable]=[Environment]::GetEnvironmentVariable($closeVariable,'Process')}
$closeSteps=@();$closeError=$null;$closePost=$false;$closeCleanup=$false;$closeBinaries=@()
function Invoke-CloseGo([string[]]$GoArguments){
    $closeStepLog=$closePrefix+'-step-'+$script:closeSteps.Count+'.log'
    & go @GoArguments 2>&1 | Tee-Object -FilePath $closeStepLog
    $closeExit=$LASTEXITCODE
    $script:closeSteps+=@([ordered]@{command=@('go')+$GoArguments;platform=$env:GOOS;exit_code=$closeExit;log=$closeStepLog;sha256=(Get-FileHash -LiteralPath $closeStepLog -Algorithm SHA256).Hash.ToLowerInvariant()})
    if($closeExit -ne 0){throw ('Local closeout native Go step failed exit='+$closeExit)}
}
try {
    if(Test-Path -LiteralPath $closeOwner){throw 'Local closeout owner exists'}
    [IO.Directory]::CreateDirectory($closeOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $closeOwner 'owner.txt'),[IO.Path]::GetFileName($closeOwner))
    & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') create $closeOwner $closeManifest
    if($LASTEXITCODE -ne 0){throw 'Local closeout snapshot failed; build not started'}
    foreach($closeDirectory in @('cache','tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $closeOwner $closeDirectory))|Out-Null}
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:GOCACHE=Join-Path $closeOwner 'cache';$env:GOTMPDIR=Join-Path $closeOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $closeOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $closeTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $closeTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($closeTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Closeout telemetry isolation failed'}
    Push-Location (Join-Path $closeOwner 'source/backend')
    try {
        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=20m','./internal/systembackupevidence','./internal/systembackupproducer','./internal/systembackupresources','./internal/systembackupread','./internal/systembackupsecurity','./cmd/server')
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$','-count=1','./internal/systembackupresources')
        $closeHTTPSources=@('./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_cursor_key.go','./cmd/server/system_backup_read_live_test.go','./cmd/server/system_backup_read_cursor_key_test.go','./cmd/server/system_backup_read_live_mysql_test.go','./cmd/server/system_backup_read_verification_history_mysql_test.go','./cmd/server/system_backup_read_drill_history_mysql_test.go')
        Invoke-CloseGo -GoArguments (@('test','-json','-tags','systembackup_mysql','-run','^TestDDrillDetailHTTPSeed$','-count=1')+$closeHTTPSources)
        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','./internal/db')
        $env:GOOS='linux'
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/resources.test'),'./internal/systembackupresources')
        Invoke-CloseGo -GoArguments (@('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/drill-http.test'))+$closeHTTPSources)
        Invoke-CloseGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $closeOwner 'binary/admin-read.test'),'./internal/db')
        Invoke-CloseGo -GoArguments @('build','-o',(Join-Path $closeOwner 'binary/system-backup-migrate'),'./cmd/system-backup-migrate')
        Invoke-CloseGo -GoArguments @('build','-o',(Join-Path $closeOwner 'binary/server'),'./cmd/server')
        foreach($closeBinary in Get-ChildItem -LiteralPath (Join-Path $closeOwner 'binary') -File){$closeBinaries+=@{name=$closeBinary.Name;sha256=(Get-FileHash -LiteralPath $closeBinary.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
    } finally {Pop-Location}
    & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $closeOwner $closeManifest
    if($LASTEXITCODE -ne 0){throw 'Local closeout frozen source postcheck failed'}
    $closePost=$true
} catch {$closeError=$_.Exception.Message} finally {
    foreach($closeVariable in $closeVariables){[Environment]::SetEnvironmentVariable($closeVariable,$closePrevious[$closeVariable],'Process')}
    if(Test-Path -LiteralPath $closeOwner){
        $closeResolved=(Resolve-Path -LiteralPath $closeOwner).Path
        if($closeResolved -cne $closeOwner -or [IO.Path]::GetDirectoryName($closeResolved) -cne $closeRoot -or [IO.Path]::GetFileName($closeResolved) -cne ('.tmp-d-index-cache-'+$closeToken) -or [IO.File]::ReadAllText((Join-Path $closeResolved 'owner.txt')) -cne [IO.Path]::GetFileName($closeResolved)){throw 'Refusing local closeout cleanup outside exact owner'}
        foreach($closeEntry in @((Get-Item -Force -LiteralPath $closeResolved))+@(Get-ChildItem -LiteralPath $closeResolved -Recurse -Force)){if($closeEntry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected local closeout cleanup'}}
        Remove-Item -LiteralPath $closeResolved -Recurse -Force
    }
    $closeCleanup=-not(Test-Path -LiteralPath $closeOwner)
    $closeResult=[ordered]@{kind='d_local_closeout_validation.v1';error=$closeError;source=$closeManifest;steps=$closeSteps;binaries=$closeBinaries;frozen_postcheck=$closePost;owner=$closeOwner;owner_removed=$closeCleanup;dependencies_installed=$false;remote_contacted=$false;actual_mysql=$false;production_approved=$false;runner_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();snapshotter_sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()}
    [IO.File]::WriteAllText(($closePrefix+'.json'),($closeResult|ConvertTo-Json -Depth 8))
    Write-Output ('LOCAL_CLOSEOUT_RESULT='+$closePrefix+'.json')
}
if($closeError){throw $closeError}
