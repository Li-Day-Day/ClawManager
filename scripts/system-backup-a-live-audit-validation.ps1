$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$auditValidationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$auditValidationOwned=Join-Path $auditValidationRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$auditValidationSource=Join-Path $auditValidationOwned 'source'
$auditValidationVars=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$auditValidationPrior=@{}
foreach($auditValidationName in $auditValidationVars){$auditValidationPrior[$auditValidationName]=[Environment]::GetEnvironmentVariable($auditValidationName,'Process')}
function Get-AuditValidationFiles {
    param([string]$Root)
    Push-Location $Root
    try {$files=@(& rg --files --hidden --no-ignore backend/cmd/system-backup-audit-collect);if($LASTEXITCODE -ne 0){throw 'Cannot enumerate audit collector inputs'}} finally {Pop-Location}
    return @(@($files | ForEach-Object {$_.Replace('\','/')})+@('backend/go.mod','backend/go.sum') | Sort-Object -CaseSensitive)
}
$auditValidationResult=[ordered]@{kind='a_live_audit_collector_local_validation.v1';status='failed';started_at=[DateTime]::UtcNow.ToString('o');completed_at=$null;files=@();source_sha256='';test_vet_passed=$false;windows_sha256='';linux_sha256='';source_stable=$false;cleanup_verified=$false;sql_driver='synthetic_only';remote_contacted=$false;dependencies_installed=$false}
$auditValidationResult.validation_inputs=@(Get-DIndexInputPins -Root $auditValidationRoot -Files @('scripts/system-backup-a-live-audit-validation.ps1','scripts/system-backup-a-evidence-go-step.ps1','scripts/system-backup-d-index-source-snapshot.ps1'))
$auditValidationEvidence=Join-Path $auditValidationRoot ('docs/evidence/a-live-audit-collector-local-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
try {
    foreach($auditValidationDir in @('source','cache','tmp','binary')){[IO.Directory]::CreateDirectory((Join-Path $auditValidationOwned $auditValidationDir))|Out-Null}
    $auditValidationFiles=Get-AuditValidationFiles -Root $auditValidationRoot
    $auditValidationPins=@(Get-DIndexInputPins -Root $auditValidationRoot -Files $auditValidationFiles)
    $auditValidationResult.files=$auditValidationPins
    $auditValidationResult.source_sha256=Get-DIndexPinDigest -Pins $auditValidationPins
    foreach($auditValidationPin in $auditValidationPins){
        $auditValidationTarget=Join-Path $auditValidationSource $auditValidationPin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($auditValidationTarget))|Out-Null
        Copy-Item -LiteralPath (Join-Path $auditValidationRoot $auditValidationPin.path) -Destination $auditValidationTarget
        if((Get-FileHash -Algorithm SHA256 -LiteralPath $auditValidationTarget).Hash.ToLowerInvariant() -cne $auditValidationPin.sha256){throw 'Audit collector source changed during freeze'}
    }
    if(($auditValidationFiles -join "`n") -cne ((Get-AuditValidationFiles -Root $auditValidationRoot) -join "`n") -or
        (Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $auditValidationRoot -Files $auditValidationFiles)) -cne $auditValidationResult.source_sha256){throw 'Audit collector source/file set changed during freeze'}
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='1'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GOCACHE=Join-Path $auditValidationOwned 'cache';$env:GOTMPDIR=Join-Path $auditValidationOwned 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $auditValidationOwned
    Push-Location (Join-Path $auditValidationSource 'backend')
    try {
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=3m','./cmd/system-backup-audit-collect') -Stage 'test-vet'
        $auditValidationResult.test_vet_passed=$true
        Invoke-AEvidenceGoStep -Arguments @('build','-trimpath','-buildvcs=false','-o',(Join-Path $auditValidationOwned 'binary/audit.exe'),'./cmd/system-backup-audit-collect') -Stage 'server-build'
        $auditValidationResult.windows_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $auditValidationOwned 'binary/audit.exe')).Hash.ToLowerInvariant()
        $env:GOOS='linux'
        Invoke-AEvidenceGoStep -Arguments @('build','-trimpath','-buildvcs=false','-o',(Join-Path $auditValidationOwned 'binary/audit'),'./cmd/system-backup-audit-collect') -Stage 'server-build'
        $auditValidationResult.linux_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $auditValidationOwned 'binary/audit')).Hash.ToLowerInvariant()
    } finally {Pop-Location}
    foreach($auditValidationPin in $auditValidationPins){if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $auditValidationRoot $auditValidationPin.path)).Hash.ToLowerInvariant() -cne $auditValidationPin.sha256){throw 'Audit collector source changed during validation'}}
    foreach($auditValidationCheckRoot in @($auditValidationRoot,$auditValidationSource)){
        if(($auditValidationFiles -join "`n") -cne ((Get-AuditValidationFiles -Root $auditValidationCheckRoot) -join "`n") -or
            (Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $auditValidationCheckRoot -Files $auditValidationFiles)) -cne $auditValidationResult.source_sha256){throw 'Audit collector source/file set postcheck failed'}
    }
    foreach($auditValidationInput in $auditValidationResult.validation_inputs){if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $auditValidationRoot $auditValidationInput.path)).Hash.ToLowerInvariant() -cne $auditValidationInput.sha256){throw 'Audit validation helper changed'}}
    $auditValidationResult.source_stable=$true
    $auditValidationResult.status='local_unit_vet_windows_linux_passed_real_mysql_pending'
    Write-Output 'PASS audit collector unit tests/default vet and Windows/Linux builds; synthetic SQL driver only; no remote database'
} finally {
    foreach($auditValidationName in $auditValidationVars){[Environment]::SetEnvironmentVariable($auditValidationName,$auditValidationPrior[$auditValidationName],'Process')}
    $auditValidationResolved=[IO.Path]::GetFullPath($auditValidationOwned)
    if([IO.Path]::GetDirectoryName($auditValidationResolved) -ne $auditValidationRoot -or [IO.Path]::GetFileName($auditValidationResolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Test-Path -LiteralPath $auditValidationResolved) -and ((Get-Item -Force -LiteralPath $auditValidationResolved).Attributes -band [IO.FileAttributes]::ReparsePoint))){throw 'Unsafe audit collector cleanup'}
    if(Test-Path -LiteralPath $auditValidationResolved){Remove-Item -LiteralPath $auditValidationResolved -Recurse -Force}
    $auditValidationResult.cleanup_verified=-not(Test-Path -LiteralPath $auditValidationResolved)
    $auditValidationResult.completed_at=[DateTime]::UtcNow.ToString('o')
    $auditValidationStream=[IO.File]::Open($auditValidationEvidence,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $auditValidationWriter=New-Object IO.StreamWriter($auditValidationStream,(New-Object Text.UTF8Encoding($false)))
    try {$auditValidationWriter.WriteLine(($auditValidationResult|ConvertTo-Json -Depth 8))} finally {$auditValidationWriter.Dispose()}
    Write-Output ('CLEANED audit collector='+(-not(Test-Path -LiteralPath $auditValidationResolved)))
    Write-Output ('LOCAL_RECEIPT '+$auditValidationEvidence)
}
