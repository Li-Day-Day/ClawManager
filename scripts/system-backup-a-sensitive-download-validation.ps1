[CmdletBinding()]
param(
    [ValidateRange(1,4)][int]$BuildParallelism=2,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath
)
# Local candidate gate only: no SSH, schema changes, provider I/O or nonce writes.
$ErrorActionPreference='Stop'
$downloadRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$downloadOwner=Join-Path $downloadRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$downloadFrozen=Join-Path $downloadOwner 'source'
$downloadScratch=Join-Path $downloadRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$downloadManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($downloadManifest) -ne (Join-Path $downloadRoot 'docs/evidence') -or (Test-Path -LiteralPath $downloadManifest)){throw 'Manifest must be a new docs/evidence file'}
$downloadDecision=Join-Path $downloadRoot 'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json'
$downloadDecisionSHA=(Get-FileHash -LiteralPath $downloadDecision -Algorithm SHA256).Hash.ToLowerInvariant()
$downloadVectors=Get-Content -LiteralPath (Join-Path $downloadRoot 'backend/internal/systembackupsecurity/testdata/sensitive_download_request_vectors.json') -Raw | ConvertFrom-Json
if($downloadVectors.contract_decision_sha256 -ne $downloadDecisionSHA){throw 'D decision differs from reviewed candidate vectors'}
$downloadNames=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$downloadPrevious=@{}
foreach($downloadName in $downloadNames){$downloadPrevious[$downloadName]=[Environment]::GetEnvironmentVariable($downloadName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
try {
    [IO.Directory]::CreateDirectory($downloadOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $downloadOwner 'owner.txt'),[IO.Path]::GetFileName($downloadOwner))
    Write-Output ('OWNED sensitive-download-source='+$downloadOwner+' scratch='+$downloadScratch)
    $downloadSnapshot=New-DIndexSourceSnapshot -Root $downloadRoot -Destination $downloadFrozen
    $downloadSnapshot.contract_decision_sha256=$downloadDecisionSHA
    $downloadStream=[IO.File]::Open($downloadManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$downloadBytes=[Text.Encoding]::UTF8.GetBytes(($downloadSnapshot|ConvertTo-Json -Depth 6));$downloadStream.Write($downloadBytes,0,$downloadBytes.Length)}finally{$downloadStream.Dispose()}
    Write-Output ('LOCAL_SOURCE sensitive-download=yes source_sha256='+$downloadSnapshot.source_sha256+' files='+$downloadSnapshot.files.Count+' d_decision_sha256='+$downloadDecisionSHA)
    foreach($downloadDirectory in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $downloadScratch $downloadDirectory))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOCACHE=Join-Path $downloadScratch 'cache';$env:GOTMPDIR=Join-Path $downloadScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $downloadScratch
    Push-Location (Join-Path $downloadFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE sensitive-download-two-full-packages default-vet=yes retry=no dependency-downloads=no'
        $downloadExit=Invoke-AEvidenceNative -FilePath 'C:\Program Files\Go\bin\go.exe' -Arguments @('test','-json','-count=1','-timeout=900s',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupevidence')
        Write-Output ('SENSITIVE_DOWNLOAD_GO_EXIT='+$downloadExit)
        if($downloadExit -ne 0){throw ('Sensitive download candidate gate failed (exit='+$downloadExit+'); no automatic retry')}
        Test-DIndexSourceSnapshot -Root $downloadFrozen -Manifest $downloadSnapshot
        if((Get-FileHash -LiteralPath $downloadDecision -Algorithm SHA256).Hash.ToLowerInvariant() -ne $downloadDecisionSHA){throw 'D decision changed during candidate validation'}
        Write-Output 'LOCAL_PASS sensitive-download-candidate=yes frozen-postcheck=yes d-decision-postcheck=yes default-vet=yes nonce-consumed=no provider-read=no production-adapter=no real-mysql=no'
    } finally {Pop-Location}
} finally {
    foreach($downloadName in $downloadNames){[Environment]::SetEnvironmentVariable($downloadName,$downloadPrevious[$downloadName],'Process')}
    foreach($downloadOwned in @($downloadScratch,$downloadOwner)){
        if(Test-Path -LiteralPath $downloadOwned){
            $downloadResolved=(Resolve-Path -LiteralPath $downloadOwned).Path
            if([IO.Path]::GetDirectoryName($downloadResolved) -ne $downloadRoot -or [IO.Path]::GetFileName($downloadResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $downloadResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing cleanup outside owned sensitive download workspace'}
            if($downloadOwned -eq $downloadOwner -and [IO.File]::ReadAllText((Join-Path $downloadResolved 'owner.txt')) -ne [IO.Path]::GetFileName($downloadResolved)){throw 'Sensitive download source owner mismatch'}
            Remove-Item -LiteralPath $downloadResolved -Recurse -Force
        }
        Write-Output ('LOCAL_CLEANUP sensitive-download-owned='+$downloadOwned+' removed='+(-not(Test-Path -LiteralPath $downloadOwned)))
    }
}
