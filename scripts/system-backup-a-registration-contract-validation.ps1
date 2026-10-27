[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$contractErrorRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$contractErrorScratch=Join-Path $contractErrorRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$contractErrorSourceOwner=Join-Path $contractErrorRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$contractErrorFrozen=Join-Path $contractErrorSourceOwner 'source'
$contractErrorEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$contractErrorPrevious=@{}
foreach($contractErrorName in $contractErrorEnvironment){$contractErrorPrevious[$contractErrorName]=[Environment]::GetEnvironmentVariable($contractErrorName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$contractErrorManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($contractErrorManifest) -ne [IO.Path]::GetFullPath((Join-Path $contractErrorRoot 'docs/evidence')) -or (Test-Path -LiteralPath $contractErrorManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($contractErrorSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $contractErrorSourceOwner 'owner.txt'),[IO.Path]::GetFileName($contractErrorSourceOwner))
    $contractErrorSnapshot=New-DIndexSourceSnapshot -Root $contractErrorRoot -Destination $contractErrorFrozen
    $contractErrorStream=[IO.File]::Open($contractErrorManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$contractErrorBytes=[Text.Encoding]::UTF8.GetBytes(($contractErrorSnapshot|ConvertTo-Json -Depth 6));$contractErrorStream.Write($contractErrorBytes,0,$contractErrorBytes.Length)}finally{$contractErrorStream.Dispose()}
    Write-Output ('LOCAL_SOURCE registration-contract-frozen=yes source_sha256='+$contractErrorSnapshot.source_sha256+' files='+$contractErrorSnapshot.files.Count)
    foreach($contractErrorFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $contractErrorScratch $contractErrorFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $contractErrorScratch 'cache';$env:GOTMPDIR=Join-Path $contractErrorScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $contractErrorScratch
    Push-Location (Join-Path $contractErrorFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE registration-contract-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestRegistration(Contract|ErrorBoundary|TypedNil)','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE registration-contract-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE registration-contract-tagged-seed'
        Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestAConfigProofMySQLSeed$','./internal/systembackupsecurity') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $contractErrorFrozen -Manifest $contractErrorSnapshot
        Write-Output 'LOCAL_PASS registration-contract-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($contractErrorName in $contractErrorEnvironment){[Environment]::SetEnvironmentVariable($contractErrorName,$contractErrorPrevious[$contractErrorName],'Process')}
    foreach($contractErrorOwned in @($contractErrorScratch,$contractErrorSourceOwner)){
        if(Test-Path -LiteralPath $contractErrorOwned){
            $contractErrorResolved=(Resolve-Path -LiteralPath $contractErrorOwned).Path
            if([IO.Path]::GetDirectoryName($contractErrorResolved) -ne $contractErrorRoot -or [IO.Path]::GetFileName($contractErrorResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $contractErrorResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing contract error cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $contractErrorResolved
        }
        Write-Output ('LOCAL_CLEANUP registration-contract-owned='+$contractErrorOwned+' removed='+(-not(Test-Path -LiteralPath $contractErrorOwned)))
    }
}
