[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [Parameter(Mandatory=$true)][string]$LogPath
)
$ErrorActionPreference='Stop'
$taskReadRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskReadID=[guid]::NewGuid().ToString('N')
$taskReadOwner=Join-Path $taskReadRoot ('.tmp-d-index-cache-'+$taskReadID)
$taskReadSource=Join-Path $taskReadOwner 'source'
$taskReadContainer='codex-d-task-read-'+$taskReadID
$taskReadEvidence=[IO.Path]::GetFullPath((Join-Path $taskReadRoot 'docs/evidence'))
$taskReadManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$taskReadLog=[IO.Path]::GetFullPath($LogPath)
foreach($taskReadOutput in @($taskReadManifest,$taskReadLog)){
    if([IO.Path]::GetDirectoryName($taskReadOutput) -ne $taskReadEvidence -or (Test-Path -LiteralPath $taskReadOutput)){throw 'Outputs must be new files directly in docs/evidence'}
}
if($taskReadManifest -eq $taskReadLog){throw 'Manifest and log must be different files'}
$taskReadModules=Join-Path $env:USERPROFILE 'go/pkg/mod'
if(-not(Test-Path -LiteralPath $taskReadModules -PathType Container)){throw 'Existing module cache required; dependencies are not installed'}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
Start-Transcript -LiteralPath $taskReadLog | Out-Null
try {
    [IO.Directory]::CreateDirectory($taskReadOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $taskReadOwner 'owner.txt'),[IO.Path]::GetFileName($taskReadOwner))
    $taskReadSnapshot=New-DIndexSourceSnapshot -Root $taskReadRoot -Destination $taskReadSource
    [IO.File]::WriteAllText($taskReadManifest,($taskReadSnapshot|ConvertTo-Json -Depth 7))
    Write-Host ('LOCAL_SOURCE task-read-frozen=yes files='+$taskReadSnapshot.files.Count+' source_sha256='+$taskReadSnapshot.source_sha256)
    Write-Host ('LOCAL_OWNER source='+$taskReadOwner+' container='+$taskReadContainer)
    $taskReadBuild=@'
set -eu
mkdir -p /tmp/cache /tmp/telemetry
printf 'off 2026-10-16' > /tmp/telemetry/mode
go version
printf 'LOCAL_STAGE task-read-unit default-vet=yes network=no actual-mysql=no\n'
set +e
go test -mod=readonly -p=2 -count=1 -timeout=180s -json ./internal/systembackupread > /tmp/read.jsonl 2>&1
result=$?
set -e
cat /tmp/read.jsonl
if [ "$result" -ne 0 ]; then exit "$result"; fi
printf 'LOCAL_STAGE task-read-mysql-tagged-compile default-vet=yes actual-mysql=no\n'
set +e
go test -mod=readonly -p=2 -tags systembackup_mysql -run '^$' -count=1 -timeout=180s -json ./internal/systembackupsecurity > /tmp/tagged.jsonl 2>&1
result=$?
set -e
cat /tmp/tagged.jsonl
if [ "$result" -ne 0 ]; then exit "$result"; fi
printf 'LOCAL_STAGE live-read-http-focused default-vet=yes actual-mysql=no\n'
set +e
go test -mod=readonly -p=2 -count=1 -timeout=180s -json ./cmd/server/system_backup_read_live.go ./cmd/server/system_backup_read_live_test.go > /tmp/http.jsonl 2>&1
result=$?
set -e
cat /tmp/http.jsonl
if [ "$result" -ne 0 ]; then exit "$result"; fi
printf 'LOCAL_PASS task-read-unit-tagged-compile-and-http=yes actual-mysql=no production-enabled=no\n'
'@
    $taskReadArgs=@('run','--rm','--pull=never','--name',$taskReadContainer,'--label',('codex.d-task-read-owner='+$taskReadID),
        '--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges',
        '--cpus','2','--memory','4096m','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=2048m',
        '--mount',('type=bind,source='+$taskReadSource+',target=/work,readonly'),
        '--mount',('type=bind,source='+$taskReadModules+',target=/modules,readonly'),
        '--workdir','/work/backend','--env','GOPROXY=off','--env','GOSUMDB=off','--env','GOTOOLCHAIN=local','--env','GOENV=off',
        '--env','GOMODCACHE=/modules','--env','GOCACHE=/tmp/cache','--env','GOTMPDIR=/tmp','--env','TEST_TELEMETRY_DIR=/tmp/telemetry',
        '--env','CGO_ENABLED=0','--env','GOMAXPROCS=2',
        'sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039','sh','-c',$taskReadBuild)
    $taskReadExit=Invoke-AEvidenceNative -FilePath 'docker' -Arguments $taskReadArgs
    if($taskReadExit -ne 0){throw ('Task read local gate failed exit='+$taskReadExit)}
    Test-DIndexSourceSnapshot -Root $taskReadSource -Manifest $taskReadSnapshot
    Write-Host 'LOCAL_PASS task-read-frozen-postcheck=yes dependency-installation=no remote=no'
} finally {
    if(Test-Path -LiteralPath $taskReadOwner){
        $taskReadResolved=(Resolve-Path -LiteralPath $taskReadOwner).Path
        if([IO.Path]::GetDirectoryName($taskReadResolved) -ne $taskReadRoot -or [IO.Path]::GetFileName($taskReadResolved) -ne ('.tmp-d-index-cache-'+$taskReadID) -or
           ((Get-Item -Force -LiteralPath $taskReadResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
           [IO.File]::ReadAllText((Join-Path $taskReadResolved 'owner.txt')) -ne [IO.Path]::GetFileName($taskReadResolved)){throw 'Refusing cleanup outside owned source directory'}
        Remove-Item -LiteralPath $taskReadResolved -Recurse -Force
    }
    Write-Host ('CLEANED task-read-local-source-cache='+(-not(Test-Path -LiteralPath $taskReadOwner)))
    Stop-Transcript | Out-Null
}
