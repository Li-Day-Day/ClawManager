[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$metricsRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$metricsOwner=Join-Path $metricsRoot '.tmp-d-index-cache-73d13ff796d44907bc4079ef728c983e'
$metricsPrefix=Join-Path $PSScriptRoot 'd2-metrics-tagged-security-candidate-73d13ff796d44907bc4079ef728c983e-20261027'
$metricsHelper=Join-Path $PSScriptRoot 'd2-metrics-tagged-security-candidate-review-20261027.mjs'
$metricsSourceManifest=$metricsPrefix+'.source.json'
$metricsResult=[ordered]@{kind='d2_metrics_tagged_security_private_native.v1';status='failed';owner=$metricsOwner;source_manifest=$metricsSourceManifest;Go_started=$false;tests_started=$false;steps=@();error=$null;source_precheck=$false;source_postcheck=$false;owner_removed=$false;actual_SQL=$false;remote_contacted=$false;dependencies_installed=$false;production_approved=$false;live_sources_promoted=$false;collector_and_automatic_clock_bindings_approved=$false}
$metricsVars=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$metricsPrior=@{};foreach($metricsName in $metricsVars){$metricsPrior[$metricsName]=[Environment]::GetEnvironmentVariable($metricsName,'Process')}
$metricsAdopted=$false
function Invoke-MetricsGo([string[]]$GoArguments,[string]$Tags=''){
    $metricsStep=$script:metricsResult.steps.Count
    $metricsLog=$metricsPrefix+'.step-'+$metricsStep+'.jsonl'
    [IO.File]::WriteAllText($metricsLog,'')
    $global:LASTEXITCODE=$null
    $script:metricsResult.Go_started=$true
    if($GoArguments[0] -ceq 'list'){
        $metricsStderr=$metricsLog+'.stderr.txt'
        & go @GoArguments 1> $metricsLog 2> $metricsStderr
        $metricsExit=$LASTEXITCODE
        $script:metricsResult.steps+=@([ordered]@{command=@('go')+$GoArguments;platform=$env:GOOS;tags=$Tags;exit_code=$metricsExit;log=$metricsLog;sha256=(Get-FileHash -LiteralPath $metricsLog -Algorithm SHA256).Hash.ToLowerInvariant();stderr=$metricsStderr;stderr_sha256=(Get-FileHash -LiteralPath $metricsStderr -Algorithm SHA256).Hash.ToLowerInvariant()})
        $metricsNamed=$metricsPrefix+'.'+$env:GOOS+'.'+$Tags+'.go-list.jsonl'
        Copy-Item -LiteralPath $metricsLog -Destination $metricsNamed
    }else{
        if($GoArguments -notcontains '-c'){$script:metricsResult.tests_started=$true}
        & go @GoArguments 2>&1|Tee-Object -FilePath $metricsLog
        $metricsExit=$LASTEXITCODE
        $script:metricsResult.steps+=@([ordered]@{command=@('go')+$GoArguments;platform=$env:GOOS;tags=$Tags;exit_code=$metricsExit;log=$metricsLog;sha256=(Get-FileHash -LiteralPath $metricsLog -Algorithm SHA256).Hash.ToLowerInvariant()})
    }
    if($metricsExit -ne 0){throw ('Private controller native step '+$metricsStep+' failed exit='+$metricsExit)}
}
try {
    $metricsResolved=(Resolve-Path -LiteralPath $metricsOwner).Path
    if($metricsResolved -cne $metricsOwner -or [IO.Path]::GetDirectoryName($metricsResolved) -cne $metricsRoot -or [IO.File]::ReadAllText((Join-Path $metricsOwner 'owner.txt')) -cne [IO.Path]::GetFileName($metricsOwner)){throw 'Unexpected private metrics owner'}
    if((Get-Item -LiteralPath $metricsOwner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected metrics owner'}
    $metricsAdopted=$true
    if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another Go process is active'}
    if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($metricsRoot))).AvailableFreeSpace -lt 8GB){throw 'Insufficient private controller space'}
    $metricsParentPath=Join-Path $PSScriptRoot 'd2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2.json'
    $metricsParent=Get-Content -Raw -LiteralPath $metricsParentPath|ConvertFrom-Json
    if($metricsParent.status -cne 'passed_private_controller_candidate' -or $metricsParent.error -or $metricsParent.source_set_postcheck -ne $true -or $metricsParent.owner_removed -ne $true -or $metricsParent.steps.Count -ne 7 -or (Test-Path -LiteralPath $metricsParent.owner)){throw 'Strict controller candidate success and cleanup required'}
    $metricsResult.parent_controller_receipt=[ordered]@{path=$metricsParentPath;sha256=(Get-FileHash -LiteralPath $metricsParentPath -Algorithm SHA256).Hash.ToLowerInvariant()}
    & node $metricsHelper --check
    if($LASTEXITCODE -ne 0){throw 'Private metrics source precheck failed'}
    $metricsResult.source_precheck=$true
    $metricsResult.source_set_precheck=$true
    foreach($metricsDirectory in @('cache','tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $metricsOwner $metricsDirectory))|Out-Null}
    $env:GOTELEMETRY='off';$env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:GOCACHE=Join-Path $metricsOwner 'cache';$env:GOTMPDIR=Join-Path $metricsOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
    $env:TEST_TELEMETRY_DIR=Join-Path $metricsOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $metricsResult.Go_started=$true
    $metricsTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $metricsTelemetry.GOTELEMETRY -cne 'off' -or [IO.Path]::GetFullPath($metricsTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Private controller telemetry isolation failed'}
    $metricsResult.go_telemetry=$metricsTelemetry
    Push-Location (Join-Path $metricsOwner 'source/backend')
    try {
        foreach($metricsPlatform in @('windows','linux')){
            $env:GOOS=$metricsPlatform
            Invoke-MetricsGo -GoArguments @('list','-deps','-test','-json','-tags','systembackup_mysql','./internal/systembackupsecurity') -Tags 'systembackup_mysql'
        }
        & node $metricsHelper --scope
        if($LASTEXITCODE -ne 0){throw 'Tagged security actual source scope rejected'}
        & node $metricsHelper --check
        if($LASTEXITCODE -ne 0){throw 'Tagged security frozen input set changed'}
        $env:GOOS='windows'
        Invoke-MetricsGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','-timeout=2700s','./internal/systembackupsecurity') -Tags 'systembackup_mysql'
        $env:GOOS='linux'
        $metricsBinary=Join-Path $metricsOwner 'binary/security.systembackup_mysql.test'
        Invoke-MetricsGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',$metricsBinary,'./internal/systembackupsecurity') -Tags 'systembackup_mysql'
    }finally{Pop-Location}
    [IO.File]::WriteAllText((Join-Path $metricsOwner 'native-stages.json'),($metricsResult.steps|ConvertTo-Json -Depth 8))
    $metricsInventoryText=(& node $metricsHelper --inventory|Out-String)
    if($LASTEXITCODE -ne 0){throw 'Private controller full native inventory rejected'}
    $metricsResult.native_inventory=$metricsInventoryText|ConvertFrom-Json
    & node $metricsHelper --check
    if($LASTEXITCODE -ne 0){throw 'Private controller final source check failed'}
    $metricsResult.source_postcheck=$true
    $metricsResult.source_set_postcheck=$true
    $metricsResult.status='passed_private_tagged_security_candidate'
}catch{$metricsResult.error=$_.Exception.Message}finally{
    if((Test-Path -LiteralPath $metricsSourceManifest) -and (Test-Path -LiteralPath (Join-Path $metricsOwner 'source'))){
        try {
            & node $metricsHelper --check
            if($LASTEXITCODE -ne 0){throw 'Private controller finally source check failed'}
            $metricsResult.source_postcheck=$true
    $metricsResult.source_set_postcheck=$true
        }catch{$metricsResult.source_postcheck=$false;$metricsResult.source_set_postcheck=$false;$metricsResult.status='failed';if(-not $metricsResult.error){$metricsResult.error=$_.Exception.Message}}
    }
    foreach($metricsName in $metricsVars){[Environment]::SetEnvironmentVariable($metricsName,$metricsPrior[$metricsName],'Process')}
    if($metricsAdopted -and (Test-Path -LiteralPath $metricsOwner)){
        $metricsResolved=(Resolve-Path -LiteralPath $metricsOwner).Path
        if($metricsResolved -cne $metricsOwner -or [IO.Path]::GetDirectoryName($metricsResolved) -cne $metricsRoot -or [IO.File]::ReadAllText((Join-Path $metricsOwner 'owner.txt')) -cne [IO.Path]::GetFileName($metricsOwner)){throw 'Refusing cleanup outside exact private controller owner'}
        foreach($metricsEntry in @((Get-Item -LiteralPath $metricsResolved -Force))+@(Get-ChildItem -LiteralPath $metricsResolved -Recurse -Force)){if($metricsEntry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected private controller cleanup refused'}}
        Remove-Item -LiteralPath $metricsResolved -Recurse -Force
    }
    $metricsResult.owner_removed=-not(Test-Path -LiteralPath $metricsOwner)
    $metricsResult.runner_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if(Test-Path -LiteralPath $metricsSourceManifest){$metricsResult.source_manifest_sha256=(Get-FileHash -LiteralPath $metricsSourceManifest -Algorithm SHA256).Hash.ToLowerInvariant()}
    [IO.File]::WriteAllText(($metricsPrefix+'.json'),($metricsResult|ConvertTo-Json -Depth 12))
    Write-Output ('METRICS_CONTROLLER_RESULT='+$metricsPrefix+'.json')
}
if($metricsResult.error -or $metricsResult.status -cne 'passed_private_tagged_security_candidate' -or -not $metricsResult.source_postcheck -or -not $metricsResult.owner_removed){throw 'Private controller candidate validation did not complete successfully'}
