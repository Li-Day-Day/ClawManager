$ErrorActionPreference = 'Stop'
$validationRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$validationPrefix = $validationRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$validationScratch = Join-Path $validationRoot ('.tmp-a-security-' + [guid]::NewGuid().ToString('N'))
if (-not $validationScratch.StartsWith($validationPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Scratch outside workspace' }
$validationNames = @('GO111MODULE', 'GOPROXY', 'GOSUMDB', 'GOTOOLCHAIN', 'GOCACHE', 'GOTMPDIR', 'GOTELEMETRY')
$validationPrevious = @{}
foreach ($name in $validationNames) { $validationPrevious[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$validationExit = 1
try {
    foreach ($folder in @('cache', 'tmp', 'source')) { New-Item -ItemType Directory -Path (Join-Path $validationScratch $folder) -Force | Out-Null }
    Get-ChildItem -LiteralPath (Join-Path $validationRoot 'backend/internal/systembackupsecurity') -Filter '*.go' -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $validationScratch 'source')
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'system-backup-d-a-review/review_test.go') -Destination (Join-Path $validationScratch 'source/review_test.go')
    $env:GO111MODULE = 'off'; $env:GOPROXY = 'off'; $env:GOSUMDB = 'off'; $env:GOTOOLCHAIN = 'local'; $env:GOTELEMETRY = 'off'
    $env:GOCACHE = Join-Path $validationScratch 'cache'
    $env:GOTMPDIR = Join-Path $validationScratch 'tmp'
    Push-Location (Join-Path $validationScratch 'source')
    try {
        & go test -count=1 -v .
        if ($LASTEXITCODE -ne 0) { throw 'A security or unchanged D acceptance probes failed' }
    } finally { Pop-Location }
    Push-Location $validationRoot
    try {
        foreach ($script in @('system-backup-a-security.test.mjs', 'system-backup-a-object-fixtures.test.mjs', 'system-backup-a-identity-ssh.test.mjs', 'system-backup-contract-artifacts.test.mjs', 'system-backup-contract-check.test.mjs')) {
            & node (Join-Path $PSScriptRoot $script)
            if ($LASTEXITCODE -ne 0) { throw "Failed: $script" }
        }
        & node scripts/system-backup-schema-inventory.mjs --check
        if ($LASTEXITCODE -ne 0) { throw 'Inventory check failed' }
        & node scripts/system-backup-contract-check.mjs --check
        if ($LASTEXITCODE -ne 0) { throw 'Contract check failed' }
    } finally { Pop-Location }
    $validationExit = 0
} finally {
    foreach ($name in $validationNames) { [Environment]::SetEnvironmentVariable($name, $validationPrevious[$name], 'Process') }
    if (Test-Path -LiteralPath $validationScratch) {
        $resolvedValidationScratch = (Resolve-Path -LiteralPath $validationScratch).Path
        if (-not $resolvedValidationScratch.StartsWith($validationPrefix, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($resolvedValidationScratch) -notmatch '^\.tmp-a-security-[0-9a-f]{32}$') { throw 'Refusing cleanup outside run-owned scratch' }
        Remove-Item -LiteralPath $resolvedValidationScratch -Recurse -Force
    }
    Write-Output ('A validation scratch removed: ' + (-not (Test-Path -LiteralPath $validationScratch)))
}
exit $validationExit
