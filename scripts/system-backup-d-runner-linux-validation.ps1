[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[0-9a-f]{64}$')]
    [string]$RuntimeImage = '10.130.14.23:5000/clawmanager@sha256:d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e',
    [switch]$CheckOnly,
    [switch]$ValidatePackage
)
$ErrorActionPreference = 'Stop'
$runnerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runnerID = [guid]::NewGuid().ToString('N')
$runnerScratch = Join-Path $runnerRoot ('.tmp-d-runner-linux-' + $runnerID)
$runnerContainer = 'd-runner-linux-' + $runnerID
$runnerLabel = 'clawmanager.d-runner-validation=' + $runnerID
$runnerVars = @('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$runnerSaved = @{}
$runnerDockerUsed = $false
$runnerCleanupOK = $true
$runnerPackageTag = 'clawmanager-d-runner-validation:' + $runnerID
$runnerPackageStarted = $false
$runnerPackageID = $null
foreach ($name in $runnerVars) { $runnerSaved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }

# Hash repository build inputs before and after compilation. This deliberately
# includes unused backend Go sources too; concurrent changes reject this run.
function Get-RunnerSourceHash {
    $files = @(Get-ChildItem -LiteralPath (Join-Path $runnerRoot 'backend') -Recurse -File |
        Where-Object { $_.Extension -in @('.go','.sql') -or $_.Name -in @('go.mod','go.sum') } |
        Sort-Object FullName)
    $lines = @($files | ForEach-Object {
        $_.FullName.Substring($runnerRoot.Length + 1).Replace('\','/') + ' ' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    })
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($lines -join "`n") + "`n")))).Replace('-','').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}

function Invoke-RunnerContainer {
    param([string[]]$Arguments, [int]$ExpectedExit = 0, [string]$Image = $RuntimeImage, [switch]$Packaged)
    $runArgs = @('run','--rm','--pull=never','--name',$runnerContainer,'--label',$runnerLabel,
        '--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
        '--user','65532:65532')
    if ($Packaged) { $runArgs += @('--entrypoint','/system-backup-migrate',$Image) }
    else { $runArgs += @('--mount',('type=bind,source=' + (Join-Path $runnerScratch 'system-backup-migrate') + ',target=/d-reviewed-migrate,readonly'),'--entrypoint','/d-reviewed-migrate',$Image) }
    $runArgs += $Arguments
    $output = @(& docker @runArgs 2>&1)
    if ($LASTEXITCODE -ne $ExpectedExit) { throw 'Linux CLI exited unexpectedly; no database/network was supplied' }
    return ($output -join "`n")
}

