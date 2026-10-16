[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[string]$SourceManifestPath='',[switch]$BackfillRowGuards)
$ErrorActionPreference='Stop'
$mutationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mutationScratch=Join-Path $mutationRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$mutationSourceOwner=Join-Path $mutationRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$mutationFrozenRoot=Join-Path $mutationSourceOwner 'source'
$mutationEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$mutationPrevious=@{}
foreach($name in $mutationEnvironment){$mutationPrevious[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
if($SourceManifestPath){
    $mutationManifest=[IO.Path]::GetFullPath($SourceManifestPath)
    if([IO.Path]::GetDirectoryName($mutationManifest) -ne [IO.Path]::GetFullPath((Join-Path $mutationRoot 'docs/evidence')) -or (Test-Path -LiteralPath $mutationManifest)){throw 'Manifest must be a new docs/evidence file'}
}
try {
    [IO.Directory]::CreateDirectory($mutationSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $mutationSourceOwner 'owner.txt'),[IO.Path]::GetFileName($mutationSourceOwner))
    $mutationSnapshot=New-DIndexSourceSnapshot -Root $mutationRoot -Destination $mutationFrozenRoot
    if($SourceManifestPath){
        $mutationManifestStream=[IO.File]::Open($mutationManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
        try{$mutationManifestBytes=[Text.Encoding]::UTF8.GetBytes(($mutationSnapshot | ConvertTo-Json -Depth 6));$mutationManifestStream.Write($mutationManifestBytes,0,$mutationManifestBytes.Length)}finally{$mutationManifestStream.Dispose()}
    }
    Write-Output ('LOCAL_SOURCE config-mutation-frozen=yes source_sha256='+$mutationSnapshot.source_sha256+' files='+$mutationSnapshot.files.Count)
    foreach($folder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $mutationScratch $folder)) | Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath'; $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $mutationScratch 'cache'; $env:GOTMPDIR=Join-Path $mutationScratch 'tmp'; $env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $mutationScratch
    Push-Location (Join-Path $mutationFrozenRoot 'backend')
    try {
        if($BackfillRowGuards){
            & (Join-Path $mutationFrozenRoot 'scripts/system-backup-d-config-backfill-row-controls.ps1') -FrozenRoot $mutationFrozenRoot -Scratch $mutationScratch -BuildParallelism $BuildParallelism
        }
        Write-Output 'LOCAL_STAGE config-security-and-response-composition'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE a-config-response-content'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigResponse','./internal/systembackupevidence') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $mutationFrozenRoot -Manifest $mutationSnapshot
        Write-Output 'LOCAL_PASS config-mutation-and-security-regressions=yes default-vet=yes transaction-core=candidate production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($name in $mutationEnvironment){[Environment]::SetEnvironmentVariable($name,$mutationPrevious[$name],'Process')}
    if(Test-Path -LiteralPath $mutationScratch){
        $mutationResolved=(Resolve-Path -LiteralPath $mutationScratch).Path
        if([IO.Path]::GetDirectoryName($mutationResolved) -ne $mutationRoot -or [IO.Path]::GetFileName($mutationResolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or
            ((Get-Item -Force -LiteralPath $mutationResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing cleanup outside owned mutation scratch'}
        Remove-Item -Recurse -Force -LiteralPath $mutationResolved
    }
    Write-Output ('LOCAL_CLEANUP mutation-scratch='+$mutationScratch+' removed='+(-not(Test-Path -LiteralPath $mutationScratch)))
    if(Test-Path -LiteralPath $mutationSourceOwner){
        $mutationSourceResolved=(Resolve-Path -LiteralPath $mutationSourceOwner).Path
        if([IO.Path]::GetDirectoryName($mutationSourceResolved) -ne $mutationRoot -or [IO.Path]::GetFileName($mutationSourceResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
            ((Get-Item -Force -LiteralPath $mutationSourceResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing source cleanup outside owned mutation snapshot'}
        Remove-Item -Recurse -Force -LiteralPath $mutationSourceResolved
    }
    Write-Output ('LOCAL_CLEANUP mutation-source='+$mutationSourceOwner+' removed='+(-not(Test-Path -LiteralPath $mutationSourceOwner)))
}
