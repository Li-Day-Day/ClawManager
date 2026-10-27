[CmdletBinding()]
param(
    [ValidateRange(1,4)][int]$BuildParallelism=2,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [string]$PreparedScratchPath=''
)
# Dependencies may be installed separately with the operator's authorization.
# This gate itself is offline, uses readonly module files and never runs SSH.
$ErrorActionPreference='Stop'
$authHTTPRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$authHTTPOwner=Join-Path $authHTTPRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$authHTTPFrozen=Join-Path $authHTTPOwner 'source'
$authHTTPScratch=Join-Path $authHTTPRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
if($PreparedScratchPath){
    $authHTTPScratch=[IO.Path]::GetFullPath($PreparedScratchPath)
    if([IO.Path]::GetDirectoryName($authHTTPScratch) -ne $authHTTPRoot -or [IO.Path]::GetFileName($authHTTPScratch) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or -not(Test-Path -LiteralPath $authHTTPScratch -PathType Container) -or ((Get-Item -Force -LiteralPath $authHTTPScratch).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $authHTTPScratch 'owner.txt')) -ne [IO.Path]::GetFileName($authHTTPScratch)){throw 'Prepared cache must be an owned workspace scratch directory'}
}
$authHTTPManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($authHTTPManifest) -ne (Join-Path $authHTTPRoot 'docs/evidence') -or (Test-Path -LiteralPath $authHTTPManifest)){throw 'Manifest must be a new docs/evidence file'}
$authHTTPNames=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$authHTTPPrevious=@{}
foreach($authHTTPName in $authHTTPNames){$authHTTPPrevious[$authHTTPName]=[Environment]::GetEnvironmentVariable($authHTTPName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
try {
    [IO.Directory]::CreateDirectory($authHTTPOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $authHTTPOwner 'owner.txt'),[IO.Path]::GetFileName($authHTTPOwner))
    $authHTTPSnapshot=New-DIndexSourceSnapshot -Root $authHTTPRoot -Destination $authHTTPFrozen
    $authHTTPStream=[IO.File]::Open($authHTTPManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$authHTTPBytes=[Text.Encoding]::UTF8.GetBytes(($authHTTPSnapshot|ConvertTo-Json -Depth 6));$authHTTPStream.Write($authHTTPBytes,0,$authHTTPBytes.Length)}finally{$authHTTPStream.Dispose()}
    Write-Output ('LOCAL_SOURCE auth-http=yes source_sha256='+$authHTTPSnapshot.source_sha256+' files='+$authHTTPSnapshot.files.Count)
    Write-Output ('OWNED auth-http-source='+$authHTTPOwner+' scratch='+$authHTTPScratch)
    foreach($authHTTPDirectory in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $authHTTPScratch $authHTTPDirectory))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOCACHE=Join-Path $authHTTPScratch 'cache';$env:GOTMPDIR=Join-Path $authHTTPScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $authHTTPScratch
    Push-Location (Join-Path $authHTTPFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE auth-http-five-full-packages default-vet=yes retry=no dependency-downloads=no'
        # JSON retains package/test identities; use native exit exactly once.
        $authHTTPExit=Invoke-AEvidenceNative -FilePath 'C:\Program Files\Go\bin\go.exe' -Arguments @('test','-json','-count=1','-timeout=900s',('-p='+$BuildParallelism),'./internal/repository','./internal/services','./internal/middleware','./internal/handlers','./cmd/server')
        Write-Output ('AUTH_HTTP_GO_EXIT='+$authHTTPExit)
        if($authHTTPExit -ne 0){throw ('Full auth HTTP package gate failed (exit='+$authHTTPExit+'); no automatic test retry')}
        Test-DIndexSourceSnapshot -Root $authHTTPFrozen -Manifest $authHTTPSnapshot
        Write-Output 'LOCAL_PASS auth-http=yes five-full-packages=yes frozen-postcheck=yes default-vet=yes dependency-downloads=no real-mysql=no real-directory=no human-mfa=no production-grant=no'
    } finally {Pop-Location}
} finally {
    foreach($authHTTPName in $authHTTPNames){[Environment]::SetEnvironmentVariable($authHTTPName,$authHTTPPrevious[$authHTTPName],'Process')}
    foreach($authHTTPOwned in @($authHTTPScratch,$authHTTPOwner)){
        if(Test-Path -LiteralPath $authHTTPOwned){
            $authHTTPResolved=(Resolve-Path -LiteralPath $authHTTPOwned).Path
            if([IO.Path]::GetDirectoryName($authHTTPResolved) -ne $authHTTPRoot -or [IO.Path]::GetFileName($authHTTPResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $authHTTPResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing cleanup outside owned auth HTTP workspace'}
            if($authHTTPOwned -eq $authHTTPOwner -and [IO.File]::ReadAllText((Join-Path $authHTTPResolved 'owner.txt')) -ne [IO.Path]::GetFileName($authHTTPResolved)){throw 'Auth HTTP source owner mismatch'}
            Remove-Item -LiteralPath $authHTTPResolved -Recurse -Force
        }
        Write-Output ('LOCAL_CLEANUP auth-http-owned='+$authHTTPOwned+' removed='+(-not(Test-Path -LiteralPath $authHTTPOwned)))
    }
}