try {
    foreach ($tool in @('go','node','docker')) { Get-Command $tool -ErrorAction Stop | Out-Null }
    if ($ValidatePackage) { Add-Type -AssemblyName System.Formats.Tar -ErrorAction Stop }
    if ($runnerRoot.Contains(',') -or $runnerRoot.Contains("`n")) { throw 'Unsupported bind mount path' }
    if ($CheckOnly) { Write-Output 'CHECK_ONLY local-tools=yes no-build=no-docker=no-database'; return }
    $serverOS = & docker version --format '{{.Server.Os}}'
    if ($LASTEXITCODE -ne 0 -or $serverOS -ne 'linux') { throw 'Existing Linux Docker engine required; no installation or pull will be attempted' }
    $imageJSON = & docker image inspect $RuntimeImage
    if ($LASTEXITCODE -ne 0) { throw 'Pinned runtime image must already be present; pull disabled' }
    $imageInfo = @($imageJSON | ConvertFrom-Json)[0]
    if ($imageInfo.Os -ne 'linux' -or $imageInfo.Architecture -ne 'amd64' -or $RuntimeImage -notin $imageInfo.RepoDigests) { throw 'Runtime image identity/platform mismatch' }
    $runnerDockerUsed = $true
    foreach ($folder in @('cache','tmp','telemetry')) { [IO.Directory]::CreateDirectory((Join-Path $runnerScratch $folder)) | Out-Null }
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOTELEMETRY='off'; $env:GOFLAGS='-mod=readonly -p=1'; $env:GO111MODULE='on'; $env:GOWORK='off'; $env:GOMAXPROCS='1'; $env:CGO_ENABLED='0'; $env:GOOS='linux'; $env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $runnerScratch 'cache'; $env:GOTMPDIR=Join-Path $runnerScratch 'tmp'; $env:TEST_TELEMETRY_DIR=Join-Path $runnerScratch 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    $sourceHash = Get-RunnerSourceHash
    Push-Location $runnerRoot
    try {
        $catalogRaw = & node --input-type=module -e 'import {computeMigrationCatalog} from "./scripts/system-backup-contract-check.mjs"; import {readdirSync} from "node:fs"; console.log(JSON.stringify({...computeMigrationCatalog(), filenames:readdirSync("backend/internal/db/migrations").filter(x=>x.endsWith(".sql")).sort()}));'
        if ($LASTEXITCODE -ne 0) { throw 'Repository catalog calculation failed' }
        $expectedCatalog = $catalogRaw | ConvertFrom-Json
    } finally { Pop-Location }
    Push-Location (Join-Path $runnerRoot 'backend')
    try {
        Write-Output 'BUILD linux-runner offline=true trimpath=true'
        & go build -trimpath -o (Join-Path $runnerScratch 'system-backup-migrate') ./cmd/system-backup-migrate
        if ($LASTEXITCODE -ne 0) { throw 'Offline Linux runner build failed' }
    } finally { Pop-Location }
    if ((Get-RunnerSourceHash) -ne $sourceHash) { throw 'Source changed during compilation; receipt rejected' }
    $binaryHash = (Get-FileHash -LiteralPath (Join-Path $runnerScratch 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant()
    $actualCatalog = (Invoke-RunnerContainer -Arguments @('--catalog-only')) | ConvertFrom-Json
    if ($actualCatalog.algorithm -ne $expectedCatalog.algorithm -or $actualCatalog.sha256 -ne $expectedCatalog.hash -or
        $actualCatalog.file_count -ne $expectedCatalog.file_count -or ($actualCatalog.filenames -join "`n") -cne ($expectedCatalog.filenames -join "`n")) { throw 'Linux runtime catalog mismatch' }
    $helpText = Invoke-RunnerContainer -Arguments @('--help')
    foreach ($flag in @('history-review-file','expected-history-review-sha256','historical-sql-dir')) {
        if (-not $helpText.Contains('-' + $flag)) { throw 'Reviewed-history CLI flag missing' }
    }
    $rejected = Invoke-RunnerContainer -Arguments @('--apply','--expected-server-uuid','11111111-1111-1111-1111-111111111111','--expected-database','clawmanager','--expected-catalog-sha256',$expectedCatalog.hash,'--history-review-file','/missing-review') -ExpectedExit 1
    if ($rejected.Trim() -ne 'migration rejected or failed; partial DDL may exist; retain the same target/catalog for recovery') { throw 'Linux CLI public rejection output mismatch' }
    if ($ValidatePackage) {
        # Import a rootfs containing only this executable. No base-image pull,
        # Dockerfile RUN, dependency installation or BuildKit cache is involved.
        $archivePath = Join-Path $runnerScratch 'runner-rootfs.tar'
        $archiveStream = [IO.File]::Create($archivePath)
        try {
            $archiveWriter = [System.Formats.Tar.TarWriter]::new($archiveStream, $true)
            try {
                $binaryStream = [IO.File]::OpenRead((Join-Path $runnerScratch 'system-backup-migrate'))
                try {
                    $entry = [System.Formats.Tar.PaxTarEntry]::new([System.Formats.Tar.TarEntryType]::RegularFile,'system-backup-migrate')
                    $entry.Mode = [IO.UnixFileMode]493 # 0755; explicit on Windows.
                    $entry.Uid=0; $entry.Gid=0; $entry.ModificationTime=[DateTimeOffset]::FromUnixTimeSeconds(0)
                    $entry.DataStream=$binaryStream
                    $archiveWriter.WriteEntry($entry)
                } finally { $binaryStream.Dispose() }
            } finally { $archiveWriter.Dispose() }
        } finally { $archiveStream.Dispose() }
        $runnerPackageStarted=$true
        $importOutput = & docker image import --platform linux/amd64 --change 'USER 65532:65532' --change 'ENTRYPOINT ["/system-backup-migrate"]' --change ('LABEL ' + $runnerLabel) $archivePath $runnerPackageTag
        if ($LASTEXITCODE -ne 0) { throw 'Offline runner image import failed' }
        $runnerPackageID = ($importOutput -join '').Trim()
        if ($runnerPackageID -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Imported runner image ID invalid' }
        $packagedRaw = & docker image inspect $runnerPackageTag
        if ($LASTEXITCODE -ne 0) { throw 'Imported runner image unavailable' }
        $packagedInfo = @($packagedRaw | ConvertFrom-Json)[0]
        if ($packagedInfo.Id -ne $runnerPackageID -or $packagedInfo.Config.User -ne '65532:65532' -or
            ($packagedInfo.Config.Entrypoint -join '') -ne '/system-backup-migrate' -or
            $packagedInfo.Config.Labels.'clawmanager.d-runner-validation' -ne $runnerID) { throw 'Imported runner image configuration mismatch' }
        $packagedCatalog = (Invoke-RunnerContainer -Image $runnerPackageID -Packaged -Arguments @('--catalog-only')) | ConvertFrom-Json
        if ($packagedCatalog.sha256 -ne $actualCatalog.sha256 -or $packagedCatalog.algorithm -ne $actualCatalog.algorithm -or
            $packagedCatalog.file_count -ne $actualCatalog.file_count -or ($packagedCatalog.filenames -join "`n") -cne ($actualCatalog.filenames -join "`n")) { throw 'Packaged runner catalog mismatch' }
        $packagedHelp = Invoke-RunnerContainer -Image $runnerPackageID -Packaged -Arguments @('--help')
        foreach ($flag in @('history-review-file','expected-history-review-sha256','historical-sql-dir')) {
            if (-not $packagedHelp.Contains('-' + $flag)) { throw 'Packaged runner historical flag missing' }
        }
        $packagedRejection = Invoke-RunnerContainer -Image $runnerPackageID -Packaged -Arguments @('--apply') -ExpectedExit 1
        if ($packagedRejection.Trim() -ne $rejected.Trim()) { throw 'Packaged runner rejection output mismatch' }
    }
    if ((Get-RunnerSourceHash) -ne $sourceHash) { throw 'Source changed during runtime validation; receipt rejected' }
    if ((Get-FileHash -LiteralPath (Join-Path $runnerScratch 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binaryHash) { throw 'Runner binary changed during validation' }
    [ordered]@{result='PASS';scope='Linux CLI catalog/help/rejection only';runtime_image=$RuntimeImage;runtime_image_id=$imageInfo.Id;mounted_runner_sha256=$binaryHash;source_backend_go_sql_modules_sha256=$sourceHash;catalog_sha256=$actualCatalog.sha256;migration_count=$actualCatalog.file_count;new_image_built=[bool]$ValidatePackage;packaged_image_id=$runnerPackageID;image_published=$false;database_connected=$false;production_upgrade=$false} | ConvertTo-Json
} finally {
    foreach ($name in $runnerVars) { [Environment]::SetEnvironmentVariable($name,$runnerSaved[$name],'Process') }
    if ($runnerDockerUsed) {
        $left = @(& docker ps -aq --filter ('name=^/' + $runnerContainer + '$') --filter ('label=' + $runnerLabel))
        if ($LASTEXITCODE -ne 0) { $runnerCleanupOK=$false }
        elseif ($left.Count -gt 0) {
            & docker rm -f @left | Out-Null
            if ($LASTEXITCODE -ne 0) { $runnerCleanupOK=$false }
        }
    }
    if ($runnerPackageStarted) {
        $packageLeft = @(& docker image ls -q --no-trunc --filter ('reference=' + $runnerPackageTag))
        if ($LASTEXITCODE -ne 0) { $runnerCleanupOK=$false }
        elseif ($packageLeft.Count -gt 0) {
            $cleanupInfoRaw = & docker image inspect $runnerPackageTag
            if ($LASTEXITCODE -ne 0) { $runnerCleanupOK=$false }
            else {
                $cleanupInfo = @($cleanupInfoRaw | ConvertFrom-Json)[0]
                if ($cleanupInfo.Config.Labels.'clawmanager.d-runner-validation' -ne $runnerID) { $runnerCleanupOK=$false }
                else {
                    & docker image rm $runnerPackageTag | Out-Null
                    if ($LASTEXITCODE -ne 0) { $runnerCleanupOK=$false }
                }
            }
        }
    }
    if (Test-Path -LiteralPath $runnerScratch) {
        $resolved = (Resolve-Path -LiteralPath $runnerScratch).Path
        if ($resolved -ne (Join-Path $runnerRoot ('.tmp-d-runner-linux-' + $runnerID))) { throw 'Refusing cleanup outside owned runner scratch' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output ('CLEANED runner-build-cache=' + (-not(Test-Path -LiteralPath $runnerScratch)) + ' owned-container-and-test-image=' + $runnerCleanupOK)
    if (-not $runnerCleanupOK) { throw ('Docker cleanup unverified: ' + $runnerContainer + ' / ' + $runnerPackageTag) }
}
