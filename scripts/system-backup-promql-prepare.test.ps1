$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runner = Join-Path $PSScriptRoot 'system-backup-promql-prepare.ps1'
$outputRoot = Join-Path $repoRoot 'outputs'
$testRoot = Join-Path $outputRoot ('promql-prepare-test-' + [guid]::NewGuid().ToString('N'))
$ownedBundles = [Collections.Generic.List[string]]::new()
$dockerCalls = [Collections.Generic.List[string]]::new()
$mockArchitecture = 'amd64'
$mockCopyFailure = $false
$mockId = 'a' * 64
$mockBinary = Join-Path $testRoot 'amd64'

function Assert-True($condition, $message) {
    if (-not $condition) { throw $message }
}
function Get-BundleNames {
    @(Get-ChildItem -LiteralPath $outputRoot -Directory -Filter 'cm-promql-*' | ForEach-Object Name)
}
function Assert-Rejected([scriptblock]$action, [string]$expected) {
    $before = @(Get-BundleNames) -join "`n"
    $caught = $null
    try { & $action | Out-Null } catch { $caught = $_.Exception.Message }
    Assert-True ($null -ne $caught -and $caught.Contains($expected)) "Expected rejection '$expected'; got '$caught'"
    Assert-True ((@(Get-BundleNames) -join "`n") -ceq $before) 'Failed preparation left a bundle behind'
}
function New-ElfFixture($path, [int]$machine) {
    $header = [byte[]]::new(20)
    $header[0] = 127; $header[1] = 69; $header[2] = 76; $header[3] = 70
    $header[4] = 2; $header[5] = 1
    $header[18] = $machine % 256; $header[19] = [math]::Floor($machine / 256)
    [IO.File]::WriteAllBytes($path, $header)
}
function Assert-Bundle($prepared) {
    $ownedBundles.Add($prepared.BundlePath)
    Assert-True ($prepared.RemoteDirectory -match '^/tmp/cm-promql-[0-9a-f]{32}$') 'Invalid remote directory'
    Assert-True ($prepared.PreparedChecks -eq 231 -and -not $prepared.PromQLExecuted) 'Incorrect prepared/executed status'
    $manifest = Get-Content -LiteralPath (Join-Path $prepared.BundlePath 'SHA256SUMS')
    Assert-True ($manifest.Count -eq 5) 'Expected five checksummed inputs'
    foreach ($line in $manifest) {
        Assert-True ($line -match '^([0-9a-f]{64})  ([a-zA-Z0-9.-]+)$') 'Invalid checksum format'
        $expectedHash = $Matches[1]; $name = $Matches[2]
        $actualHash = (Get-FileHash -LiteralPath (Join-Path $prepared.BundlePath $name) -Algorithm SHA256).Hash.ToLowerInvariant()
        Assert-True ($actualHash -ceq $expectedHash) "Checksum mismatch for $name"
    }
    foreach ($pair in @(
        @('thresholds.yml', 'a2-metrics-promtool-raw-series-20261027-r2.yml'),
        @('split.yml', 'a2-metrics-split-promtool-raw-series-20261027-r3.yml')
    )) {
        $copied = (Get-FileHash -LiteralPath (Join-Path $prepared.BundlePath $pair[0])).Hash
        $source = (Get-FileHash -LiteralPath (Join-Path $repoRoot ('docs/evidence/' + $pair[1]))).Hash
        Assert-True ($copied -ceq $source) 'Fixture bytes changed'
    }
    Assert-True (-not [IO.File]::ReadAllText((Join-Path $prepared.BundlePath 'run.sh')).Contains("`r")) 'Runner must use LF'
}

# An in-process Docker stand-in: no daemon, images, or real containers are used.
function docker {
    $dockerCalls.Add(($args -join ' '))
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'image' -and $args[1] -eq 'inspect') {
        return (ConvertTo-Json -InputObject @(@{ Id = 'sha256:' + ('b' * 64); Os = 'linux'; Architecture = $mockArchitecture; RepoDigests = @('prom/prometheus@sha256:' + ('c' * 64)) }) -Depth 4 -Compress)
    }
    if ($args[0] -eq 'create') { return $mockId }
    if ($args[0] -eq 'cp') {
        if ($mockCopyFailure) { $global:LASTEXITCODE = 1; return }
        Copy-Item -LiteralPath $mockBinary -Destination $args[2]
        return
    }
    if ($args[0] -eq 'rm' -and $args[1] -eq '-v') { return }
    throw ('Unexpected Docker operation: ' + ($args -join ' '))
}

try {
    [IO.Directory]::CreateDirectory($testRoot) | Out-Null
    New-ElfFixture (Join-Path $testRoot 'amd64') 62
    New-ElfFixture (Join-Path $testRoot 'arm64') 183
    [IO.File]::WriteAllText((Join-Path $testRoot 'windows.exe'), 'MZ-invalid')

    foreach ($arch in @('amd64', 'arm64')) {
        $prepared = & $runner -PromtoolPath (Join-Path $testRoot $arch) -Architecture $arch
        Assert-Bundle $prepared
        $origin = Get-Content -LiteralPath (Join-Path $prepared.BundlePath 'tool-origin.json') -Raw | ConvertFrom-Json
        Assert-True ($origin.platform -eq "linux/$arch" -and -not $origin.PromQL_executed) 'Incorrect tool origin'
    }
    Assert-True ($dockerCalls.Count -eq 0) 'Binary preparation contacted Docker'
    Assert-Rejected { & $runner -PromtoolPath (Join-Path $testRoot 'windows.exe') -Architecture amd64 } 'ELF'
    Assert-Rejected { & $runner -PromtoolPath (Join-Path $testRoot 'arm64') -Architecture amd64 } 'architecture'

    $prepared = & $runner -Image 'prom/prometheus:pinned-test' -Architecture amd64
    Assert-Bundle $prepared
    Assert-True ($dockerCalls.Count -eq 4) 'Expected inspect, create, cp, rm only'
    Assert-True ($dockerCalls[1].Contains('--pull=never --platform linux/amd64 --network none sha256:')) 'Extraction must use pinned ID and never pull'
    Assert-True ($dockerCalls[3] -eq "rm -v $mockId") 'Extraction container/volume not removed'

    $dockerCalls.Clear()
    $mockArchitecture = 'arm64'
    Assert-Rejected { & $runner -Image 'prom/prometheus:wrong-arch' -Architecture amd64 } 'platform'
    Assert-True ($dockerCalls.Count -eq 1) 'Wrong image platform should fail before container creation'

    $dockerCalls.Clear()
    $mockArchitecture = 'amd64'
    $mockCopyFailure = $true
    Assert-Rejected { & $runner -Image 'prom/prometheus:copy-failure' -Architecture amd64 } 'extract'
    Assert-True ($dockerCalls[-1] -eq "rm -v $mockId") 'Failed extraction leaked its container'
    'PASS: binary preparation (amd64/arm64), checksums, unchanged fixtures, invalid binary/architecture rejection, mocked image extraction and failure cleanup. No real promtool, Docker, SSH, or PromQL executed.'
} finally {
    foreach ($path in @($ownedBundles.ToArray()) + @($testRoot)) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $resolved = (Resolve-Path -LiteralPath $path).Path
        if ($resolved -ne $path -or [IO.Path]::GetDirectoryName($resolved) -ne $outputRoot) { throw 'Unsafe test cleanup path' }
        foreach ($item in @((Get-Item -LiteralPath $resolved -Force)) + @(Get-ChildItem -LiteralPath $resolved -Recurse -Force)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected test cleanup path' }
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
