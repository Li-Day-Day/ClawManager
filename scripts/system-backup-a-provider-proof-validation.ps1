$ErrorActionPreference = 'Stop'
$proofRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$proofPrefix = $proofRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$proofScratch = Join-Path $proofRoot ('.tmp-a-provider-proof-' + [guid]::NewGuid().ToString('N'))
$proofNames = @('GO111MODULE','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOTELEMETRY','GOMAXPROCS','GOFLAGS')
$proofPrevious = @{}
foreach ($name in $proofNames) { $proofPrevious[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    foreach ($folder in @('cache','tmp','source')) { New-Item -ItemType Directory -Path (Join-Path $proofScratch $folder) -Force | Out-Null }
    Get-ChildItem -LiteralPath (Join-Path $proofRoot 'backend/internal/systembackupsecurity') -Filter '*.go' -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $proofScratch 'source')
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'system-backup-d-a-review/review_test.go') -Destination (Join-Path $proofScratch 'source/review_test.go')
    $env:GO111MODULE='off'; $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOTELEMETRY='off'
    $env:GOMAXPROCS='2'; $env:GOFLAGS='-p=1'
    $env:GOCACHE=Join-Path $proofScratch 'cache'; $env:GOTMPDIR=Join-Path $proofScratch 'tmp'
    Push-Location (Join-Path $proofScratch 'source')
    try { & go test -count=1 -v .; if ($LASTEXITCODE -ne 0) { throw 'A provider-proof security tests failed' } } finally { Pop-Location }
} finally {
    foreach ($name in $proofNames) { [Environment]::SetEnvironmentVariable($name, $proofPrevious[$name], 'Process') }
    if (Test-Path -LiteralPath $proofScratch) {
        $proofResolved = (Resolve-Path -LiteralPath $proofScratch).Path
        if (-not $proofResolved.StartsWith($proofPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($proofResolved) -notmatch '^\.tmp-a-provider-proof-[0-9a-f]{32}$') { throw 'Refusing cleanup outside run-owned scratch' }
        Remove-Item -LiteralPath $proofResolved -Recurse -Force
    }
    Write-Output ('Provider-proof test scratch removed: ' + (-not (Test-Path -LiteralPath $proofScratch)))
}
