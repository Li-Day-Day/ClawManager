[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$CurrentOrdinaryReceipt,
    [string]$CompilerCacheSeed=''
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$securityRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$securityID=[guid]::NewGuid().ToString('N')
$securityOwner=Join-Path $securityRoot ('.tmp-d-index-cache-'+$securityID)
$securityPrefix=Join-Path $PSScriptRoot ('a-security-linux-compile-native-'+$securityID)
$securityManifest=$securityPrefix+'.source.json'
$securityDriver=[IO.Path]::GetFullPath($PSCommandPath)
$securitySnapshotter=Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs'
$securityByteChecker=Join-Path $PSScriptRoot 'a-owner-pre-thin-target-20261026.mjs'
$securityTarget=Join-Path $PSScriptRoot 'a-owner-pre-thin-target-20261027-r2.json'
$securityPins=@($securityDriver,$securitySnapshotter,$securityByteChecker,$securityTarget)|ForEach-Object {
    [ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$securityVars=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$securityPrior=@{};foreach($securityName in $securityVars){$securityPrior[$securityName]=[Environment]::GetEnvironmentVariable($securityName,'Process')}
$securityResult=[ordered]@{kind='a_security_linux_compile_supplement.v1';id=$securityID;status='failed';owner=$securityOwner;Go_started=$false;tests_executed=$false;dependencies_installed=$false;actual_SQL=$false;production_approved=$false;source_precheck=$false;source_postcheck=$false;cleanup=$false;compiler_cache_hints_only=$true;test_results_reused=$false;steps=@();error=$null}
$securityCreated=$false
try {
    $securityOrdinaryPath=[IO.Path]::GetFullPath($CurrentOrdinaryReceipt)
    if([IO.Path]::GetDirectoryName($securityOrdinaryPath) -cne $PSScriptRoot -or [IO.Path]::GetFileName($securityOrdinaryPath) -cnotmatch '^d2-current-ordinary-native-[a-f0-9]{32}\.json$'){throw 'Unexpected current ordinary prerequisite'}
    $securityOrdinary=Get-Content -LiteralPath $securityOrdinaryPath -Raw|ConvertFrom-Json
    if($securityOrdinary.kind -cne 'd2_current_ordinary_complete_native.v1' -or $securityOrdinary.status -cne 'passed_selected_complete_ordinary_packages' -or $securityOrdinary.error -or $securityOrdinary.windows_source_postcheck -ne $true -or $securityOrdinary.bootstrap_seed_source_postcheck -ne $true -or $securityOrdinary.frozen_source_unchanged -ne $true -or $securityOrdinary.owner_removed -ne $true -or $securityOrdinary.steps.Count -ne 8 -or @($securityOrdinary.steps|Where-Object {$_.exit_code -ne 0}).Count -or (Test-Path -LiteralPath $securityOrdinary.owner)){throw 'Complete current eight-stage terminal and cleanup required'}
    $securityResult.current_ordinary_receipt=[ordered]@{path=$securityOrdinaryPath;sha256=(Get-FileHash -LiteralPath $securityOrdinaryPath -Algorithm SHA256).Hash.ToLowerInvariant()}
    if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another native Go process is active'}
    if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($securityRoot))).AvailableFreeSpace -lt 4GB){throw 'Insufficient private compile space'}
    & node $securityByteChecker --check-bytes 'docs/evidence/a-owner-pre-thin-target-20261027-r2.json'
    if($LASTEXITCODE -ne 0){throw 'Current target byte check rejected'}
    if(Test-Path -LiteralPath $securityOwner){throw 'Security compile owner exists'}
    [IO.Directory]::CreateDirectory($securityOwner)|Out-Null;$securityCreated=$true
    [IO.File]::WriteAllText((Join-Path $securityOwner 'owner.txt'),[IO.Path]::GetFileName($securityOwner))
    foreach($securityDir in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $securityOwner $securityDir))|Out-Null}
    $securityResult.cache_objects_copied=0
    if($CompilerCacheSeed){
        $securitySeed=(Resolve-Path -LiteralPath $CompilerCacheSeed).Path
        if([IO.Path]::GetDirectoryName($securitySeed) -cne $securityRoot -or [IO.Path]::GetFileName($securitySeed) -cnotmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $securitySeed -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $securitySeed 'owner.txt')) -cne [IO.Path]::GetFileName($securitySeed)){throw 'Unexpected read-only compiler cache seed'}
        foreach($securityShard in Get-ChildItem -LiteralPath (Join-Path $securitySeed 'cache') -Directory){
            if($securityShard.Name -cnotmatch '^[a-f0-9]{2}$'){continue}
            if($securityShard.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected compiler shard'}
            $securityShardTarget=Join-Path $securityOwner ('cache/'+$securityShard.Name);[IO.Directory]::CreateDirectory($securityShardTarget)|Out-Null
            foreach($securityObject in Get-ChildItem -LiteralPath $securityShard.FullName -File){
                if($securityObject.Name -cnotmatch '^[a-f0-9]{64}-[ad]$'){continue}
                if($securityObject.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected compiler object'}
                [IO.File]::Copy($securityObject.FullName,(Join-Path $securityShardTarget $securityObject.Name),$false)
                $securityResult.cache_objects_copied++
            }
        }
        $securityResult.cache_seed=[ordered]@{path=$securitySeed;source_read_only=$true;source_deleted_by_this_run=$false;test_result_reuse=$false}
    }
    & node $securitySnapshotter create $securityOwner $securityManifest
    if($LASTEXITCODE -ne 0){throw 'Security source snapshot failed'}
    $securityFrozen=Get-Content -LiteralPath $securityManifest -Raw|ConvertFrom-Json
    $securityExpected=Get-Content -LiteralPath $securityTarget -Raw|ConvertFrom-Json
    if($securityFrozen.source_sha256 -cne $securityExpected.target_sha256 -or $securityFrozen.files.Count -ne $securityExpected.target_files.Count){throw 'Frozen source differs from exact current target'}
    $securityResult.source_manifest=$securityManifest
    $securityResult.source_manifest_sha256=(Get-FileHash -LiteralPath $securityManifest -Algorithm SHA256).Hash.ToLowerInvariant()
    $securityResult.source_sha256=$securityFrozen.source_sha256
    $securityResult.source_precheck=$true
    $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2';$env:GOTELEMETRY='off'
    $env:GOCACHE=Join-Path $securityOwner 'cache';$env:GOTMPDIR=Join-Path $securityOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $securityOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another native Go process became active'}
    $securityResult.Go_started=$true
    $securityTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $securityTelemetry.GOTELEMETRY -cne 'off' -or [IO.Path]::GetFullPath($securityTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Private Go telemetry verification failed'}
    $securityResult.telemetry='off_owned_directory_verified'
    $securityBinary=Join-Path $securityOwner 'security.test'
    $securityArguments=@('test','-c','-o',$securityBinary,'./internal/systembackupsecurity')
    $securityStdout=$securityPrefix+'.stdout.txt';$securityStderr=$securityPrefix+'.stderr.txt'
    Push-Location (Join-Path $securityOwner 'source/backend')
    try{& go @securityArguments 1> $securityStdout 2> $securityStderr;$securityNativeExit=$LASTEXITCODE}finally{Pop-Location}
    $securityResult.steps+=@([ordered]@{command=@('go')+$securityArguments;goos='linux';goarch='amd64';tags='';exit_code=$securityNativeExit;stdout=$securityStdout;stdout_sha256=(Get-FileHash -LiteralPath $securityStdout -Algorithm SHA256).Hash.ToLowerInvariant();stderr=$securityStderr;stderr_sha256=(Get-FileHash -LiteralPath $securityStderr -Algorithm SHA256).Hash.ToLowerInvariant()})
    if($securityNativeExit -ne 0){throw 'Current ordinary Linux security test-program compile failed'}
    $securityHeader=New-Object byte[] 64;$securityStream=[IO.File]::OpenRead($securityBinary)
    try{$securityHeaderBytes=$securityStream.Read($securityHeader,0,64)}finally{$securityStream.Dispose()}
    if($securityHeaderBytes -ne 64 -or [BitConverter]::ToString($securityHeader,0,7) -cne '7F-45-4C-46-02-01-01' -or [BitConverter]::ToUInt16($securityHeader,18) -ne 62){throw 'Security test program is not an amd64 ELF'}
    $securityResult.binary=[ordered]@{format='ELF';class=64;machine='amd64';size=(Get-Item -LiteralPath $securityBinary).Length;sha256=(Get-FileHash -LiteralPath $securityBinary -Algorithm SHA256).Hash.ToLowerInvariant();executed=$false}
    $securityResult.status='passed_exact_current_ordinary_security_Linux_compile'
}catch{$securityResult.error=$_.Exception.Message}finally{
    if((Test-Path -LiteralPath $securityManifest) -and (Test-Path -LiteralPath (Join-Path $securityOwner 'source'))){
        try{
            & node $securitySnapshotter check $securityOwner $securityManifest
            if($LASTEXITCODE -ne 0){throw 'Frozen security source postcheck failed'}
            foreach($securityPin in $securityPins){if((Get-FileHash -LiteralPath $securityPin.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $securityPin.sha256){throw 'Executed security compile control changed'}}
            $securityResult.source_postcheck=$true
        }catch{$securityResult.source_postcheck=$false;$securityResult.status='failed';$securityResult.postcheck_error=$_.Exception.Message}
    }
    foreach($securityName in $securityVars){[Environment]::SetEnvironmentVariable($securityName,$securityPrior[$securityName],'Process')}
    if($securityCreated -and (Test-Path -LiteralPath $securityOwner)){
        $securityResolved=(Resolve-Path -LiteralPath $securityOwner).Path
        if($securityResolved -cne $securityOwner -or [IO.Path]::GetDirectoryName($securityResolved) -cne $securityRoot -or [IO.Path]::GetFileName($securityResolved) -cne ('.tmp-d-index-cache-'+$securityID) -or [IO.File]::ReadAllText((Join-Path $securityResolved 'owner.txt')) -cne [IO.Path]::GetFileName($securityResolved)){throw 'Refusing cleanup outside exact security owner'}
        foreach($securityEntry in @((Get-Item -LiteralPath $securityResolved -Force))+@(Get-ChildItem -LiteralPath $securityResolved -Recurse -Force)){if($securityEntry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected security owner cleanup'}}
        Remove-Item -LiteralPath $securityResolved -Recurse -Force
    }
    $securityResult.cleanup=-not(Test-Path -LiteralPath $securityOwner)
    $securityResult.control_pins=$securityPins
    [IO.File]::WriteAllText(($securityPrefix+'.json'),($securityResult|ConvertTo-Json -Depth 10))
    Write-Output ('SECURITY_LINUX_RESULT='+$securityPrefix+'.json')
}
if($securityResult.status -cne 'passed_exact_current_ordinary_security_Linux_compile' -or -not $securityResult.source_postcheck -or -not $securityResult.cleanup){throw 'Security Linux compile supplement did not reach verified terminal success'}
