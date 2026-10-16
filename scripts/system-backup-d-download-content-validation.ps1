[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SourceManifestPath,[Parameter(Mandatory=$true)][string]$LogPath)
$ErrorActionPreference='Stop'
$contentRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$contentID=[guid]::NewGuid().ToString('N')
$contentOwner=Join-Path $contentRoot ('.tmp-d-index-cache-'+$contentID)
$contentSource=Join-Path $contentOwner 'source'
$contentReports=Join-Path $contentOwner 'reports'
$contentContainer='codex-d-download-content-'+$contentID
$contentManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$contentLog=[IO.Path]::GetFullPath($LogPath)
$contentEvidence=[IO.Path]::GetFullPath((Join-Path $contentRoot 'docs/evidence'))
$contentSavedReport=[IO.Path]::ChangeExtension($contentManifest,'go-report.jsonl')
foreach($contentOutput in @($contentManifest,$contentLog,$contentSavedReport)){
    if([IO.Path]::GetDirectoryName($contentOutput) -ne $contentEvidence -or (Test-Path -LiteralPath $contentOutput)){throw 'Outputs must be new files directly in docs/evidence'}
}
if(@($contentManifest,$contentLog,$contentSavedReport)|Group-Object|Where-Object Count -gt 1){throw 'Outputs must be different files'}
$contentModules=Join-Path $env:USERPROFILE 'go/pkg/mod'
if(-not(Test-Path -LiteralPath $contentModules -PathType Container)){throw 'Existing module cache required; no installation'}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$contentResult=1
Start-Transcript -LiteralPath $contentLog -NoClobber | Out-Null
try {
    [IO.Directory]::CreateDirectory($contentOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $contentOwner 'owner.txt'),[IO.Path]::GetFileName($contentOwner))
    Write-Host ('LOCAL_OWNER download-content-source='+$contentOwner+' container='+$contentContainer)
    $contentSnapshot=New-AConfigProofSourceSnapshot -Root $contentRoot -Owner $contentOwner -MaxAttempts 3
    [IO.File]::WriteAllText($contentManifest,($contentSnapshot|ConvertTo-Json -Depth 7))
    [IO.Directory]::CreateDirectory($contentReports)|Out-Null
    Write-Host ('LOCAL_SOURCE download-content-frozen=yes files='+$contentSnapshot.files.Count+' source_sha256='+$contentSnapshot.source_sha256)
    $contentBuild=@'
set -eu
mkdir -p /tmp/cache /tmp/telemetry
printf 'off 2026-10-16' > /tmp/telemetry/mode
go version
printf 'LOCAL_STAGE download-content-binding default-vet=yes network=no actual-mysql=no\n'
set +e
go test -mod=readonly -p=2 -count=1 -timeout=180s -json -run '^(TestDownloadAdmission.*|TestSystemPublicationClaimAfterSlowLocalSetup|TestSystemPublisherActualDClaimToReceipt|TestSystemPublicationCallActualDClaimAndSnapshots)$' ./internal/systembackupevidence > /out/evidence-tests.jsonl 2>&1
result=$?
set -e
printf 'NATIVE_EXIT download-content-binding-tests=%s\n' "$result"
cat /out/evidence-tests.jsonl
if [ "$result" -ne 0 ]; then exit "$result"; fi
printf 'LOCAL_PASS download-content-binding-and-publication=yes full-package-suite=no actual-mysql=no\n'
'@
    $contentArgs=@('run','--rm','--pull=never','--name',$contentContainer,'--label',('codex.d-download-content-owner='+$contentID),
        '--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges',
        '--cpus','2','--memory','2048m','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=2048m',
        '--mount',('type=bind,source='+$contentSource+',target=/work,readonly'),'--mount',('type=bind,source='+$contentModules+',target=/modules,readonly'),
        '--mount',('type=bind,source='+$contentReports+',target=/out'),'--workdir','/work/backend',
        '--env','GOPROXY=off','--env','GOSUMDB=off','--env','GOTOOLCHAIN=local','--env','GOENV=off','--env','GOMODCACHE=/modules',
        '--env','GOCACHE=/tmp/cache','--env','GOTMPDIR=/tmp','--env','TEST_TELEMETRY_DIR=/tmp/telemetry','--env','CGO_ENABLED=0','--env','GOMAXPROCS=2',
        'sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039','sh','-c',$contentBuild)
    $contentNativeExit=Invoke-AEvidenceNative -FilePath 'docker' -Arguments $contentArgs
    if($contentNativeExit -ne 0){$contentResult=$contentNativeExit;throw ('Download content/binding gate failed exit='+$contentNativeExit)}
    Test-DIndexSourceSnapshot -Root $contentSource -Manifest $contentSnapshot
    Write-Host 'LOCAL_PASS download-content-frozen-postcheck=yes dependency-installation=no remote=no'
    $contentResult=0
} finally {
    try {
        $contentReport=Join-Path $contentReports 'evidence-tests.jsonl'
        if(Test-Path -LiteralPath $contentReport){
            if(Test-Path -LiteralPath $contentSavedReport){throw 'Refusing to replace evidence report'}
            Copy-Item -LiteralPath $contentReport -Destination $contentSavedReport
            Write-Host ('LOCAL_REPORT download-content-json='+$contentSavedReport)
        }
    } catch {$contentResult=1;throw} finally {
        try {
            if(Test-Path -LiteralPath $contentOwner){
                $contentResolved=(Resolve-Path -LiteralPath $contentOwner).Path
                if([IO.Path]::GetDirectoryName($contentResolved) -ne $contentRoot -or [IO.Path]::GetFileName($contentResolved) -ne ('.tmp-d-index-cache-'+$contentID) -or
                   ((Get-Item -Force -LiteralPath $contentResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                   [IO.File]::ReadAllText((Join-Path $contentResolved 'owner.txt')) -ne [IO.Path]::GetFileName($contentResolved)){throw 'Refusing cleanup outside owned source directory'}
                Remove-Item -LiteralPath $contentResolved -Recurse -Force
            }
            Write-Host ('CLEANED download-content-local-source-cache='+(-not(Test-Path -LiteralPath $contentOwner)))
        } catch {$contentResult=1;throw} finally {
            Write-Host ('d_download_content_binding_exit='+$contentResult)
            Stop-Transcript|Out-Null
        }
    }
}
