[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$boundaryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$boundaryScratch=Join-Path $boundaryRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$boundarySourceOwner=Join-Path $boundaryRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$boundaryFrozen=Join-Path $boundarySourceOwner 'source'
$boundaryEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$boundaryPrevious=@{}
foreach($boundaryName in $boundaryEnvironment){$boundaryPrevious[$boundaryName]=[Environment]::GetEnvironmentVariable($boundaryName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$boundaryManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($boundaryManifest) -ne [IO.Path]::GetFullPath((Join-Path $boundaryRoot 'docs/evidence')) -or (Test-Path -LiteralPath $boundaryManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($boundarySourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $boundarySourceOwner 'owner.txt'),[IO.Path]::GetFileName($boundarySourceOwner))
    $boundarySnapshot=New-DIndexSourceSnapshot -Root $boundaryRoot -Destination $boundaryFrozen
    $boundaryStream=[IO.File]::Open($boundaryManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$boundaryBytes=[Text.Encoding]::UTF8.GetBytes(($boundarySnapshot|ConvertTo-Json -Depth 6));$boundaryStream.Write($boundaryBytes,0,$boundaryBytes.Length)}finally{$boundaryStream.Dispose()}
    Write-Output ('LOCAL_SOURCE registration-error-boundary-frozen=yes source_sha256='+$boundarySnapshot.source_sha256+' files='+$boundarySnapshot.files.Count)
    foreach($boundaryFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $boundaryScratch $boundaryFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $boundaryScratch 'cache';$env:GOTMPDIR=Join-Path $boundaryScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $boundaryScratch
    Push-Location (Join-Path $boundaryFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE registration-error-boundary-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestRegistration(ErrorBoundary|TypedNil)','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE registration-error-boundary-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $boundaryFrozen -Manifest $boundarySnapshot
        Write-Output 'LOCAL_PASS registration-error-boundary-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($boundaryName in $boundaryEnvironment){[Environment]::SetEnvironmentVariable($boundaryName,$boundaryPrevious[$boundaryName],'Process')}
    foreach($boundaryOwned in @($boundaryScratch,$boundarySourceOwner)){
        if(Test-Path -LiteralPath $boundaryOwned){
            $boundaryResolved=(Resolve-Path -LiteralPath $boundaryOwned).Path
            if([IO.Path]::GetDirectoryName($boundaryResolved) -ne $boundaryRoot -or [IO.Path]::GetFileName($boundaryResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $boundaryResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing error boundary cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $boundaryResolved
        }
        Write-Output ('LOCAL_CLEANUP registration-error-boundary-owned='+$boundaryOwned+' removed='+(-not(Test-Path -LiteralPath $boundaryOwned)))
    }
}
