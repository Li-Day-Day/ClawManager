param([string]$TestPattern = '.')
$ErrorActionPreference = 'Stop'
$reviewRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$reviewScratch = Join-Path $reviewRoot ('.tmp-d-a-review-' + [guid]::NewGuid().ToString('N'))
$reviewPrefix = $reviewRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (-not $reviewScratch.StartsWith($reviewPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Scratch path outside workspace' }
$reviewVariables = @('GO111MODULE', 'GOPROXY', 'GOSUMDB', 'GOTOOLCHAIN', 'GOCACHE', 'GOTMPDIR', 'GOTELEMETRY')
$reviewPrevious = @{}
foreach ($name in $reviewVariables) { $reviewPrevious[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$reviewExit = 1
try {
    New-Item -ItemType Directory -Path $reviewScratch | Out-Null
    foreach ($folder in @('cache', 'tmp', 'source')) { New-Item -ItemType Directory -Path (Join-Path $reviewScratch $folder) | Out-Null }
    foreach ($file in @('strongauth.go', 'strongauth_test.go', 'providerproof.go', 'providerproof_test.go', 'capability.go', 'capability_test.go')) {
        Copy-Item -LiteralPath (Join-Path $reviewRoot "backend/internal/systembackupsecurity/$file") -Destination (Join-Path $reviewScratch "source/$file")
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'system-backup-d-a-review/review_test.go') -Destination (Join-Path $reviewScratch 'source/review_test.go')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'system-backup-d-a-review/revision_test.go') -Destination (Join-Path $reviewScratch 'source/revision_test.go')
    $env:GO111MODULE = 'off'
    $env:GOPROXY = 'off'
    $env:GOSUMDB = 'off'
    $env:GOTOOLCHAIN = 'local'
    $env:GOTELEMETRY = 'off'
    $env:GOCACHE = Join-Path $reviewScratch 'cache'
    $env:GOTMPDIR = Join-Path $reviewScratch 'tmp'
    Push-Location (Join-Path $reviewScratch 'source')
    try {
        & go test -count=1 -v -run $TestPattern .
        $reviewExit = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    foreach ($name in $reviewVariables) { [Environment]::SetEnvironmentVariable($name, $reviewPrevious[$name], 'Process') }
    if (Test-Path -LiteralPath $reviewScratch) {
        $resolvedScratch = (Resolve-Path -LiteralPath $reviewScratch).Path
        if (-not $resolvedScratch.StartsWith($reviewPrefix, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($resolvedScratch) -notmatch '^\.tmp-d-a-review-[0-9a-f]{32}$') { throw 'Refusing cleanup outside owned scratch directory' }
        Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
    }
    Write-Output ('D review scratch removed: ' + (-not (Test-Path -LiteralPath $reviewScratch)))
}
exit $reviewExit
