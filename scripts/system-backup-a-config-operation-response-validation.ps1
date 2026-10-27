[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$operationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$operationScratch=Join-Path $operationRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$operationSourceOwner=Join-Path $operationRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$operationFrozen=Join-Path $operationSourceOwner 'source'
$operationEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$operationPrevious=@{}
foreach($operationName in $operationEnvironment){$operationPrevious[$operationName]=[Environment]::GetEnvironmentVariable($operationName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$operationManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($operationManifest) -ne [IO.Path]::GetFullPath((Join-Path $operationRoot 'docs/evidence')) -or (Test-Path -LiteralPath $operationManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($operationSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $operationSourceOwner 'owner.txt'),[IO.Path]::GetFileName($operationSourceOwner))
    $operationSnapshot=New-DIndexSourceSnapshot -Root $operationRoot -Destination $operationFrozen
    $operationStream=[IO.File]::Open($operationManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$operationBytes=[Text.Encoding]::UTF8.GetBytes(($operationSnapshot|ConvertTo-Json -Depth 6));$operationStream.Write($operationBytes,0,$operationBytes.Length)}finally{$operationStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-operation-response-frozen=yes source_sha256='+$operationSnapshot.source_sha256+' files='+$operationSnapshot.files.Count)
    foreach($operationFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $operationScratch $operationFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $operationScratch 'cache';$env:GOTMPDIR=Join-Path $operationScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $operationScratch
    Push-Location (Join-Path $operationFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-operation-response-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigOperationResponse','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-operation-response-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $operationFrozen -Manifest $operationSnapshot
        Write-Output 'LOCAL_PASS config-operation-response-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($operationName in $operationEnvironment){[Environment]::SetEnvironmentVariable($operationName,$operationPrevious[$operationName],'Process')}
    foreach($operationOwned in @($operationScratch,$operationSourceOwner)){
        if(Test-Path -LiteralPath $operationOwned){
            $operationResolved=(Resolve-Path -LiteralPath $operationOwned).Path
            if([IO.Path]::GetDirectoryName($operationResolved) -ne $operationRoot -or [IO.Path]::GetFileName($operationResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $operationResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing operation response cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $operationResolved
        }
        Write-Output ('LOCAL_CLEANUP config-operation-response-owned='+$operationOwned+' removed='+(-not(Test-Path -LiteralPath $operationOwned)))
    }
}
