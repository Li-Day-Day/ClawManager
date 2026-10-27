[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$identityRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$identityScratch=Join-Path $identityRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$identitySourceOwner=Join-Path $identityRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$identityFrozen=Join-Path $identitySourceOwner 'source'
$identityEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$identityPrevious=@{}
foreach($identityName in $identityEnvironment){$identityPrevious[$identityName]=[Environment]::GetEnvironmentVariable($identityName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$identityManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($identityManifest) -ne [IO.Path]::GetFullPath((Join-Path $identityRoot 'docs/evidence')) -or (Test-Path -LiteralPath $identityManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($identitySourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $identitySourceOwner 'owner.txt'),[IO.Path]::GetFileName($identitySourceOwner))
    $identitySnapshot=New-DIndexSourceSnapshot -Root $identityRoot -Destination $identityFrozen
    $identityStream=[IO.File]::Open($identityManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$identityBytes=[Text.Encoding]::UTF8.GetBytes(($identitySnapshot|ConvertTo-Json -Depth 6));$identityStream.Write($identityBytes,0,$identityBytes.Length)}finally{$identityStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-backfill-identity-frozen=yes source_sha256='+$identitySnapshot.source_sha256+' files='+$identitySnapshot.files.Count)
    foreach($identityFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $identityScratch $identityFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $identityScratch 'cache';$env:GOTMPDIR=Join-Path $identityScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $identityScratch
    Push-Location (Join-Path $identityFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-backfill-identity-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigBackfillIdentity','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-backfill-identity-counterfactual'
        . (Join-Path $PSScriptRoot 'system-backup-a-config-backfill-byte-control.ps1')
        Invoke-AConfigBackfillByteBudgetControl -Root $identityFrozen -Scratch $identityScratch -BuildParallelism $BuildParallelism
        Write-Output 'LOCAL_STAGE config-backfill-identity-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $identityFrozen -Manifest $identitySnapshot
        Write-Output 'LOCAL_PASS config-backfill-identity-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($identityName in $identityEnvironment){[Environment]::SetEnvironmentVariable($identityName,$identityPrevious[$identityName],'Process')}
    foreach($identityOwned in @($identityScratch,$identitySourceOwner)){
        if(Test-Path -LiteralPath $identityOwned){
            $identityResolved=(Resolve-Path -LiteralPath $identityOwned).Path
            if([IO.Path]::GetDirectoryName($identityResolved) -ne $identityRoot -or [IO.Path]::GetFileName($identityResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $identityResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing backfill identity cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $identityResolved
        }
        Write-Output ('LOCAL_CLEANUP config-backfill-identity-owned='+$identityOwned+' removed='+(-not(Test-Path -LiteralPath $identityOwned)))
    }
}
