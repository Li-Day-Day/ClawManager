$ErrorActionPreference = 'Stop'
$reviewRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$reviewPrefix = $reviewRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$reviewScratch = Join-Path $reviewRoot ('.tmp-a-d-registration-review-' + [guid]::NewGuid().ToString('N'))
$reviewNames = @('GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOTELEMETRY','GOMAXPROCS','GOFLAGS','A_REVIEW_ROOT')
$reviewPrevious = @{}
foreach ($name in $reviewNames) { $reviewPrevious[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$reviewExit = 1
try {
    foreach ($folder in @('cache','tmp','source')) { [IO.Directory]::CreateDirectory((Join-Path $reviewScratch $folder)) | Out-Null }
    Get-ChildItem -LiteralPath (Join-Path $reviewRoot 'backend/internal/systembackupsecurity') -Filter '*.go' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $reviewScratch 'source') }
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'system-backup-a-d-registration-review') -Filter '*_test.go' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $reviewScratch ('source/a_'+$_.Name)) }
    foreach ($file in @('go.mod','go.sum')) { Copy-Item -LiteralPath (Join-Path $reviewRoot ('backend/'+$file)) -Destination (Join-Path $reviewScratch ('source/'+$file)) }
    $env:GO111MODULE='on'; $env:GOWORK='off'; $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOTELEMETRY='off'
    $env:GOMAXPROCS='2'; $env:GOFLAGS='-mod=readonly -p=1'; $env:A_REVIEW_ROOT=$reviewRoot
    $env:GOCACHE=Join-Path $reviewScratch 'cache'; $env:GOTMPDIR=Join-Path $reviewScratch 'tmp'
    Push-Location (Join-Path $reviewScratch 'source')
    try { & go test -count=1 -v -run '^TestAReview' .; $reviewExit=$LASTEXITCODE } finally { Pop-Location }
} finally {
    foreach ($name in $reviewNames) { [Environment]::SetEnvironmentVariable($name,$reviewPrevious[$name],'Process') }
    if (Test-Path -LiteralPath $reviewScratch) {
        $reviewResolved=(Resolve-Path -LiteralPath $reviewScratch).Path
        if (-not $reviewResolved.StartsWith($reviewPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($reviewResolved) -notmatch '^\.tmp-a-d-registration-review-[a-f0-9]{32}$') { throw 'Refusing cleanup outside owned scratch' }
        Remove-Item -LiteralPath $reviewResolved -Recurse -Force
    }
    Write-Output ('A review scratch removed: ' + (-not (Test-Path -LiteralPath $reviewScratch)))
}
exit $reviewExit
