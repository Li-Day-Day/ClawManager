param(
    [ValidateSet('mysql:8.0', 'mysql:8.4.8')]
    [string]$Image = 'mysql:8.0'
)

# Uses only a locally cached image and a uniquely labelled disposable container.
# No existing database, container, host volume or application credential is used.
$ErrorActionPreference = 'Stop'
$auditRun = [Guid]::NewGuid().ToString('N')
$auditName = 'skillhub-mysql-audit-' + $auditRun
$auditContainer = $null
$auditExit = 1
$previousPassword = $env:MYSQL_ROOT_PASSWORD
$previousDSN = $env:CLAWMANAGER_SKILLHUB_TEST_MYSQL_ADMIN_DSN
$auditBackend = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../backend')).Path
Push-Location $auditBackend
try {
    & docker image inspect $Image *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Required test image is not cached; no image will be pulled.' }
    $env:MYSQL_ROOT_PASSWORD = [Guid]::NewGuid().ToString('N')
    $auditContainer = (& docker run --detach --pull=never --name $auditName --label "codex.skillhub-audit=$auditRun" --memory 1g --cpus 1 --tmpfs /var/lib/mysql:rw,nosuid,size=512m --publish 127.0.0.1::3306 --env MYSQL_ROOT_PASSWORD --env 'MYSQL_ROOT_HOST=%' $Image).Trim()
    if ($LASTEXITCODE -ne 0 -or $auditContainer -notmatch '^[a-f0-9]{64}$') { throw 'Could not create isolated MySQL fixture.' }
    Write-Output "Started $Image fixture $auditName"
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(180)
    while ([DateTime]::UtcNow -lt $deadline) {
        # PowerShell 5 turns native stderr into errors even when redirected.
        # A failed readiness probe is retryable, never a passed database test.
        $ErrorActionPreference = 'Continue'
        try {
            & docker exec $auditContainer sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 --silent >/dev/null 2>&1' *> $null
            $probeExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = 'Stop' }
        if ($probeExit -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Isolated MySQL fixture did not become ready.' }
    $address = (& docker port $auditContainer 3306/tcp).Trim()
    if ($LASTEXITCODE -ne 0 -or $address -notmatch '^127\.0\.0\.1:([0-9]+)$') { throw 'Fixture port is not bound exclusively to loopback.' }
    $auditPort = $Matches[1]
    $env:CLAWMANAGER_SKILLHUB_TEST_MYSQL_ADMIN_DSN = 'root:' + $env:MYSQL_ROOT_PASSWORD + '@tcp(127.0.0.1:' + $auditPort + ')/?parseTime=true'
    & go test -vet=all ./internal/systembackupskillhub -run '^TestSQLRestorerMySQLRoundTrip$' -count=1 -v
    $auditExit = $LASTEXITCODE
} finally {
    $env:MYSQL_ROOT_PASSWORD = $previousPassword
    $env:CLAWMANAGER_SKILLHUB_TEST_MYSQL_ADMIN_DSN = $previousDSN
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
