[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$HandlePath,[Parameter(Mandatory=$true)][string]$CachePath)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$jointRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$jointHandle=Get-Content -Raw -LiteralPath $HandlePath|ConvertFrom-Json
if($jointHandle.kind -cne 'd1_joint_native_prepared.v1'){throw 'Expected prepared joint source'}
$jointOwner=$jointHandle.owner
if([IO.Path]::GetDirectoryName($jointOwner) -cne $jointRoot -or [IO.Path]::GetFileName($jointOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.File]::ReadAllText((Join-Path $jointOwner 'owner.txt')) -cne [IO.Path]::GetFileName($jointOwner)){throw 'Joint native owner mismatch'}
$CachePath=[IO.Path]::GetFullPath($CachePath)
if(-not $CachePath.StartsWith($jointRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath $CachePath) -or ((Get-Item -Force -LiteralPath $CachePath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Expected existing Root-owned private CAS cache'}
$jointPrefix=Join-Path $jointRoot $jointHandle.prefix
$jointManifest=Join-Path $jointRoot $jointHandle.manifest
$jointHelper=Join-Path $PSScriptRoot 'd1-joint-native-source-20261027.mjs'
$jointEnv=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOMAXPROCS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOTELEMETRY','TEST_TELEMETRY_DIR','TEMP','TMP')
$jointPrior=@{};foreach($n in $jointEnv){$jointPrior[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
$jointResult=[ordered]@{kind='d1_joint_gate_cleanup_native.v1';status='failed';owner=$jointOwner;source_manifest=$jointHandle.manifest;source_sha256=$jointHandle.source_sha256;steps=@();Go_started=$false;source_precheck=$false;source_postcheck=$false;owner_removed=$false;cache=$CachePath;cache_removed_by_this_script=$false;dependencies_installed=$false;actual_SQL=$false;production_approved=$false;error=$null}
function Invoke-JointGo([string[]]$GoArgs){
    & node $jointHelper check $jointManifest
    if($LASTEXITCODE -ne 0){throw 'Joint source check failed before Go'}
    $log=$jointPrefix+'.step-'+$script:jointResult.steps.Count+'.jsonl'
    [IO.File]::WriteAllText($log,'')
    $script:jointResult.Go_started=$true
    & go @GoArgs 2>&1 | Tee-Object -FilePath $log
    $nativeExit=$LASTEXITCODE
    $script:jointResult.steps+=@([ordered]@{command=@('go')+$GoArgs;platform=$env:GOOS;exit_code=$nativeExit;log=$log;sha256=(Get-FileHash -LiteralPath $log -Algorithm SHA256).Hash.ToLowerInvariant()})
    if($nativeExit -ne 0){throw ('Joint native stage failed: '+$script:jointResult.steps.Count)}
    & node $jointHelper check $jointManifest
    if($LASTEXITCODE -ne 0){throw 'Joint source changed after Go'}
}
try{
    if(@(Get-Process go,compile,link -ErrorAction SilentlyContinue).Count){throw 'Another local Go build is active; keep human window exclusive'}
    & node $jointHelper check $jointManifest
    if($LASTEXITCODE -ne 0){throw 'Joint source precheck failed'}
    $jointResult.source_precheck=$true
    foreach($dir in @('tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $jointOwner $dir))|Out-Null}
    $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTELEMETRY='off'
    $env:GOCACHE=$CachePath;$env:GOTMPDIR=Join-Path $jointOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $jointOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location (Join-Path $jointHandle.source 'backend')
    try{
        Invoke-JointGo @('list','-deps','-test','-json','./internal/systembackupcontroller','./internal/systembackupcleanup','./cmd/system-backup-controller')
        Invoke-JointGo @('test','-json','-count=1','-timeout=300s','./internal/systembackupcontroller','./internal/systembackupcleanup')
        Invoke-JointGo @('build','-buildvcs=false','-o',(Join-Path $jointOwner 'binary/controller.exe'),'./cmd/system-backup-controller')
        Invoke-JointGo @('test','-json','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','-timeout=300s','./internal/systembackupsecurity')
        $env:GOOS='linux'
        Invoke-JointGo @('list','-deps','-test','-json','-tags','systembackup_mysql','./internal/systembackupcontroller','./internal/systembackupcleanup','./cmd/system-backup-controller','./internal/systembackupsecurity')
        Invoke-JointGo @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $jointOwner 'binary/controller.test'),'./internal/systembackupcontroller')
        Invoke-JointGo @('test','-c','-o',(Join-Path $jointOwner 'binary/cleanup.test'),'./internal/systembackupcleanup')
        Invoke-JointGo @('build','-buildvcs=false','-o',(Join-Path $jointOwner 'binary/controller-linux'),'./cmd/system-backup-controller')
        Invoke-JointGo @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $jointOwner 'binary/admin.test'),'./internal/systembackupsecurity')
    }finally{Pop-Location}
    [IO.File]::WriteAllText(($jointPrefix+'.steps.json'),($jointResult.steps|ConvertTo-Json -Depth 7))
    & node $jointHelper finish $jointManifest ($jointPrefix+'.steps.json')
    if($LASTEXITCODE -ne 0){throw 'Joint native inventory rejected'}
    & node $jointHelper check $jointManifest
    if($LASTEXITCODE -ne 0){throw 'Final joint source check failed'}
    $jointResult.source_postcheck=$true;$jointResult.status='passed_exact_private_gate_and_cleanup_preparation'
}catch{$jointResult.error=$_.Exception.Message}finally{
    foreach($n in $jointPrior.Keys){[Environment]::SetEnvironmentVariable($n,$jointPrior[$n],'Process')}
    if(Test-Path -LiteralPath $jointOwner){
        $resolved=(Resolve-Path -LiteralPath $jointOwner).Path
        if($resolved -cne $jointOwner -or [IO.Path]::GetDirectoryName($resolved) -cne $jointRoot -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved)){throw 'Refusing joint cleanup outside exact owner'}
        foreach($entry in @((Get-Item -LiteralPath $resolved -Force))+@(Get-ChildItem -LiteralPath $resolved -Recurse -Force)){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected joint owner cleanup rejected'}}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    $jointResult.owner_removed=-not(Test-Path -LiteralPath $jointOwner)
    [IO.File]::WriteAllText(($jointPrefix+'.json'),($jointResult|ConvertTo-Json -Depth 9))
    Write-Output ('JOINT_NATIVE_RESULT='+$jointPrefix+'.json')
}
if($jointResult.error){throw $jointResult.error}
