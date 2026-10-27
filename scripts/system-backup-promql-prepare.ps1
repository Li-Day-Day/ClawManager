[CmdletBinding(DefaultParameterSetName = 'Binary')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Binary')]
    [string]$PromtoolPath,
    [Parameter(Mandatory, ParameterSetName = 'Image')]
    [string]$Image,
    [Parameter(Mandatory)]
    [ValidateSet('amd64', 'arm64')]
    [string]$Architecture
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = Join-Path $repoRoot 'outputs'
$token = [guid]::NewGuid().ToString('N')
$bundle = Join-Path $outputRoot ('cm-promql-' + $token)
$containerId = $null
$complete = $false
$utf8 = [Text.UTF8Encoding]::new($false)

try {
    if (Test-Path -LiteralPath $bundle) { throw 'Bundle directory already exists' }
    [IO.Directory]::CreateDirectory($bundle) | Out-Null
    $origin = [ordered]@{
        kind = 'a2_promql_bundled_tool.v1'
        platform = "linux/$Architecture"
        preparation = $PSCmdlet.ParameterSetName
        dependencies_installed = $false
        image_pulled = $false
        container_started = $false
        remote_contacted = $false
        PromQL_executed = $false
    }
    $binary = Join-Path $bundle 'promtool'
    if ($PSCmdlet.ParameterSetName -eq 'Image') {
        # Inspect only: never pull an image or start Docker Desktop.
        $inspection = & docker image inspect $Image
        if ($LASTEXITCODE -ne 0) { throw 'Image unavailable locally, or Docker is not running. Prepare it manually first.' }
        $images = @((($inspection -join "`n") | ConvertFrom-Json))
        if ($images.Count -ne 1) { throw 'Expected exactly one local image' }
        $info = $images[0]
        if ($info.Os -ne 'linux' -or $info.Architecture -ne $Architecture) {
            throw "Image platform does not match linux/$Architecture"
        }
        $origin.image_reference = $Image
        $origin.image_id = $info.Id
        $origin.repo_digests = @($info.RepoDigests)
        $created = & docker create --pull=never --platform "linux/$Architecture" --network none $info.Id
        if ($LASTEXITCODE -ne 0) { throw 'Could not create extraction container' }
        $containerId = ($created -join '').Trim()
        if ($containerId -notmatch '^[0-9a-f]{64}$') { throw 'Unexpected container ID' }
        & docker cp "${containerId}:/bin/promtool" $binary
        if ($LASTEXITCODE -ne 0) { throw 'Could not extract /bin/promtool' }
    } else {
        $source = (Resolve-Path -LiteralPath $PromtoolPath).Path
        Copy-Item -LiteralPath $source -Destination $binary
    }

    # Reject Windows executables and binaries for a different remote CPU.
    $header = [byte[]]::new(20)
    $stream = [IO.File]::OpenRead($binary)
    try { $bytesRead = $stream.Read($header, 0, $header.Length) } finally { $stream.Dispose() }
    if ($bytesRead -ne 20 -or $header[0] -ne 127 -or $header[1] -ne 69 -or $header[2] -ne 76 -or $header[3] -ne 70 -or $header[4] -ne 2 -or $header[5] -ne 1) {
        throw 'Expected a 64-bit little-endian ELF promtool binary, not promtool.exe'
    }
    $machine = [int]$header[18] + 256 * [int]$header[19]
    $expectedMachine = if ($Architecture -eq 'amd64') { 62 } else { 183 }
    if ($machine -ne $expectedMachine) { throw 'ELF architecture does not match the requested remote architecture' }
    $origin.binary_sha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $bundle 'tool-origin.json'), ($origin | ConvertTo-Json -Depth 6) + "`n", $utf8)

    Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/evidence/a2-metrics-promtool-raw-series-20261027-r2.yml') -Destination (Join-Path $bundle 'thresholds.yml')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/evidence/a2-metrics-split-promtool-raw-series-20261027-r3.yml') -Destination (Join-Path $bundle 'split.yml')
    $runner = [IO.File]::ReadAllText((Join-Path $repoRoot 'docs/evidence/a2-promql-remote-run-20261027-r2.sh')).Replace("`r`n", "`n")
    [IO.File]::WriteAllText((Join-Path $bundle 'run.sh'), $runner, $utf8)
    $checksums = foreach ($name in @('thresholds.yml', 'split.yml', 'run.sh', 'promtool', 'tool-origin.json')) {
        $hash = (Get-FileHash -LiteralPath (Join-Path $bundle $name) -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $name"
    }
    [IO.File]::WriteAllText((Join-Path $bundle 'SHA256SUMS'), ($checksums -join "`n") + "`n", $utf8)
    $complete = $true
} finally {
    try {
        if ($containerId -match '^[0-9a-f]{64}$') {
            & docker rm -v $containerId | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not remove extraction container $containerId" }
        }
    } finally {
        if (-not $complete -and (Test-Path -LiteralPath $bundle)) {
            $resolved = (Resolve-Path -LiteralPath $bundle).Path
            if ($resolved -ne $bundle -or [IO.Path]::GetDirectoryName($resolved) -ne $outputRoot -or [IO.Path]::GetFileName($resolved) -ne ('cm-promql-' + $token)) { throw 'Unsafe cleanup path' }
            foreach ($item in @((Get-Item -LiteralPath $resolved -Force)) + @(Get-ChildItem -LiteralPath $resolved -Recurse -Force)) {
                if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing redirected cleanup' }
            }
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}
[pscustomobject]@{
    BundlePath = $bundle
    RemoteDirectory = "/tmp/cm-promql-$token"
    PreparedGroups = 97
    PreparedChecks = 231
    PromQLExecuted = $false
}
