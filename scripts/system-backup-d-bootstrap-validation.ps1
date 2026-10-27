[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$bootstrapRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$bootstrapScratch=Join-Path $bootstrapRoot ('.tmp-d-bootstrap-entry-'+[guid]::NewGuid().ToString('N'))
$bootstrapNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','GOCACHE','GOTMPDIR','GOMAXPROCS')
$bootstrapSaved=@{}
foreach($name in $bootstrapNames){$bootstrapSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
    foreach($directory in @($bootstrapScratch,(Join-Path $bootstrapScratch 'cache'),(Join-Path $bootstrapScratch 'tmp'))){[IO.Directory]::CreateDirectory($directory)|Out-Null}
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $bootstrapScratch 'cache';$env:GOTMPDIR=Join-Path $bootstrapScratch 'tmp'
    Push-Location (Join-Path $bootstrapRoot 'backend')
    try {
        & go test -count=1 ./internal/systembackupsecurity ./cmd/system-backup-bootstrap ./cmd/system-backup-registration
        if($LASTEXITCODE -ne 0){throw 'Bootstrap entry tests failed; no dependencies installed'}
        $bootstrapExe=Join-Path $bootstrapScratch 'bootstrap.exe'
        & go build -o $bootstrapExe ./cmd/system-backup-bootstrap
        if($LASTEXITCODE -ne 0){throw 'Bootstrap entry compilation failed'}
        $bootstrapOutput=& $bootstrapExe --requirements
        $bootstrapExit=$LASTEXITCODE
        if($bootstrapExit -ne 2){throw 'Missing owner adapters must block with exit 2'}
        $bootstrapReport=$bootstrapOutput|ConvertFrom-Json
        if($bootstrapReport.status -ne 'blocked' -or $bootstrapReport.missing_adapters.Count -ne 30 -or $bootstrapReport.database_opened -ne $false -or $bootstrapReport.configuration_mutated -ne $false){throw 'Invalid compiled requirements report'}
        Write-Output 'PASS bootstrap-requirements-exit=2 missing-owner-adapters=30 database-opened=false'
        $env:GOOS='linux'
        & go build -o (Join-Path $bootstrapScratch 'system-backup-bootstrap') ./cmd/system-backup-bootstrap
        if($LASTEXITCODE -ne 0){throw 'Linux bootstrap entry build failed'}
        & go build -o (Join-Path $bootstrapScratch 'system-backup-registration') ./cmd/system-backup-registration
        if($LASTEXITCODE -ne 0){throw 'Linux registration integration build failed'}
        Write-Output 'PASS bootstrap-tests-and-vet=true linux-bootstrap-and-registration-builds=true'
    } finally {Pop-Location}
} finally {
    foreach($name in $bootstrapNames){[Environment]::SetEnvironmentVariable($name,$bootstrapSaved[$name],'Process')}
    if(Test-Path -LiteralPath $bootstrapScratch){
        $bootstrapResolved=(Resolve-Path -LiteralPath $bootstrapScratch).Path
        if(-not $bootstrapResolved.StartsWith($bootstrapRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($bootstrapResolved) -notmatch '^\.tmp-d-bootstrap-entry-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned bootstrap scratch'}
        Remove-Item -LiteralPath $bootstrapResolved -Recurse -Force
    }
    Write-Output ('CLEANED bootstrap-entry-build-cache='+(-not(Test-Path -LiteralPath $bootstrapScratch)))
}
