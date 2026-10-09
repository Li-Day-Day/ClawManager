[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$capacityRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$capacityScratch=Join-Path $capacityRoot ('.tmp-d-capacity-'+[guid]::NewGuid().ToString('N'))
$capacityNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$capacitySaved=@{}
foreach($name in $capacityNames){$capacitySaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
    foreach($directory in @($capacityScratch,(Join-Path $capacityScratch 'cache'),(Join-Path $capacityScratch 'tmp'),(Join-Path $capacityScratch 'telemetry'))){[IO.Directory]::CreateDirectory($directory)|Out-Null}
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $capacityScratch 'cache';$env:GOTMPDIR=Join-Path $capacityScratch 'tmp'
    $env:TEST_TELEMETRY_DIR=Join-Path $capacityScratch 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    foreach($testFile in @('system-backup-d-capacity-deployment.test.mjs','system-backup-d-deployment.test.mjs','system-backup-schema-diff.test.mjs')){
        & node (Join-Path $PSScriptRoot $testFile)
        if($LASTEXITCODE -ne 0){throw "Node gate failed: $testFile"}
    }
    Push-Location (Join-Path $capacityRoot 'backend')
    try {
        & go test -count=1 ./internal/systembackupsecurity ./cmd/system-backup-registration
        if($LASTEXITCODE -ne 0){throw 'Capacity/security tests failed; no dependencies installed'}
        $env:GOOS='linux'
        & go build -o (Join-Path $capacityScratch 'system-backup-registration') ./cmd/system-backup-registration
        if($LASTEXITCODE -ne 0){throw 'Linux registration/collector build failed'}
        Write-Output 'PASS d-capacity-local-tests-and-linux-registration-build'
    } finally {Pop-Location}
} finally {
    foreach($name in $capacityNames){[Environment]::SetEnvironmentVariable($name,$capacitySaved[$name],'Process')}
    if(Test-Path -LiteralPath $capacityScratch){
        $capacityResolved=(Resolve-Path -LiteralPath $capacityScratch).Path
        if(-not $capacityResolved.StartsWith($capacityRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($capacityResolved) -notmatch '^\.tmp-d-capacity-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned capacity scratch'}
        Remove-Item -LiteralPath $capacityResolved -Recurse -Force
    }
    Write-Output ('CLEANED capacity-validation-build-cache='+(-not(Test-Path -LiteralPath $capacityScratch)))
}
