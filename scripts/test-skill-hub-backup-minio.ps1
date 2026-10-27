# Real S3 tests against a uniquely owned loopback container; no image pull.
$ErrorActionPreference = 'Stop'
$auditRun = [Guid]::NewGuid().ToString('N')
$auditName = 'skillhub-minio-audit-' + $auditRun
$auditContainer = $null
$auditExit = 1
$auditVariables = @('MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD', 'CLAWMANAGER_SKILLHUB_TEST_MINIO_ENDPOINT', 'CLAWMANAGER_SKILLHUB_TEST_MINIO_ACCESS_KEY', 'CLAWMANAGER_SKILLHUB_TEST_MINIO_SECRET_KEY')
$auditPrevious = @{}
foreach ($key in $auditVariables) { $auditPrevious[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
Push-Location (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../backend')).Path
try {
    & docker image inspect minio/minio:latest *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Required test image is not cached; no image will be pulled.' }
    $env:MINIO_ROOT_USER = 'audit' + $auditRun
    $env:MINIO_ROOT_PASSWORD = [Guid]::NewGuid().ToString('N')
    $auditContainer = (& docker run --detach --pull=never --name $auditName --label "codex.skillhub-audit=$auditRun" --memory 512m --cpus 1 --tmpfs /data:rw,nosuid,size=128m --publish 127.0.0.1::9000 --env MINIO_ROOT_USER --env MINIO_ROOT_PASSWORD minio/minio:latest server /data --address :9000).Trim()
    if ($LASTEXITCODE -ne 0 -or $auditContainer -notmatch '^[a-f0-9]{64}$') { throw 'Could not create isolated MinIO fixture.' }
    Write-Output "Started MinIO fixture $auditName"
    $address = (& docker port $auditContainer 9000/tcp).Trim()
    if ($LASTEXITCODE -ne 0 -or $address -notmatch '^127\.0\.0\.1:[0-9]+$') { throw 'Fixture port is not bound exclusively to loopback.' }
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://" + $address + '/minio/health/ready') -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Isolated MinIO fixture did not become ready.' }
    $env:CLAWMANAGER_SKILLHUB_TEST_MINIO_ENDPOINT = $address
    $env:CLAWMANAGER_SKILLHUB_TEST_MINIO_ACCESS_KEY = $env:MINIO_ROOT_USER
    $env:CLAWMANAGER_SKILLHUB_TEST_MINIO_SECRET_KEY = $env:MINIO_ROOT_PASSWORD
    & go test -vet=all ./internal/systembackupskillhub -run '^TestS3MinIORoundTrip$' -count=1 -v
    $auditExit = $LASTEXITCODE
} finally {
    foreach ($key in $auditVariables) { [Environment]::SetEnvironmentVariable($key, $auditPrevious[$key], 'Process') }
    if ($auditContainer -match '^[a-f0-9]{64}$') {
        $auditInspect = & docker inspect $auditContainer | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $auditInspect[0].Id -ne $auditContainer -or $auditInspect[0].Config.Labels.'codex.skillhub-audit' -ne $auditRun -or $auditInspect[0].Name -ne ('/' + $auditName)) {
            throw 'Fixture ownership check failed; refusing container cleanup.'
        }
        & docker rm --force --volumes $auditContainer *> $null
        if ($LASTEXITCODE -ne 0) { throw "Could not clean up owned fixture $auditName" }
        Write-Output "Cleaned up owned fixture $auditName"
    }
    Pop-Location
}
exit $auditExit
