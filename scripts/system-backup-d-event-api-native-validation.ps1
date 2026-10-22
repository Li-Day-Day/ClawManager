[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [Parameter(Mandatory=$true)][string]$LogPath,
    [string]$PreparedScratchPath='',
    [switch]$HTTPOnly
)
$ErrorActionPreference='Stop'
$eventNativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$eventNativeID=[guid]::NewGuid().ToString('N')
$eventNativeOwner=Join-Path $eventNativeRoot ('.tmp-d-index-cache-'+$eventNativeID)
$eventNativeFrozen=Join-Path $eventNativeOwner 'source'
$eventNativeScratch=Join-Path $eventNativeRoot ('.tmp-a-evidence-'+$eventNativeID)
if($PreparedScratchPath){
    $eventNativeScratch=[IO.Path]::GetFullPath($PreparedScratchPath)
    if([IO.Path]::GetDirectoryName($eventNativeScratch) -ne $eventNativeRoot -or [IO.Path]::GetFileName($eventNativeScratch) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or -not(Test-Path -LiteralPath $eventNativeScratch -PathType Container) -or ((Get-Item -Force -LiteralPath $eventNativeScratch).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $eventNativeScratch 'owner.txt')) -ne [IO.Path]::GetFileName($eventNativeScratch)){throw 'Prepared cache must be a run-owned workspace directory'}
}
$eventNativeEvidence=Join-Path $eventNativeRoot 'docs/evidence'
$eventNativeManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$eventNativeLog=[IO.Path]::GetFullPath($LogPath)
foreach($eventNativeOutput in @($eventNativeManifest,$eventNativeLog)){
    if([IO.Path]::GetDirectoryName($eventNativeOutput) -ne $eventNativeEvidence -or (Test-Path -LiteralPath $eventNativeOutput)){throw 'Outputs must be new docs/evidence files'}
}
if($eventNativeManifest -eq $eventNativeLog){throw 'Outputs must differ'}
$eventNativeNames=@('GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOENV','GOCACHE','GOTMPDIR','GOMODCACHE','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$eventNativePrevious=@{}
foreach($eventNativeName in $eventNativeNames){$eventNativePrevious[$eventNativeName]=[Environment]::GetEnvironmentVariable($eventNativeName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
Start-Transcript -LiteralPath $eventNativeLog | Out-Null
try {
    [IO.Directory]::CreateDirectory($eventNativeOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $eventNativeOwner 'owner.txt'),[IO.Path]::GetFileName($eventNativeOwner))
    $eventNativeSnapshot=New-DIndexSourceSnapshot -Root $eventNativeRoot -Destination $eventNativeFrozen
    [IO.File]::WriteAllText($eventNativeManifest,($eventNativeSnapshot|ConvertTo-Json -Depth 7))
    Write-Output ('LOCAL_SOURCE event-api-native=yes source_sha256='+$eventNativeSnapshot.source_sha256+' files='+$eventNativeSnapshot.files.Count)
    Write-Output ('LOCAL_OWNER event-api-native='+$eventNativeOwner)
    [IO.Directory]::CreateDirectory($eventNativeScratch)|Out-Null
    [IO.File]::WriteAllText((Join-Path $eventNativeScratch 'owner.txt'),[IO.Path]::GetFileName($eventNativeScratch))
    foreach($eventNativeDirectory in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $eventNativeScratch $eventNativeDirectory))|Out-Null}
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS='2'
    $env:GOMODCACHE=Join-Path $env:USERPROFILE 'go/pkg/mod'
    if(-not(Test-Path -LiteralPath $env:GOMODCACHE -PathType Container)){throw 'Existing dependency cache required; no installation'}
    $env:GOCACHE=Join-Path $eventNativeScratch 'cache';$env:GOTMPDIR=Join-Path $eventNativeScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $eventNativeScratch
    Push-Location (Join-Path $eventNativeFrozen 'backend')
    try {
        $eventNativeGo='C:\Program Files\Go\bin\go.exe'
        & $eventNativeGo version
        if(-not $HTTPOnly){
        Write-Output 'LOCAL_STAGE native-task-read default-vet=yes dependency-downloads=no'
        $eventNativeExit=Invoke-AEvidenceNative -FilePath $eventNativeGo -Arguments @('test','-json','-p=2','-count=1','-timeout=180s','./internal/systembackupread')
        if($eventNativeExit -ne 0){throw ('Native task read failed exit='+$eventNativeExit)}
        Write-Output 'LOCAL_STAGE native-mysql-tagged-compile actual-mysql=no'
        $eventNativeExit=Invoke-AEvidenceNative -FilePath $eventNativeGo -Arguments @('test','-json','-p=2','-tags','systembackup_mysql','-run','^$','-count=1','-timeout=180s','./internal/systembackupsecurity')
        if($eventNativeExit -ne 0){throw ('Native tagged compile failed exit='+$eventNativeExit)}
        }
        Write-Output 'LOCAL_STAGE native-live-read-http-focused default-vet=yes'
        $eventNativeExit=Invoke-AEvidenceNative -FilePath $eventNativeGo -Arguments @('test','-json','-p=2','-count=1','-timeout=180s','./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_cursor_key.go','./cmd/server/system_backup_read_live_test.go','./cmd/server/system_backup_read_cursor_key_test.go')
        if($eventNativeExit -ne 0){throw ('Native HTTP tests failed exit='+$eventNativeExit)}
        Test-DIndexSourceSnapshot -Root $eventNativeFrozen -Manifest $eventNativeSnapshot
        Write-Output ('LOCAL_PASS event-api-native-http=yes http-only='+[bool]$HTTPOnly+' frozen-postcheck=yes actual-mysql=no dependency-installation=no production-enabled=no')
    } finally {Pop-Location}
} finally {
    foreach($eventNativeName in $eventNativeNames){[Environment]::SetEnvironmentVariable($eventNativeName,$eventNativePrevious[$eventNativeName],'Process')}
    foreach($eventNativeOwned in @($eventNativeOwner,$eventNativeScratch)){
    if(Test-Path -LiteralPath $eventNativeOwned){
        $eventNativeResolved=(Resolve-Path -LiteralPath $eventNativeOwned).Path
        if([IO.Path]::GetDirectoryName($eventNativeResolved) -ne $eventNativeRoot -or [IO.Path]::GetFileName($eventNativeResolved) -ne [IO.Path]::GetFileName($eventNativeOwned) -or ((Get-Item -Force -LiteralPath $eventNativeResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $eventNativeResolved 'owner.txt')) -ne [IO.Path]::GetFileName($eventNativeResolved)){throw 'Unexpected native cleanup target'}
        Remove-Item -LiteralPath $eventNativeResolved -Recurse -Force
    }
    }
    Write-Output ('CLEANED event-api-native-source-build-cache='+(-not(Test-Path -LiteralPath $eventNativeOwner) -and -not(Test-Path -LiteralPath $eventNativeScratch)))
    Stop-Transcript | Out-Null
}
