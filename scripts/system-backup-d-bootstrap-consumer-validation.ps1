[CmdletBinding()]
param([switch]$Joint, [ValidatePattern('^[a-f0-9]{32}$')][string]$PriorRunID, [string]$CacheSeedDirectory)
$ErrorActionPreference = 'Stop'
$consumerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$consumerID = [guid]::NewGuid().ToString('N')
$consumerScratch = Join-Path $consumerRoot ('.tmp-d-bootstrap-consumer-' + $consumerID)
$consumerEvidence = Join-Path $consumerRoot ('docs/evidence/d-bootstrap-consumer-native-' + $consumerID)
$consumerNames = @('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$consumerSaved = @{}
foreach ($name in $consumerNames) { $consumerSaved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
function Get-ConsumerFiles {
    if ($Joint) {
        $paths = @(& rg --files --hidden backend contracts scripts)
        if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate joint source' }
        $paths += @('docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/system-backup-d-config-maintenance-082-proposal-20261015.sql','docs/system-backup-d-admin-read-index-candidate-20261012.sql','docs/system-backup-d-download-admission-schema-proposal-20261019.sql')
        return @($paths | ForEach-Object { $_.Replace('\','/') } | Sort-Object -Unique)
    }
    $paths = @('backend/go.mod','backend/go.sum')
    $paths += @(Get-ChildItem -LiteralPath (Join-Path $consumerRoot 'backend/internal/systembackupproducer') -Recurse -File | ForEach-Object { [IO.Path]::GetRelativePath($consumerRoot,$_.FullName).Replace('\','/') })
    $paths += @('contracts/system-backup/v12/producer-authority-vectors.json','contracts/system-backup/v12/producer-authority.schema.json','contracts/system-backup/v12/producer-authority-persistence.json','contracts/system-backup/v12/producer-authority-candidate.sql')
    return @($paths | Sort-Object -Unique)
}
function Get-ConsumerPins([string]$base,[string[]]$paths) {
    return @($paths | ForEach-Object { $file=Get-Item -LiteralPath (Join-Path $base $_); if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Redirected source rejected' }; [ordered]@{path=$_;size=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
}
$consumerReport = [ordered]@{kind='d_bootstrap_consumer_native.v1';scope='producer_package_and_four_contract_fixtures_only';status='failed';dependencies_installed=$false;tests_started=$false;cleaned=$false}
if ($Joint) { $consumerReport.scope='backend_contracts_scripts_and_seven_named_document_fixtures'; $consumerReport.kind='d_bootstrap_consumer_joint_native.v1' }
try {
    if ($CacheSeedDirectory) {
        $seed=(Resolve-Path -LiteralPath $CacheSeedDirectory).Path
        $seedOwner=[IO.Path]::GetDirectoryName($seed)
        if ([IO.Path]::GetFileName($seed) -cne 'cache' -or [IO.Path]::GetDirectoryName($seedOwner) -cne $consumerRoot -or [IO.Path]::GetFileName($seedOwner) -notmatch '^\.tmp-[A-Za-z0-9-]+$' -or ((Get-Item -Force -LiteralPath $seedOwner).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Cache seed must be a plain workspace-owned temporary cache' }
        if (@(Get-ChildItem -LiteralPath $seed -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -ne 0) { throw 'Redirected cache seed rejected' }
        [IO.Directory]::CreateDirectory((Join-Path $consumerScratch 'cache')) | Out-Null
        Get-ChildItem -LiteralPath $seed -Force | Copy-Item -Destination (Join-Path $consumerScratch 'cache') -Recurse -Force
        $consumerReport.cache_seed_directory=[IO.Path]::GetRelativePath($consumerRoot,$seed).Replace('\','/')
        $consumerReport.cache_only_not_test_result_reuse=$true
    }
    if ($PriorRunID) {
        $priorCache=Join-Path $consumerRoot ('.tmp-d-bootstrap-consumer-'+$PriorRunID+'/cache')
        $priorReport=Join-Path $consumerRoot ('docs/evidence/d-bootstrap-consumer-native-'+$PriorRunID+'.json')
        [IO.Directory]::CreateDirectory((Join-Path $consumerScratch 'cache')) | Out-Null
        if (Test-Path -LiteralPath $priorCache) {
            $cacheItem=Get-Item -LiteralPath $priorCache
            if (($cacheItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Redirected prior cache rejected' }
            Get-ChildItem -LiteralPath $priorCache -Force | Copy-Item -Destination (Join-Path $consumerScratch 'cache') -Recurse -Force
            $consumerReport.cache_seed_owner=$PriorRunID
        }
        Write-Output ('WAIT prior native cleanup='+$PriorRunID)
        $waitUntil=[DateTime]::UtcNow.AddMinutes(120)
        while (-not (Test-Path -LiteralPath $priorReport)) { if ([DateTime]::UtcNow -ge $waitUntil) { throw 'Prior native run did not complete before bounded wait' }; Start-Sleep -Milliseconds 250 }
        $prior=Get-Content -Raw -LiteralPath $priorReport | ConvertFrom-Json
        if ($prior.cleaned -ne $true) { throw 'Prior native owner has not cleaned its products' }
        $consumerReport.prior_run_status=$prior.status
    }
    $paths = Get-ConsumerFiles
    $pins = Get-ConsumerPins $consumerRoot $paths
    [IO.Directory]::CreateDirectory($consumerScratch) | Out-Null
    foreach ($path in $paths) { $target=Join-Path $consumerScratch $path; [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null; Copy-Item -LiteralPath (Join-Path $consumerRoot $path) -Destination $target }
    $snapshot = Get-ConsumerPins $consumerScratch $paths
    $sourceAfterCopy = Get-ConsumerPins $consumerRoot (Get-ConsumerFiles)
    if (($pins | ConvertTo-Json -Depth 5 -Compress) -cne ($snapshot | ConvertTo-Json -Depth 5 -Compress) -or ($pins | ConvertTo-Json -Depth 5 -Compress) -cne ($sourceAfterCopy | ConvertTo-Json -Depth 5 -Compress)) { throw 'Source changed during snapshot; tests not started' }
    $consumerReport.files=$pins
    $consumerReport.snapshot_verified=$true
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOTELEMETRY='off'; $env:GOFLAGS='-mod=readonly -p=1'; $env:GO111MODULE='on'; $env:GOWORK='off'; $env:GOMAXPROCS='2'; $env:CGO_ENABLED='0'; $env:GOOS='windows'; $env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $consumerScratch 'cache'; $env:GOTMPDIR=Join-Path $consumerScratch 'tmp'
    [IO.Directory]::CreateDirectory($env:GOCACHE) | Out-Null; [IO.Directory]::CreateDirectory($env:GOTMPDIR) | Out-Null
    $env:TEST_TELEMETRY_DIR=Join-Path $consumerScratch 'telemetry'
    [IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR) | Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $telemetryJSON=@(& go env -json GOTELEMETRY GOTELEMETRYDIR)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify isolated Go telemetry' }
    $telemetry=($telemetryJSON -join "`n") | ConvertFrom-Json
    if ($telemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -ne $env:TEST_TELEMETRY_DIR) { throw 'Go toolchain did not honor owned telemetry directory' }
    $consumerReport.telemetry='off_owned_directory_verified'
    Write-Output ('FROZEN producer snapshot=' + $consumerID)
    Push-Location (Join-Path $consumerScratch 'backend')
    try {
        $consumerReport.tests_started=$true
        if ($Joint) {
            & go test -json -count=1 -run '^Test(BootstrapIndependent|BootstrapCandidate|CaptureCandidate|CandidateConfig|PinnedBootstrapCandidate)' ./internal/systembackupproducer ./internal/systembackupsecurity ./internal/systembackupbootstrapsecurity 2>&1 | Tee-Object -FilePath ($consumerEvidence+'.targeted.jsonl') | Out-Null
            $consumerReport.targeted_exit=$LASTEXITCODE
            if ($LASTEXITCODE -ne 0) { throw 'Joint targeted native tests failed; inspect targeted log' }
            $targetedEvents=@(Get-Content -LiteralPath ($consumerEvidence+'.targeted.jsonl') | Where-Object { $_.StartsWith('{') } | ForEach-Object { $_ | ConvertFrom-Json })
            foreach ($package in @('clawreef/internal/systembackupproducer','clawreef/internal/systembackupsecurity','clawreef/internal/systembackupbootstrapsecurity')) { if (@($targetedEvents | Where-Object { $_.Package -eq $package -and $_.Action -eq 'pass' -and $_.Test }).Count -eq 0) { throw ('No successful targeted tests for '+$package) } }
        }
        $packages=@('./internal/systembackupproducer')
        if ($Joint) { $packages=@('./internal/systembackupproducer','./internal/systembackupsecurity','./internal/systembackupbootstrapsecurity','./internal/systembackupevidence','./internal/systembackupresources','./internal/systembackupread','./cmd/server') }
        & go test -json -count=1 @packages 2>&1 | Tee-Object -FilePath ($consumerEvidence+'.jsonl') | Out-Null
        $consumerReport.test_exit=$LASTEXITCODE
        if ($LASTEXITCODE -ne 0) { throw 'Producer native tests failed; see exact snapshot evidence' }
        $events=@(Get-Content -LiteralPath ($consumerEvidence+'.jsonl') | Where-Object { $_.StartsWith('{') } | ForEach-Object { $_ | ConvertFrom-Json })
        $consumerReport.tests_passed=@($events | Where-Object { $_.Action -eq 'pass' -and $_.Test }).Count
        $consumerReport.tests_skipped=@($events | Where-Object { $_.Action -eq 'skip' -and $_.Test }).Count
        $consumerReport.bootstrap_tests=@($events | Where-Object { $_.Action -eq 'pass' -and $_.Test -match '^TestBootstrapIndependent[^/]*$' } | ForEach-Object Test)
        $consumerReport.package_passes=@($events | Where-Object { $_.Action -eq 'pass' -and -not $_.Test } | ForEach-Object Package)
        if ($consumerReport.bootstrap_tests.Count -eq 0 -or @($events | Where-Object { $_.Action -eq 'fail' }).Count -ne 0 -or $consumerReport.package_passes.Count -ne $packages.Count) { throw 'Missing successful native consumer/package test events' }
        if ($Joint) {
            $env:GOOS='linux'
            & go build -o (Join-Path $consumerScratch 'linux-server') ./cmd/server 2>&1 | Set-Content -LiteralPath ($consumerEvidence+'.linux-build.txt') -Encoding utf8
            if ($LASTEXITCODE -ne 0) { throw 'Linux server build failed' }
            & go build -o (Join-Path $consumerScratch 'linux-bootstrap') ./cmd/system-backup-bootstrap 2>&1 | Add-Content -LiteralPath ($consumerEvidence+'.linux-build.txt') -Encoding utf8
            if ($LASTEXITCODE -ne 0) { throw 'Linux bootstrap build failed' }
            $consumerReport.linux_builds=@('server','system-backup-bootstrap')
        }
    } finally { Pop-Location }
    $after=Get-ConsumerPins $consumerScratch $paths
    if (($snapshot | ConvertTo-Json -Depth 5 -Compress) -cne ($after | ConvertTo-Json -Depth 5 -Compress)) { throw 'Snapshot changed during tests' }
    $consumerReport.snapshot_unchanged=$true
    $current=Get-ConsumerPins $consumerRoot (Get-ConsumerFiles)
    $consumerReport.current_source_matches_snapshot=(($pins | ConvertTo-Json -Depth 5 -Compress) -ceq ($current | ConvertTo-Json -Depth 5 -Compress))
    $consumerReport.status='passed_exact_snapshot'
} catch {
    $consumerReport.error=$_.Exception.Message
    throw
} finally {
    foreach ($name in $consumerNames) { [Environment]::SetEnvironmentVariable($name,$consumerSaved[$name],'Process') }
    if (Test-Path -LiteralPath $consumerScratch) {
        $resolved=(Resolve-Path -LiteralPath $consumerScratch).Path
        if (-not $resolved.StartsWith($consumerRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -cne ('.tmp-d-bootstrap-consumer-'+$consumerID)) { throw 'Refusing cleanup outside exact owned consumer scratch' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    $consumerReport.cleaned=-not (Test-Path -LiteralPath $consumerScratch)
    $consumerReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($consumerEvidence+'.json') -Encoding utf8
    Write-Output ('CLEANED bootstrap-consumer='+$consumerReport.cleaned+' evidence='+$consumerEvidence+'.json')
}
