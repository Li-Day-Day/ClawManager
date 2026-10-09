[CmdletBinding()]
param([switch]$MySQLService, [switch]$EvidenceMySQL, [switch]$Remote, [string]$ExpectedSnapshot)
$ErrorActionPreference='Stop'
if ($MySQLService -and $EvidenceMySQL) { throw 'Select one MySQL validation profile' }
if ($Remote -and -not ($MySQLService -or $EvidenceMySQL)) { throw 'Remote requires a MySQL validation profile' }
if ($Remote -and -not $ExpectedSnapshot) { throw 'Remote requires a passed ExpectedSnapshot fingerprint manifest' }
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$adapterRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$adapterScratch=Join-Path $adapterRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$adapterNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$adapterSaved=@{}
foreach($name in $adapterNames){$adapterSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$adapterSnapshotInputs=@()
$adapterValidationPassed=$false
$adapterProfile=if($MySQLService){'d-producer-service'}elseif($EvidenceMySQL){'a-evidence'}else{'producer-adapter'}
function Get-AdapterInputPaths {
    @('backend/go.mod','backend/go.sum')
    if ($MySQLService -or $EvidenceMySQL) {
        Get-ChildItem -LiteralPath (Join-Path $adapterRoot 'backend') -Recurse -File | Where-Object { $_.Extension -in @('.go','.sql') } | ForEach-Object { $_.FullName.Substring($adapterRoot.Length+1).Replace('\','/') }
        Get-ChildItem -LiteralPath (Join-Path $adapterRoot 'scripts') -File | Where-Object { $_.Extension -in @('.ps1','.sh') } | ForEach-Object { 'scripts/'+$_.Name }
        Get-ChildItem -LiteralPath (Join-Path $adapterRoot 'contracts/system-backup/v12') -File | ForEach-Object { 'contracts/system-backup/v12/'+$_.Name }
        return
    }
    foreach($folder in @('backend/internal/systembackupevidence','backend/internal/systembackupproducer','backend/internal/systembackupsecurity')) {
        Get-ChildItem -LiteralPath (Join-Path $adapterRoot $folder) -Filter '*.go' -File | ForEach-Object {$folder+'/'+$_.Name}
    }
    Get-ChildItem -LiteralPath (Join-Path $adapterRoot 'contracts/system-backup/v12') -File | ForEach-Object {'contracts/system-backup/v12/'+$_.Name}
}
try {
    if ($ExpectedSnapshot) {
        $expected=Get-Content -LiteralPath $ExpectedSnapshot -Raw | ConvertFrom-Json
        if ($expected.status -ne 'passed_snapshot_only') { throw 'Expected snapshot did not pass local checks' }
        if ($expected.validation_profile -ne $adapterProfile) { throw 'Expected snapshot validation profile changed; no remote contact' }
        $current=@(Get-AdapterInputPaths | Sort-Object)
        if (@(Compare-Object @($expected.files.path | Sort-Object) $current).Count) { throw 'Pinned source file set changed; no remote contact' }
        foreach ($entry in $expected.files) {
            if ((Get-FileHash -LiteralPath (Join-Path $adapterRoot $entry.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Pinned source changed: $($entry.path); no remote contact" }
        }
    }
    foreach($dir in @($adapterScratch,(Join-Path $adapterScratch 'cache'),(Join-Path $adapterScratch 'tmp'))){[IO.Directory]::CreateDirectory($dir)|Out-Null}
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOFLAGS='-mod=readonly -p=2';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='2';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $adapterScratch 'cache';$env:GOTMPDIR=Join-Path $adapterScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $adapterScratch
    Write-Output "VALIDATION_SCOPE producer-adapter-local=yes mysql-service-profile=$MySQLService evidence-mysql-profile=$EvidenceMySQL remote-requested=$Remote"
    # The shared tree may change while another owner works. Test an exact byte
    # snapshot of the actual packages and fixtures, without source substitutions.
    $adapterSnapshotRoot=Join-Path $adapterScratch 'source'
    $adapterInputPaths=@(Get-AdapterInputPaths | Sort-Object)
    foreach($relative in $adapterInputPaths) {
        $sourcePath=Join-Path $adapterRoot $relative
        $copyPath=Join-Path $adapterSnapshotRoot $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($copyPath))|Out-Null
        [IO.File]::WriteAllBytes($copyPath,[IO.File]::ReadAllBytes($sourcePath))
        $adapterSnapshotInputs+= [ordered]@{path=$relative;sha256=(Get-FileHash -LiteralPath $copyPath -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $adapterCurrentPaths=@(Get-AdapterInputPaths | Sort-Object)
    if(@(Compare-Object $adapterInputPaths $adapterCurrentPaths).Count){throw 'Input file set changed while copying; no tests started'}
    foreach($inputFile in $adapterSnapshotInputs) {
        if((Get-FileHash -LiteralPath (Join-Path $adapterRoot $inputFile.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $inputFile.sha256){throw 'Input changed while copying; no tests started'}
    }
    $adapterSnapshotReceipt=Join-Path $adapterRoot ('docs/evidence/system-backup-a-producer-snapshot-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
    [ordered]@{kind='a_producer_adapter_frozen_inputs';validation_profile=$adapterProfile;created_at=[DateTime]::UtcNow.ToString('o');files=$adapterSnapshotInputs;status='running';live_drift_after_validation=@()} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $adapterSnapshotReceipt -Encoding utf8
    Write-Output ('SNAPSHOT manifest='+$adapterSnapshotReceipt+' files='+$adapterSnapshotInputs.Count)
    Push-Location (Join-Path $adapterSnapshotRoot 'backend')
    try {
        if ($MySQLService) {
            & (Join-Path $adapterSnapshotRoot 'scripts/system-backup-a-evidence-validation.ps1') -ProducerService -Remote:$Remote -BuildParallelism 2
        } elseif ($EvidenceMySQL) {
            & (Join-Path $adapterSnapshotRoot 'scripts/system-backup-a-evidence-validation.ps1') -Remote:$Remote -BuildParallelism 2
        } else {
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupevidence','./internal/systembackupproducer')
        $env:GOOS='linux'
        Invoke-AEvidenceGoStep -Arguments @('test','-c','-o',(Join-Path $adapterScratch 'evidence-linux.test'),'./internal/systembackupevidence') -Stage 'mysql-probe-build'
        }
        foreach($inputFile in $adapterSnapshotInputs) {
            if((Get-FileHash -LiteralPath (Join-Path $adapterSnapshotRoot $inputFile.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $inputFile.sha256){throw 'Test snapshot changed during validation'}
        }
        $adapterValidationPassed=$true
        if ($EvidenceMySQL) { Write-Output 'PASS a-evidence-tests-and-vet=yes linux-evidence-test-compile=yes' }
        else { Write-Output 'PASS producer-adapter-tests-and-vet=yes linux-evidence-test-compile=yes' }
    } finally {Pop-Location}
} finally {
    foreach($name in $adapterNames){[Environment]::SetEnvironmentVariable($name,$adapterSaved[$name],'Process')}
    # Receipt I/O must never prevent removal of this run's source/build tree.
    try {
    if($adapterSnapshotReceipt -and (Test-Path -LiteralPath $adapterSnapshotReceipt)) {
        $adapterDrift=@()
        foreach($inputFile in $adapterSnapshotInputs) {
            $livePath=Join-Path $adapterRoot $inputFile.path
            if(-not(Test-Path -LiteralPath $livePath) -or (Get-FileHash -LiteralPath $livePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $inputFile.sha256){$adapterDrift+=$inputFile.path}
        }
        foreach($livePath in @(Get-AdapterInputPaths)){if($adapterInputPaths -notcontains $livePath){$adapterDrift+=$livePath}}
        $adapterSnapshotResult=Get-Content -LiteralPath $adapterSnapshotReceipt -Raw | ConvertFrom-Json
        $adapterSnapshotResult.status=if($adapterValidationPassed){'passed_snapshot_only'}else{'failed'}
        $adapterSnapshotResult.live_drift_after_validation=$adapterDrift
        $adapterSnapshotResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $adapterSnapshotReceipt -Encoding utf8
        Write-Output ('SNAPSHOT live-drift-files='+$adapterDrift.Count+' snapshot-passed='+$adapterValidationPassed)
    }
    } finally {
    if(Test-Path -LiteralPath $adapterScratch){
        $adapterResolved=(Resolve-Path -LiteralPath $adapterScratch).Path
        if([IO.Path]::GetDirectoryName($adapterResolved) -ne $adapterRoot -or [IO.Path]::GetFileName($adapterResolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or (Get-Item -Force -LiteralPath $adapterResolved).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing cleanup outside owned adapter scratch'}
        Remove-Item -LiteralPath $adapterResolved -Recurse -Force
    }
    Write-Output ('CLEANED producer-adapter-build-cache='+(-not(Test-Path -LiteralPath $adapterScratch)))
    }
}
