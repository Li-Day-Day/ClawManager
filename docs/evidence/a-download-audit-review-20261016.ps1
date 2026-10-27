[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SourceManifestPath,[ValidateRange(1,2)][int]$BuildParallelism=1,[string]$PreparedScratchPath)
$ErrorActionPreference='Stop'
$auditReviewRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$auditReviewOwner=Join-Path $auditReviewRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$auditReviewFrozen=Join-Path $auditReviewOwner 'source'
$auditReviewScratch=Join-Path $auditReviewRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$auditReviewPrepared=$false
if($PreparedScratchPath){
    $auditReviewScratch=(Resolve-Path -LiteralPath $PreparedScratchPath).Path
    if([IO.Path]::GetDirectoryName($auditReviewScratch) -ne $auditReviewRoot -or [IO.Path]::GetFileName($auditReviewScratch) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $auditReviewScratch).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $auditReviewScratch 'owner.txt')) -ne [IO.Path]::GetFileName($auditReviewScratch)){throw 'Invalid prepared audit scratch owner'}
    $auditReviewPrepared=$true
}
$auditReviewManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($auditReviewManifest) -ne (Join-Path $auditReviewRoot 'docs/evidence') -or (Test-Path -LiteralPath $auditReviewManifest)){throw 'Manifest must be a new evidence file'}
$auditReviewSource='backend/internal/systembackupevidence/download_admission_audit.go'
$auditReviewSourceSHA=(Get-FileHash -LiteralPath (Join-Path $auditReviewRoot $auditReviewSource) -Algorithm SHA256).Hash.ToLowerInvariant()
$auditReviewHarnessSHA=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$auditReviewNames=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$auditReviewPrevious=@{}
foreach($auditReviewName in $auditReviewNames){$auditReviewPrevious[$auditReviewName]=[Environment]::GetEnvironmentVariable($auditReviewName,'Process')}
. (Join-Path $auditReviewRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
. (Join-Path $auditReviewRoot 'scripts/system-backup-a-config-proof-source.ps1')
. (Join-Path $auditReviewRoot 'scripts/system-backup-a-evidence-go-step.ps1')
try {
    [IO.Directory]::CreateDirectory($auditReviewOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $auditReviewOwner 'owner.txt'),[IO.Path]::GetFileName($auditReviewOwner))
    Write-Output ('OWNED download-audit-source='+$auditReviewOwner+' scratch='+$auditReviewScratch)
    $auditReviewSnapshot=New-AConfigProofSourceSnapshot -Root $auditReviewRoot -Owner $auditReviewOwner -MaxAttempts 3
    if((Get-FileHash -LiteralPath (Join-Path $auditReviewFrozen $auditReviewSource) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $auditReviewSourceSHA){throw 'Audit implementation changed before source capture'}
    $auditReviewSnapshot.audit_source_sha256=$auditReviewSourceSHA
    $auditReviewSnapshot.review_harness_sha256=$auditReviewHarnessSHA
    $auditReviewStream=[IO.File]::Open($auditReviewManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$auditReviewBytes=[Text.Encoding]::UTF8.GetBytes(($auditReviewSnapshot|ConvertTo-Json -Depth 6));$auditReviewStream.Write($auditReviewBytes,0,$auditReviewBytes.Length)}finally{$auditReviewStream.Dispose()}
    Write-Output ('LOCAL_SOURCE download-audit-review=yes source_sha256='+$auditReviewSnapshot.source_sha256+' files='+$auditReviewSnapshot.files.Count+' audit_sha256='+$auditReviewSourceSHA)
    foreach($auditReviewDir in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $auditReviewScratch $auditReviewDir))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOCACHE=Join-Path $auditReviewScratch 'cache';$env:GOTMPDIR=Join-Path $auditReviewScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $auditReviewScratch
    Push-Location (Join-Path $auditReviewFrozen 'backend')
    try {
        Write-Output ('LOCAL_STAGE download-audit-evidence-full default-vet=yes retry=no dependency-downloads=no sql-transport=model build-parallelism='+$BuildParallelism+' prepared-cache='+$(if($auditReviewPrepared){'yes'}else{'no'}))
        $auditReviewExit=Invoke-AEvidenceNative -FilePath 'C:\Program Files\Go\bin\go.exe' -Arguments @('test','-json','-count=1','-timeout=900s',('-p='+$BuildParallelism),'./internal/systembackupevidence')
        Write-Output ('DOWNLOAD_AUDIT_GO_EXIT='+$auditReviewExit)
        if($auditReviewExit -ne 0){throw ('Download audit review failed (exit='+$auditReviewExit+'); no automatic retry')}
        Test-DIndexSourceSnapshot -Root $auditReviewFrozen -Manifest $auditReviewSnapshot
        if((Get-FileHash -LiteralPath (Join-Path $auditReviewRoot $auditReviewSource) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $auditReviewSourceSHA -or (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $auditReviewHarnessSHA){throw 'Audit implementation or review harness changed during validation'}
        Write-Output 'LOCAL_PASS download-audit-review=yes frozen-postcheck=yes audit-postcheck=yes default-vet=yes SQL-transport=model real-mysql=no nonce-consumed=no provider-read=no production-adapter=no'
    } finally {Pop-Location}
} finally {
    foreach($auditReviewName in $auditReviewNames){[Environment]::SetEnvironmentVariable($auditReviewName,$auditReviewPrevious[$auditReviewName],'Process')}
    foreach($auditReviewOwned in @($auditReviewScratch,$auditReviewOwner)){
        if(Test-Path -LiteralPath $auditReviewOwned){
            $auditReviewResolved=(Resolve-Path -LiteralPath $auditReviewOwned).Path
            if([IO.Path]::GetDirectoryName($auditReviewResolved) -ne $auditReviewRoot -or [IO.Path]::GetFileName($auditReviewResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $auditReviewResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing cleanup outside owned audit review workspace'}
            if($auditReviewOwned -eq $auditReviewOwner -and [IO.File]::ReadAllText((Join-Path $auditReviewResolved 'owner.txt')) -ne [IO.Path]::GetFileName($auditReviewResolved)){throw 'Audit review source owner mismatch'}
            Remove-Item -LiteralPath $auditReviewResolved -Recurse -Force
        }
        Write-Output ('LOCAL_CLEANUP download-audit-review-owned='+$auditReviewOwned+' removed='+(-not(Test-Path -LiteralPath $auditReviewOwned)))
    }
}
