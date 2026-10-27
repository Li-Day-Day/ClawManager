[CmdletBinding()]
param([switch]$BuildOnly)
$ErrorActionPreference='Stop'
$validationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$validationScratch=Join-Path $validationRoot ('.tmp-d-independent-'+[guid]::NewGuid().ToString('N'))
$validationNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$validationSaved=@{}
foreach($name in $validationNames){$validationSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
    foreach($directory in @($validationScratch,(Join-Path $validationScratch 'cache'),(Join-Path $validationScratch 'tmp'),(Join-Path $validationScratch 'telemetry'))){[IO.Directory]::CreateDirectory($directory)|Out-Null}
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $validationScratch 'cache';$env:GOTMPDIR=Join-Path $validationScratch 'tmp'
    # The installed Go tool uses this documented-in-source test override; keep
    # its mode file in owned scratch, without changing the user's global mode.
    $env:TEST_TELEMETRY_DIR=Join-Path $validationScratch 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    Push-Location $validationRoot
    try {
        if(-not $BuildOnly){foreach($testFile in @('system-backup-d-init-check.test.mjs','system-backup-d-dto-check.test.mjs','system-backup-d-deployment.test.mjs','system-backup-contract-artifacts.test.mjs','system-backup-rbac-manifests.test.mjs')){
            & node (Join-Path $PSScriptRoot $testFile)
            if($LASTEXITCODE -ne 0){throw "Node gate failed: $testFile"}
        }}
        Push-Location (Join-Path $validationRoot 'backend')
        try {
            if(-not $BuildOnly){
                & go test -count=1 ./internal/systembackupcontract ./internal/systembackupcontroller ./internal/db ./cmd/system-backup-controller
                if($LASTEXITCODE -ne 0){throw 'D controller/DTO/migration tests failed; no dependencies installed'}
            }
            $env:GOOS='linux'
            & go build -o (Join-Path $validationScratch 'system-backup-controller') ./cmd/system-backup-controller
            if($LASTEXITCODE -ne 0){throw 'Linux controller build failed'}
            if($BuildOnly){Write-Output 'PASS linux-controller-build-only'}else{Write-Output 'PASS d-independent-local-tests-and-linux-controller-build'}
        } finally {Pop-Location}
    } finally {Pop-Location}
} finally {
    foreach($name in $validationNames){[Environment]::SetEnvironmentVariable($name,$validationSaved[$name],'Process')}
    if(Test-Path -LiteralPath $validationScratch){
        $validationResolved=(Resolve-Path -LiteralPath $validationScratch).Path
        if(-not $validationResolved.StartsWith($validationRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($validationResolved) -notmatch '^\.tmp-d-independent-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned validation scratch'}
        Remove-Item -LiteralPath $validationResolved -Recurse -Force
    }
    Write-Output ('CLEANED independent-validation-build-cache='+(-not(Test-Path -LiteralPath $validationScratch)))
}
