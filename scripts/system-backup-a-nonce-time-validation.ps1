[CmdletBinding()]
param(
    [ValidateSet('Baseline','Final')][string]$Phase='Final',
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [Parameter(Mandatory=$true)][string]$LogPath
)
# Local only. The baseline must fail the new counterexamples; final runs the
# entire security package with default vet. No Go or postcheck retry is allowed.
$ErrorActionPreference='Stop'
$nonceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nonceOwner=Join-Path $nonceRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$nonceSource=Join-Path $nonceOwner 'source'
$nonceScratch=Join-Path $nonceRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$nonceEvidence=Join-Path $nonceRoot 'docs/evidence'
$nonceManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$nonceLog=[IO.Path]::GetFullPath($LogPath)
foreach($nonceOutput in @($nonceManifest,$nonceLog)){
    if([IO.Path]::GetDirectoryName($nonceOutput) -ne $nonceEvidence -or (Test-Path -LiteralPath $nonceOutput)){throw 'Outputs must be new docs/evidence files'}
}
if($nonceManifest -eq $nonceLog){throw 'Log and manifest must differ'}
$nonceNames=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$noncePrevious=@{}
foreach($nonceName in $nonceNames){$noncePrevious[$nonceName]=[Environment]::GetEnvironmentVariable($nonceName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$nonceResult=1
Start-Transcript -LiteralPath $nonceLog -NoClobber | Out-Null
try {
    [IO.Directory]::CreateDirectory($nonceOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $nonceOwner 'owner.txt'),[IO.Path]::GetFileName($nonceOwner))
    Write-Host ('NONCE_OWNER source='+$nonceOwner+' scratch='+$nonceScratch+' phase='+$Phase)
    $nonceSnapshot=New-AConfigProofSourceSnapshot -Root $nonceRoot -Owner $nonceOwner -MaxAttempts 3
    [IO.File]::WriteAllText($nonceManifest,($nonceSnapshot|ConvertTo-Json -Depth 7))
    Write-Host ('NONCE_SOURCE files='+$nonceSnapshot.files.Count+' sha256='+$nonceSnapshot.source_sha256)
    foreach($nonceDirectory in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $nonceScratch $nonceDirectory))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $nonceScratch 'cache';$env:GOTMPDIR=Join-Path $nonceScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $nonceScratch
    Push-Location (Join-Path $nonceSource 'backend')
    try {
        $nonceArguments=@('test','-json','-count=1','-timeout=900s','-p=2')
        if($Phase -eq 'Baseline'){$nonceArguments+=@('-run','^TestA(?:Provider|Config)NonceUsesSQLAcceptanceTime$')}
        $nonceArguments+='./internal/systembackupsecurity'
        Write-Host ('NONCE_STAGE phase='+$Phase+' full-security-package='+($Phase -eq 'Final')+' default-vet=yes dependency-installation=no remote=no')
        $nonceNative=Invoke-AEvidenceNative -FilePath 'C:\Program Files\Go\bin\go.exe' -Arguments $nonceArguments
        Write-Host ('NONCE_GO_EXIT='+$nonceNative)
        Test-DIndexSourceSnapshot -Root $nonceSource -Manifest $nonceSnapshot
        Write-Host 'NONCE_POSTCHECK frozen-source=yes'
        $nonceResult=$nonceNative
    } finally {Pop-Location}
} finally {
    foreach($nonceName in $nonceNames){[Environment]::SetEnvironmentVariable($nonceName,$noncePrevious[$nonceName],'Process')}
    try {
        foreach($nonceOwned in @($nonceScratch,$nonceOwner)){
            if(Test-Path -LiteralPath $nonceOwned){
                $nonceResolved=(Resolve-Path -LiteralPath $nonceOwned).Path
                if([IO.Path]::GetDirectoryName($nonceResolved) -ne $nonceRoot -or [IO.Path]::GetFileName($nonceResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                    ((Get-Item -Force -LiteralPath $nonceResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing cleanup outside nonce-time owned directory'}
                if($nonceOwned -eq $nonceOwner -and [IO.File]::ReadAllText((Join-Path $nonceResolved 'owner.txt')) -ne [IO.Path]::GetFileName($nonceResolved)){throw 'Nonce-time source owner mismatch'}
                Remove-Item -LiteralPath $nonceResolved -Recurse -Force
            }
            Write-Host ('NONCE_CLEANUP owned='+$nonceOwned+' removed='+(-not(Test-Path -LiteralPath $nonceOwned)))
        }
    } catch {$nonceResult=1;throw} finally {
        Write-Host ('nonce_time_exit='+$nonceResult)
        Stop-Transcript | Out-Null
    }
}
if($nonceResult -ne 0){exit $nonceResult}
