[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$backfillRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backfillScratch=Join-Path $backfillRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$backfillSourceOwner=Join-Path $backfillRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$backfillFrozen=Join-Path $backfillSourceOwner 'source'
$backfillEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$backfillPrevious=@{}
foreach($backfillName in $backfillEnvironment){$backfillPrevious[$backfillName]=[Environment]::GetEnvironmentVariable($backfillName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$backfillManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($backfillManifest) -ne [IO.Path]::GetFullPath((Join-Path $backfillRoot 'docs/evidence')) -or (Test-Path -LiteralPath $backfillManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($backfillSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $backfillSourceOwner 'owner.txt'),[IO.Path]::GetFileName($backfillSourceOwner))
    $backfillSnapshot=New-DIndexSourceSnapshot -Root $backfillRoot -Destination $backfillFrozen
    $backfillStream=[IO.File]::Open($backfillManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$backfillBytes=[Text.Encoding]::UTF8.GetBytes(($backfillSnapshot|ConvertTo-Json -Depth 6));$backfillStream.Write($backfillBytes,0,$backfillBytes.Length)}finally{$backfillStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-backfill-source-frozen=yes source_sha256='+$backfillSnapshot.source_sha256+' files='+$backfillSnapshot.files.Count)
    foreach($backfillFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $backfillScratch $backfillFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $backfillScratch 'cache';$env:GOTMPDIR=Join-Path $backfillScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $backfillScratch
    Push-Location (Join-Path $backfillFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-backfill-source-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^Test(ConfigBackfillSource|VerifyConfigBackfillSource)','./internal/systembackupread') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-backfill-source-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupread') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $backfillFrozen -Manifest $backfillSnapshot
        Write-Output 'LOCAL_PASS config-backfill-source-content=yes read-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($backfillName in $backfillEnvironment){[Environment]::SetEnvironmentVariable($backfillName,$backfillPrevious[$backfillName],'Process')}
    foreach($backfillOwned in @($backfillScratch,$backfillSourceOwner)){
        if(Test-Path -LiteralPath $backfillOwned){
            $backfillResolved=(Resolve-Path -LiteralPath $backfillOwned).Path
            if([IO.Path]::GetDirectoryName($backfillResolved) -ne $backfillRoot -or [IO.Path]::GetFileName($backfillResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $backfillResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing backfill cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $backfillResolved
        }
        Write-Output ('LOCAL_CLEANUP config-backfill-source-owned='+$backfillOwned+' removed='+(-not(Test-Path -LiteralPath $backfillOwned)))
    }
}
