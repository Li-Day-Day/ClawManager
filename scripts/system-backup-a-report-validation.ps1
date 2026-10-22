[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$reportRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$reportRun=[guid]::NewGuid().ToString('N')
$reportOwned=Join-Path $reportRoot ('.tmp-a-evidence-'+$reportRun)
$reportReceipt=Join-Path $reportRoot ('docs/evidence/a-business-report-local-'+$reportRun+'.json')
$reportLog=Join-Path $reportRoot ('docs/evidence/a-business-report-local-'+$reportRun+'.txt')
$reportNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$reportPrior=@{}
foreach($name in $reportNames){$reportPrior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$reportResult=[ordered]@{kind='a_business_report_local_validation.v1';status='failed';started_at=[DateTime]::UtcNow.ToString('o');completed_at=$null;business_passed=$false;tagged_seed_passed=$false;delivery_passed=$false;cleanup_verified=$false;dependencies_installed=$false;real_mysql_verified=$false;live_auth_verified=$false;inputs=@();inputs_unchanged=$false;log_sha256=''}
$reportFiles=@('backend/internal/systembackupbusinessa/report.go','backend/internal/systembackupbusinessa/report_test.go','backend/internal/systembackupbusinessa/sql_report.go','backend/internal/systembackupbusinessa/sql_report_test.go','backend/internal/systembackupbusinessa/report_mysql_test.go','backend/internal/systembackupbusinessa/restore_rows_mysql_test.go','backend/internal/systembackupevidence/business_report_delivery_test.go','scripts/system-backup-a-report-validation.ps1','scripts/system-backup-a-evidence-go-step.ps1')
$reportTranscriptStarted=$false
try {
    foreach($dir in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $reportOwned $dir))|Out-Null}
    Start-Transcript -LiteralPath $reportLog -NoClobber|Out-Null
    $reportTranscriptStarted=$true
    $reportResult.inputs=@($reportFiles|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $reportRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='1'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GOCACHE=Join-Path $reportOwned 'cache';$env:GOTMPDIR=Join-Path $reportOwned 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $reportOwned
    Push-Location (Join-Path $reportRoot 'backend')
    try {
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=10m','-v','./internal/systembackupbusinessa') -Stage 'test-vet'
        $reportResult.business_passed=$true
        Invoke-AEvidenceGoStep -Arguments @('test','-tags=systembackup_mysql','-count=1','-timeout=3m','-v','-run','^TestABusinessRestoreMySQLSeed$','./internal/systembackupbusinessa') -Stage 'test-vet'
        $reportResult.tagged_seed_passed=$true
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=5m','-v','-run','^Test(BusinessReportEncryptedFileAuthorizedDownloadAndAudit|DownloadAuthAuditRangeAndNoPartialBody|EnvelopeChunkRangesAndTampering)$','./internal/systembackupevidence') -Stage 'test-vet'
        $reportResult.delivery_passed=$true
    } finally {Pop-Location}
    foreach($pin in $reportResult.inputs){if((Get-FileHash -LiteralPath (Join-Path $reportRoot $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Report implementation or validation entry changed during tests'}}
    $reportResult.inputs_unchanged=$true
    $reportResult.status='local_reports_and_encrypted_file_delivery_passed_mysql_pending'
} finally {
    foreach($name in $reportNames){[Environment]::SetEnvironmentVariable($name,$reportPrior[$name],'Process')}
    if($reportTranscriptStarted){Stop-Transcript|Out-Null}
    if(Test-Path -LiteralPath $reportLog){$reportResult.log_sha256=(Get-FileHash -LiteralPath $reportLog -Algorithm SHA256).Hash.ToLowerInvariant()}
    $reportResolved=[IO.Path]::GetFullPath($reportOwned)
    if([IO.Path]::GetDirectoryName($reportResolved) -ne $reportRoot -or [IO.Path]::GetFileName($reportResolved) -cne ('.tmp-a-evidence-'+$reportRun) -or ((Test-Path -LiteralPath $reportResolved) -and ((Get-Item -Force -LiteralPath $reportResolved).Attributes -band [IO.FileAttributes]::ReparsePoint))){throw 'Unsafe report validation cleanup target'}
    if(Test-Path -LiteralPath $reportResolved){Remove-Item -LiteralPath $reportResolved -Recurse -Force}
    $reportResult.cleanup_verified=-not(Test-Path -LiteralPath $reportResolved)
    $reportResult.completed_at=[DateTime]::UtcNow.ToString('o')
    $reportStream=[IO.File]::Open($reportReceipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $reportWriter=New-Object IO.StreamWriter($reportStream,(New-Object Text.UTF8Encoding($false)))
    try{$reportWriter.WriteLine(($reportResult|ConvertTo-Json -Depth 6))}finally{$reportWriter.Dispose()}
    Write-Output ('CLEANED report validation='+$reportResult.cleanup_verified)
    Write-Output ('REPORT_RECEIPT '+$reportReceipt)
}
