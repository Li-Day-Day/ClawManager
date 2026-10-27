[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$serverReadRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverReadID=[guid]::NewGuid().ToString('N')
$serverReadOwner=Join-Path $serverReadRoot ('.tmp-d-index-cache-'+$serverReadID)
$serverReadFrozen=Join-Path $serverReadOwner 'source'
$serverReadContainer='codex-d-server-read-'+$serverReadID
$serverReadManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$serverReadModules=Join-Path $env:USERPROFILE 'go/pkg/mod'
if([IO.Path]::GetDirectoryName($serverReadManifest) -ne [IO.Path]::GetFullPath((Join-Path $serverReadRoot 'docs/evidence')) -or (Test-Path -LiteralPath $serverReadManifest)){throw 'Source manifest must be a new docs/evidence file'}
if(-not(Test-Path -LiteralPath $serverReadModules -PathType Container)){throw 'Existing module cache required; no installation'}
$serverReadDrive=New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($serverReadRoot))
if($serverReadDrive.AvailableFreeSpace -lt 8GB){throw 'At least 8 GiB free workspace disk required for the owned full-server build cache'}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
try {
    [IO.Directory]::CreateDirectory($serverReadOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $serverReadOwner 'owner.txt'),[IO.Path]::GetFileName($serverReadOwner))
    $serverReadSnapshot=New-DIndexSourceSnapshot -Root $serverReadRoot -Destination $serverReadFrozen
    $serverReadStream=[IO.File]::Open($serverReadManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$serverReadBytes=[Text.Encoding]::UTF8.GetBytes(($serverReadSnapshot|ConvertTo-Json -Depth 7));$serverReadStream.Write($serverReadBytes,0,$serverReadBytes.Length)}finally{$serverReadStream.Dispose()}
    Write-Output ('LOCAL_SOURCE d-server-read-frozen=yes files='+$serverReadSnapshot.files.Count+' source_sha256='+$serverReadSnapshot.source_sha256)
    Write-Output ('LOCAL_OWNER server-read-source='+$serverReadOwner+' container='+$serverReadContainer)
    foreach($serverReadDirectory in @('cache','build-tmp','reports')){[IO.Directory]::CreateDirectory((Join-Path $serverReadOwner $serverReadDirectory))|Out-Null}
    $serverReadBuild=@'
set -eu
mkdir -p /tmp/telemetry
printf 'off 2026-10-16' > /tmp/telemetry/mode
go version
printf 'LOCAL_STAGE full-cmd-server default-vet=yes buffered-report=yes network=no retry=no\n'
set +e
go test -mod=readonly -p=4 -count=1 -timeout=600s -json ./cmd/server > /reports/server-tests.json 2>&1
result=$?
set -e
printf 'NATIVE_EXIT cmd-server-tests=%s report-bytes=' "$result"
wc -c < /reports/server-tests.json
cat /reports/server-tests.json
if [ "$result" -ne 0 ]; then exit "$result"; fi
go build -mod=readonly -p=4 -o /build-tmp/clawmanager-server ./cmd/server
test -s /build-tmp/clawmanager-server
printf 'LOCAL_PASS full-cmd-server-test-and-linux-build=yes release-deployment=no\n'
'@
    Write-Output 'LOCAL_LIMIT server-build cpus=4 memory=6144m cache=owned-disk work=owned-disk reports=owned-disk module-cache=readonly'
    $serverReadArgs=@('run','--rm','--pull=never','--name',$serverReadContainer,'--label',('codex.d-server-read-owner='+$serverReadID),'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','4','--memory','6144m','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=512m',
        '--mount',('type=bind,source='+$serverReadFrozen+',target=/work,readonly'),'--mount',('type=bind,source='+$serverReadModules+',target=/modules,readonly'),
        '--mount',('type=bind,source='+(Join-Path $serverReadOwner 'cache')+',target=/cache'),
        '--mount',('type=bind,source='+(Join-Path $serverReadOwner 'build-tmp')+',target=/build-tmp'),
        '--mount',('type=bind,source='+(Join-Path $serverReadOwner 'reports')+',target=/reports'),
        '--workdir','/work/backend','--env','GOPROXY=off','--env','GOSUMDB=off','--env','GOTOOLCHAIN=local','--env','GOENV=off','--env','GOMODCACHE=/modules','--env','GOCACHE=/cache','--env','GOTMPDIR=/build-tmp','--env','TEST_TELEMETRY_DIR=/tmp/telemetry','--env','CGO_ENABLED=0','--env','GOMAXPROCS=4',
        'sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039','sh','-c',$serverReadBuild)
    $serverReadExit=Invoke-AEvidenceNative -FilePath 'docker' -Arguments $serverReadArgs
    $serverReadNativeReport=Join-Path $serverReadOwner 'reports/server-tests.json'
    if(Test-Path -LiteralPath $serverReadNativeReport){
        $serverReadSavedReport=[IO.Path]::ChangeExtension($serverReadManifest,'go-report.jsonl')
        $serverReadReportStream=[IO.File]::Open($serverReadSavedReport,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
        try{$serverReadOriginalStream=[IO.File]::OpenRead($serverReadNativeReport);try{$serverReadOriginalStream.CopyTo($serverReadReportStream)}finally{$serverReadOriginalStream.Dispose()}}finally{$serverReadReportStream.Dispose()}
        Write-Output ('LOCAL_REPORT full-cmd-server path='+$serverReadSavedReport+' bytes='+(Get-Item -LiteralPath $serverReadSavedReport).Length+' sha256='+(Get-FileHash -Algorithm SHA256 -LiteralPath $serverReadSavedReport).Hash.ToLowerInvariant())
    }
    if($serverReadExit -ne 0){throw ('Full server gate failed exit='+$serverReadExit+'; no dependency installation, no remote run')}
    Test-DIndexSourceSnapshot -Root $serverReadFrozen -Manifest $serverReadSnapshot
    Write-Output 'LOCAL_PASS d-server-read-frozen-postcheck=yes dependency-installation=no remote=no'
} finally {
    if(Test-Path -LiteralPath $serverReadOwner){
        $serverReadResolved=(Resolve-Path -LiteralPath $serverReadOwner).Path
        if([IO.Path]::GetDirectoryName($serverReadResolved) -ne $serverReadRoot -or [IO.Path]::GetFileName($serverReadResolved) -ne ('.tmp-d-index-cache-'+$serverReadID) -or ((Get-Item -Force -LiteralPath $serverReadResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $serverReadResolved 'owner.txt')) -ne [IO.Path]::GetFileName($serverReadResolved)){throw 'Refusing server cleanup outside exact owned directory'}
        Remove-Item -LiteralPath $serverReadResolved -Recurse -Force
    }
    Write-Output ('CLEANED server-read-local-source-cache='+(-not(Test-Path -LiteralPath $serverReadOwner)))
}
