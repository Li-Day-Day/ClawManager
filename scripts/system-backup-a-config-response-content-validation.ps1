[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$responseRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$responseScratch=Join-Path $responseRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$responseSourceOwner=Join-Path $responseRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$responseFrozen=Join-Path $responseSourceOwner 'source'
$responseEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$responsePrevious=@{}
foreach($responseName in $responseEnvironment){$responsePrevious[$responseName]=[Environment]::GetEnvironmentVariable($responseName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$responseManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($responseManifest) -ne [IO.Path]::GetFullPath((Join-Path $responseRoot 'docs/evidence')) -or (Test-Path -LiteralPath $responseManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($responseSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $responseSourceOwner 'owner.txt'),[IO.Path]::GetFileName($responseSourceOwner))
    $responseSnapshot=New-DIndexSourceSnapshot -Root $responseRoot -Destination $responseFrozen
    $responseStream=[IO.File]::Open($responseManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$responseBytes=[Text.Encoding]::UTF8.GetBytes(($responseSnapshot|ConvertTo-Json -Depth 6));$responseStream.Write($responseBytes,0,$responseBytes.Length)}finally{$responseStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-response-frozen=yes source_sha256='+$responseSnapshot.source_sha256+' files='+$responseSnapshot.files.Count)
    foreach($responseFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $responseScratch $responseFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $responseScratch 'cache';$env:GOTMPDIR=Join-Path $responseScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $responseScratch
    Push-Location (Join-Path $responseFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-response-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfig(Response|Maintenance)','./internal/systembackupsecurity','./internal/systembackupevidence') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-response-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupevidence','./internal/systembackupproducer') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $responseFrozen -Manifest $responseSnapshot
        Write-Output 'LOCAL_PASS config-response-content=yes security-evidence-producer-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($responseName in $responseEnvironment){[Environment]::SetEnvironmentVariable($responseName,$responsePrevious[$responseName],'Process')}
    foreach($responseOwned in @($responseScratch,$responseSourceOwner)){
        if(Test-Path -LiteralPath $responseOwned){
            $responseResolved=(Resolve-Path -LiteralPath $responseOwned).Path
            if([IO.Path]::GetDirectoryName($responseResolved) -ne $responseRoot -or [IO.Path]::GetFileName($responseResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $responseResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing response cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $responseResolved
        }
        Write-Output ('LOCAL_CLEANUP config-response-owned='+$responseOwned+' removed='+(-not(Test-Path -LiteralPath $responseOwned)))
    }
}
