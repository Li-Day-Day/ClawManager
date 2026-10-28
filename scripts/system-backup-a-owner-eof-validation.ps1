param([switch]$RuntimeDiagnosticOnly)
$ErrorActionPreference='Stop'
$aRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$aOwned=Join-Path $aRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$aPrefix=Join-Path $aRoot ('docs/evidence/a-owner-eof-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$aNames=@('GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOFLAGS','GOWORK','CGO_ENABLED','GOMAXPROCS')
$aPrior=@{}; foreach($n in $aNames){$aPrior[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
$aResult=[ordered]@{kind='a_owner_eof_validation.v1';passed=$false;owner=$aOwned;dependencies_installed=$false;remote_run=$false;cleanup=$false;stages=@()}
$aResult.profile=if($RuntimeDiagnosticOnly){'runtime_diagnostic_only'}else{'eof_and_complete_evidence_producer'}
Start-Transcript -LiteralPath ($aPrefix+'.txt') | Out-Null
try {
    foreach($d in @('source','cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $aOwned $d))|Out-Null}
    $aPins=@(Get-DIndexInputPins -Root $aRoot -Files (Get-DIndexSourceFiles -Root $aRoot))
    $aResult.source=$aPins
    foreach($p in $aPins){
        $to=Join-Path (Join-Path $aOwned 'source') $p.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))|Out-Null
        Copy-Item -LiteralPath (Join-Path $aRoot $p.path) -Destination $to
        if((Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Source changed while freezing'}
    }
    $env:GOCACHE=Join-Path $aOwned 'cache'; $env:GOTMPDIR=Join-Path $aOwned 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $aOwned
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOFLAGS='-mod=readonly -p=2';$env:GOWORK='off';$env:CGO_ENABLED='0';$env:GOMAXPROCS='2'
    Push-Location (Join-Path $aOwned 'source/backend')
    try {
        $aFilter=if($RuntimeDiagnosticOnly){'^(TestDownloadRuntimeAdmittedHTTPWithAtomicSQLSTSAndTransit|TestADownloadEmptyBody)'}else{'^TestADownloadEmptyBody'}
        Invoke-AEvidenceGoStep -Arguments @('test','-json','-count=1','-timeout=5m','-run',$aFilter,'./internal/systembackupevidence')
        $aResult.stages+= 'targeted_tests_passed'
        if(-not $RuntimeDiagnosticOnly){
            Invoke-AEvidenceGoStep -Arguments @('test','-json','-count=1','-timeout=30m','./internal/systembackupevidence','./internal/systembackupproducer')
            $aResult.stages+= 'full_evidence_producer_default_vet_passed'
        }
        $aAfter=@(Get-DIndexInputPins -Root (Join-Path $aOwned 'source') -Files @($aPins|ForEach-Object {$_.path}))
        if(($aAfter|ConvertTo-Json -Compress) -cne ($aPins|ConvertTo-Json -Compress)){throw 'Frozen input postcheck failed'}
        $aResult.stages+= 'frozen_input_bytes_postchecked'
        $aResult.passed=$true
    } finally {Pop-Location}
} finally {
    foreach($n in $aNames){[Environment]::SetEnvironmentVariable($n,$aPrior[$n],'Process')}
    # Delete only this exact direct child, after resolving its workspace boundary.
    if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($aOwned)) -ne $aRoot -or [IO.Path]::GetFileName($aOwned) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$'){throw 'Unsafe cleanup target'}
    if(Test-Path -LiteralPath $aOwned){Remove-Item -LiteralPath $aOwned -Recurse -Force}
    $aResult.cleanup= -not (Test-Path -LiteralPath $aOwned)
    $aResult | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath ($aPrefix+'.json') -Encoding utf8
    Stop-Transcript | Out-Null
}
