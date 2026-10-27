[CmdletBinding()]
param(
    [switch]$Remote,
    [switch]$StartupOnly,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
if($StartupOnly -and -not $Remote){throw 'StartupOnly requires Remote; it runs only the isolated MySQL startup diagnostic'}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$collectorRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$collectorOwned=Join-Path $collectorRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$collectorSource=Join-Path $collectorOwned 'source'
$collectorID='aaudit-'+(Get-Date -Format 'yyyyMMddHHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$collectorEvidence=Join-Path $collectorRoot ('docs/evidence/a-live-audit-mysql-'+$collectorID+'.json')
$collectorLog=Join-Path $collectorRoot ('docs/evidence/a-live-audit-mysql-'+$collectorID+'.txt')
$collectorVars=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$collectorPrior=@{}
foreach($collectorName in $collectorVars){$collectorPrior[$collectorName]=[Environment]::GetEnvironmentVariable($collectorName,'Process')}
function Get-CollectorMySQLFiles {
    param([string]$Root)
    Push-Location $Root
    try {$all=@(& rg --files --hidden --no-ignore backend/cmd/system-backup-audit-collect);if($LASTEXITCODE -ne 0){throw 'Cannot enumerate collector'}} finally {Pop-Location}
    $all=@($all | ForEach-Object {$_.Replace('\','/')})+@('backend/go.mod','backend/go.sum','scripts/system-backup-a-live-audit-mysql.ps1','scripts/system-backup-a-live-audit-mysql.sh','scripts/system-backup-a-evidence-go-step.ps1','scripts/system-backup-d-index-source-snapshot.ps1',
        # Imported public deployment parsers read these files at module load.
        'backend/internal/systembackupsecurity/registration_runtime.go','backend/internal/systembackupsecurity/bootstrap_deployment.go',
        'backend/cmd/system-backup-registration/download_deployment.go','backend/cmd/system-backup-registration/download_grants.go','backend/cmd/system-backup-registration/download_readiness.go')
    $queue=New-Object 'System.Collections.Generic.Queue[string]'
    $queue.Enqueue('scripts/system-backup-a-live-audit-mysql-review.mjs')
    $queue.Enqueue('scripts/system-backup-a-live-audit-mysql-bundle.mjs')
    $seen=@{}
    while($queue.Count -gt 0){
        $file=$queue.Dequeue()
        if($seen.ContainsKey($file)){continue}
        $seen[$file]=$true;$all+=$file
        foreach($match in [regex]::Matches([IO.File]::ReadAllText((Join-Path $Root $file)),'from\s+[''"](\./[A-Za-z0-9._-]+\.mjs)')){
            $queue.Enqueue('scripts/'+$match.Groups[1].Value.Substring(2))
        }
    }
    return @($all | Sort-Object -Unique -CaseSensitive)
}
$collectorResult=[ordered]@{kind='a_live_audit_collector_mysql_validation.v1';status='failed';started_at=[DateTime]::UtcNow.ToString('o');completed_at=$null;source_sha256='';files=@();linux_test_sha256='';test_vet_passed=$false;source_stable=$false;remote_requested=[bool]$Remote;remote_started=$false;remote_cleanup_verified=$false;local_cleanup_verified=$false;dependencies_installed=$false;real_http_verified=$false;application_migrations_verified=$false;tls_verified=$false}
$collectorResult.evidence_binding_version=1
$collectorResult.run_id=$collectorID
$collectorResult.transcript_sha256=''
$collectorResult.ssh_exit=$null
$collectorResult.stage='source_freeze'
$collectorResult.failure_stage=''
if($StartupOnly){$collectorResult.startup_only=$true}
$collectorMode='audit'
if($StartupOnly){$collectorMode='startup'}
$collectorRemoteOwned=$false
$collectorWriter=$null
try {
    foreach($dir in @('source','cache','tmp','binary')){[IO.Directory]::CreateDirectory((Join-Path $collectorOwned $dir))|Out-Null}
    $collectorFiles=Get-CollectorMySQLFiles -Root $collectorRoot
    $collectorPins=Get-DIndexInputPins -Root $collectorRoot -Files $collectorFiles
    $collectorResult.files=$collectorPins
    $collectorResult.source_sha256=Get-DIndexPinDigest -Pins $collectorPins
    foreach($pin in $collectorPins){
        $target=Join-Path $collectorSource $pin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
        Copy-Item -LiteralPath (Join-Path $collectorRoot $pin.path) -Destination $target
        if((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Collector freeze changed'}
    }
    function Assert-CollectorSnapshot {
        foreach($checkRoot in @($collectorRoot,$collectorSource)){
            if(($collectorFiles -join "`n") -cne ((Get-CollectorMySQLFiles -Root $checkRoot) -join "`n") -or (Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $checkRoot -Files $collectorFiles)) -cne $collectorResult.source_sha256){throw 'Collector source snapshot changed'}
        }
    }
    Assert-CollectorSnapshot
    if(-not $StartupOnly){
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='1'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GOCACHE=Join-Path $collectorOwned 'cache';$env:GOTMPDIR=Join-Path $collectorOwned 'tmp'
    $collectorResult.stage='go_telemetry'
    Initialize-AEvidenceTelemetry -Scratch $collectorOwned
    Push-Location (Join-Path $collectorSource 'backend')
    try {
        $collectorResult.stage='go_unit_vet'
        Invoke-AEvidenceGoStep -Arguments @('test','-trimpath','-count=1','-timeout=3m','./cmd/system-backup-audit-collect') -Stage 'test-vet'
        # Compile the tagged MySQL tests with default vet; do not execute them on Windows.
        $env:GOOS='linux'
        $collectorBinary=Join-Path $collectorOwned 'binary/probe.test'
        $collectorResult.stage='linux_probe_build'
        Invoke-AEvidenceGoStep -Arguments @('test','-trimpath','-buildvcs=false','-tags=audit_collector_mysql','-c','-o',$collectorBinary,'./cmd/system-backup-audit-collect') -Stage 'mysql-probe-build'
        $collectorResult.test_vet_passed=$true
        $collectorResult.linux_test_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $collectorBinary).Hash.ToLowerInvariant()
    } finally {Pop-Location}
    }
    $collectorResult.stage='source_recheck'
    Assert-CollectorSnapshot
    $collectorResult.source_stable=$true
    $collectorResult.status='local_compiled_real_mysql_pending'
    if($Remote){
        $collectorResult.status='remote_incomplete'
        $collectorFile=[IO.File]::Open($collectorLog,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
        $collectorWriter=New-Object IO.StreamWriter($collectorFile,(New-Object Text.UTF8Encoding($false)))
        $collectorWriter.WriteLine('source_sha256='+$collectorResult.source_sha256);$collectorWriter.Flush()
        $remoteDir='/tmp/'+$collectorID
        $remoteCreate="umask 077; mkdir -- '$remoteDir'"
        $collectorResult.stage='ssh_upload_directory'
        $exit=Invoke-AEvidenceNative -FilePath 'ssh' -Arguments @('--',$SshTarget,$remoteCreate)
        if($exit -ne 0){throw 'Cannot reserve unique remote upload directory'}
        $collectorRemoteOwned=$true
        $collectorScript=Join-Path $collectorOwned 'binary/probe.sh'
        [IO.File]::WriteAllText($collectorScript,[IO.File]::ReadAllText((Join-Path $collectorSource 'scripts/system-backup-a-live-audit-mysql.sh')).Replace("`r`n","`n"),(New-Object Text.UTF8Encoding($false)))
        $collectorScriptSHA=(Get-FileHash -Algorithm SHA256 -LiteralPath $collectorScript).Hash.ToLowerInvariant()
        $collectorResult.remote_script_sha256=$collectorScriptSHA
        $collectorResult.stage='scp_upload'
        $collectorUploads=@('--')
        if(-not $StartupOnly){$collectorUploads+=$collectorBinary}
        $collectorUploads+=@($collectorScript,($SshTarget+':'+$remoteDir+'/'))
        $exit=Invoke-AEvidenceNative -FilePath 'scp' -Arguments $collectorUploads
        if($exit -ne 0){throw 'Collector upload failed'}
        Assert-CollectorSnapshot
        $collectorResult.stage='remote_mysql'
        $collectorResult.remote_started=$true
        # SSH owns one execution. Never retry a remote test on timeout or failure.
        $collectorNativePreference=$ErrorActionPreference
        $ErrorActionPreference='Continue'
        $PSNativeCommandUseErrorActionPreference=$false
        $collectorRemoteBinarySHA=$collectorResult.linux_test_sha256
        if($StartupOnly){$collectorRemoteBinarySHA='0'*64}
        try {
            & ssh -- $SshTarget ("bash '$remoteDir/probe.sh' '$collectorID' '$collectorRemoteBinarySHA' '$collectorScriptSHA' '$collectorMode'") 2>&1 | ForEach-Object {$line=$_.ToString();Write-Host $line;$collectorWriter.WriteLine($line);$collectorWriter.Flush()}
            $collectorSSHExit=$LASTEXITCODE
            $collectorResult.ssh_exit=$collectorSSHExit
        } finally {$ErrorActionPreference=$collectorNativePreference}
        $collectorWriter.Dispose();$collectorWriter=$null
        $collectorResult.transcript_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $collectorLog).Hash.ToLowerInvariant()
        if($collectorSSHExit -ne 0){throw 'Remote collector validation failed; preserve partial receipt and inspect cleanup status'}
        $collectorRemoteOwned=$false
        $collectorResult.stage='transcript_review'
        $collectorReviewArgs=@((Join-Path $collectorSource 'scripts/system-backup-a-live-audit-mysql-review.mjs'))
        if($StartupOnly){$collectorReviewArgs+='--startup'}
        $collectorReviewArgs+=$collectorLog
        $collectorReviewRaw=@(& node @collectorReviewArgs)
        if($LASTEXITCODE -ne 0){throw 'Real MySQL transcript or audit linkage review rejected'}
        if((Get-FileHash -Algorithm SHA256 -LiteralPath $collectorLog).Hash.ToLowerInvariant() -cne $collectorResult.transcript_sha256){throw 'Remote transcript changed during review'}
        $collectorReview=($collectorReviewRaw -join "`n") | ConvertFrom-Json
        if($collectorReview.binary_sha256 -cne $collectorRemoteBinarySHA -or $collectorReview.namespace -cne $collectorID){throw 'Remote receipt differs from the locally pinned run/binary'}
        $collectorResult.remote_review=$collectorReview
        $collectorReviewRaw | ForEach-Object {Write-Host $_}
        $collectorResult.remote_cleanup_verified=$true
    }
    $collectorResult.source_stable=$false
    $collectorResult.stage='final_source_recheck'
    Assert-CollectorSnapshot
    $collectorResult.source_stable=$true
    if($Remote){
        $collectorResult.status='isolated_mysql_collector_passed'
        if($StartupOnly){$collectorResult.status='isolated_mysql_startup_passed'}
    }
    $collectorResult.stage='completed'
} catch {
    $collectorResult.failure_stage=$collectorResult.stage
    $collectorResult.status='failed'
    $collectorResult.source_stable=$false
    throw
} finally {
    if($collectorWriter){$collectorWriter.Dispose()}
    # Before remote test starts, only two upload files exist. The remote shell
    # owns namespace cleanup once it starts; an SSH disconnect is not proof of cleanup.
    if($collectorRemoteOwned -and -not $collectorResult.remote_started){
        $exit=Invoke-AEvidenceNative -FilePath 'ssh' -Arguments @('--',$SshTarget,("test ! -L '$remoteDir' && rm -f -- '$remoteDir/probe.test' '$remoteDir/probe.sh' && rmdir -- '$remoteDir'"))
        if($exit -ne 0){Write-Warning ('Remote upload cleanup unverified: '+$remoteDir)}
    }
    foreach($collectorName in $collectorVars){[Environment]::SetEnvironmentVariable($collectorName,$collectorPrior[$collectorName],'Process')}
    $resolved=[IO.Path]::GetFullPath($collectorOwned)
    if([IO.Path]::GetDirectoryName($resolved) -ne $collectorRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Test-Path -LiteralPath $resolved) -and ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint))){throw 'Unsafe collector cleanup'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
    $collectorResult.local_cleanup_verified=-not(Test-Path -LiteralPath $resolved)
    $collectorResult.completed_at=[DateTime]::UtcNow.ToString('o')
    $stream=[IO.File]::Open($collectorEvidence,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $writer=New-Object IO.StreamWriter($stream,(New-Object Text.UTF8Encoding($false)))
    try {$writer.WriteLine(($collectorResult|ConvertTo-Json -Depth 8))} finally {$writer.Dispose()}
    Write-Host ('Public receipt: '+$collectorEvidence)
    if(Test-Path -LiteralPath $collectorLog){Write-Host ('Remote transcript: '+$collectorLog)}
}
