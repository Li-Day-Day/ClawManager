[CmdletBinding()]
param(
    [ValidateRange(1,4)][int]$BuildParallelism=2,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath
)
$ErrorActionPreference='Stop'
$holderRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$holderOwner=Join-Path $holderRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$holderFrozen=Join-Path $holderOwner 'source'
$holderScratch=Join-Path $holderRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$holderManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($holderManifest) -ne (Join-Path $holderRoot 'docs/evidence') -or (Test-Path -LiteralPath $holderManifest)){throw 'Manifest must be a new docs/evidence file'}
$holderNames=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$holderPrevious=@{}
foreach($holderName in $holderNames){$holderPrevious[$holderName]=[Environment]::GetEnvironmentVariable($holderName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
try {
    [IO.Directory]::CreateDirectory($holderOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $holderOwner 'owner.txt'),[IO.Path]::GetFileName($holderOwner))
    $holderSnapshot=New-DIndexSourceSnapshot -Root $holderRoot -Destination $holderFrozen
    $holderStream=[IO.File]::Open($holderManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$holderBytes=[Text.Encoding]::UTF8.GetBytes(($holderSnapshot|ConvertTo-Json -Depth 6));$holderStream.Write($holderBytes,0,$holderBytes.Length)}finally{$holderStream.Dispose()}
    Write-Output ('LOCAL_SOURCE maintenance-session-holder=yes source_sha256='+$holderSnapshot.source_sha256+' files='+$holderSnapshot.files.Count)
    foreach($holderDirectory in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $holderScratch $holderDirectory))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOCACHE=Join-Path $holderScratch 'cache';$env:GOTMPDIR=Join-Path $holderScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $holderScratch
    Push-Location (Join-Path $holderFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE maintenance-session-holder-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=180s','-v',('-p='+$BuildParallelism),'-run','^TestConfigMaintenanceSessionHolder','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE maintenance-session-holder-full'
        # This is a package-wide wall-clock limit. Retain a full-suite budget
        # on shared Windows hosts; do not turn a timeout into assertion retries.
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=900s','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $holderFrozen -Manifest $holderSnapshot
        Write-Output 'LOCAL_PASS maintenance-session-holder=yes security-config-regressions=yes frozen-postcheck=yes default-vet=yes actual-grant=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($holderName in $holderNames){[Environment]::SetEnvironmentVariable($holderName,$holderPrevious[$holderName],'Process')}
    foreach($holderOwned in @($holderScratch,$holderOwner)){
        if(Test-Path -LiteralPath $holderOwned){
            $holderResolved=(Resolve-Path -LiteralPath $holderOwned).Path
            if([IO.Path]::GetDirectoryName($holderResolved) -ne $holderRoot -or [IO.Path]::GetFileName($holderResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $holderResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing cleanup outside owned holder workspace'}
            if($holderOwned -eq $holderOwner -and [IO.File]::ReadAllText((Join-Path $holderResolved 'owner.txt')) -ne [IO.Path]::GetFileName($holderResolved)){throw 'Holder source owner mismatch'}
            Remove-Item -LiteralPath $holderResolved -Recurse -Force
        }
        Write-Output ('LOCAL_CLEANUP maintenance-session-holder-owned='+$holderOwned+' removed='+(-not(Test-Path -LiteralPath $holderOwned)))
    }
}
