[CmdletBinding()]
param(
    [switch]$Remote,
    [switch]$CheckRemote,
    [switch]$HistoryReview,
    [switch]$HistoryCLI,
    [switch]$BuildOnly,
    [ValidateRange(1,4)][int]$BuildParallelism=1,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget = 'root@10.130.14.23',
    [ValidatePattern('^[A-Za-z0-9@._:-]+$')][string]$KubeContext = 'kubernetes-admin@kubernetes',
    [ValidatePattern('^[a-z0-9][a-z0-9-]+$')][string]$SourceNamespace = 'clawmanager-zhanghui08-system',
    [ValidatePattern('^[a-z0-9][a-z0-9.-]+$')][string]$TestNode = 'node1',
    [ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedAppDigest = '1ba8cc47f468610e6875117f75fe42ce9fdb15e1cd2e6f877ac8ff2f99e2baa0'
)
$ErrorActionPreference = 'Stop'
# Check native exits explicitly, including when invoked by a caller with this enabled.
$PSNativeCommandUseErrorActionPreference = $false
if($BuildOnly -and -not $HistoryCLI){throw 'BuildOnly requires HistoryCLI; it skips local tests/vet, not remote acceptance'}
if($HistoryCLI){$HistoryReview=$true}
if($HistoryReview -and -not $PSBoundParameters.ContainsKey('ExpectedAppDigest')){
    $ExpectedAppDigest='d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e'
}
$probeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$probePrefix = $probeRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$probeID = [guid]::NewGuid().ToString('N')
$probeScratch = Join-Path $probeRoot ('.tmp-d-invariants-' + $probeID)
$probeRemote = '/tmp/clawmanager-d-invariants-' + $probeID
$probeVariables = @('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$probePrevious = @{}
foreach ($name in $probeVariables) { $probePrevious[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$probeRemoteAttempted = $false
$probeRemoteCleanupFailed = $false
function Invoke-ProbeSshCommand {
    param([string]$Command)
    # Password input remains with OpenSSH's terminal; retain diagnostic text to
    # distinguish a closed connection from authentication/remote-command errors.
    $sshDiagnostics=[Collections.Generic.List[string]]::new()
    $sshLines=@(& $probeSsh @probeSshOptions $SshTarget $Command 2>&1 | ForEach-Object {
        if($_ -is [Management.Automation.ErrorRecord]){
            $sshDiagnostics.Add([string]$_)
            [Console]::Error.WriteLine([string]$_)
        } else {$_}
    })
    $sshExit=$LASTEXITCODE
    return @{ ExitCode=$sshExit; Lines=$sshLines; Diagnostics=$sshDiagnostics.ToArray() }
}
function Initialize-ProbeRemoteScratch {
    $createdMarker="D_PROBE_SCRATCH_READY_$probeID"
    # Reconcile an earlier lost response without overwriting an existing owner.
    # A mkdir interrupted before writing .owner requires manual inspection.
    $createCommand="set -eu; umask 077; test '$probeRemote' = '/tmp/clawmanager-d-invariants-$probeID' || exit 73; test ! -L '$probeRemote' || exit 73; if test ! -e '$probeRemote'; then mkdir '$probeRemote' || exit 73; printf '%s\n' '$probeID' > '$probeRemote/.owner' || exit 73; fi; test -d '$probeRemote' || exit 73; test ! -L '$probeRemote/.owner' || exit 73; test -f '$probeRemote/.owner' || exit 73; printf '%s\n' '$probeID' | cmp -s - '$probeRemote/.owner' || exit 73; printf '%s\n' '$createdMarker'"
    for($attempt=1;$attempt -le 3;$attempt++){
        Write-Output "D_PROBE_REMOTE_CREATE attempt=$attempt/3 build-started=false"
        $created=Invoke-ProbeSshCommand $createCommand
        if($created.ExitCode -eq 0 -and @($created.Lines | Where-Object {$_ -ceq $createdMarker}).Count -eq 1){return}
        $closed=@($created.Diagnostics | Where-Object {$_ -match '^Connection closed by [A-Za-z0-9.: -]+ port [0-9]+\s*$'}).Count -gt 0
        $authenticationError=@($created.Diagnostics | Where-Object {$_ -match '(?i)permission denied|authentication failed|host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED'}).Count -gt 0
        if($created.ExitCode -ne 255 -or -not $closed -or $authenticationError -or $attempt -eq 3){
            throw "Remote scratch creation unconfirmed (exit=$($created.ExitCode), attempts=$attempt); build/upload/test not started; checking owned scratch cleanup"
        }
        Write-Output 'D_PROBE_REMOTE_RETRY stage=scratch-create reason=connection-closed same-owner=true password-in-terminal=true'
        Start-Sleep -Seconds (2*$attempt)
    }
}
function Get-HistoryCLISourceHash {
    $sourceLines=@(Get-ChildItem -LiteralPath (Join-Path $probeRoot 'backend') -Recurse -File |
        Where-Object { $_.Extension -in @('.go','.sql') -or $_.Name -in @('go.mod','go.sum') } |
        Sort-Object FullName | ForEach-Object {
            $_.FullName.Substring($probeRoot.Length+1).Replace('\','/')+' '+(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        })
    $sourceSHA=[Security.Cryptography.SHA256]::Create()
    try {return ([BitConverter]::ToString($sourceSHA.ComputeHash([Text.Encoding]::UTF8.GetBytes(($sourceLines -join "`n")+"`n")))).Replace('-','').ToLowerInvariant()}
    finally {$sourceSHA.Dispose()}
}
function Invoke-ProbeGoBuild {
    param([string]$Stage,[string[]]$GoArguments)
    # Retry only the observed Windows tool sharing violation. Keep this run's
    # cache between attempts; syntax/dependency errors never enter this path.
    $sharingPattern='(?i)(?:^|[\\/])(?:asm|compile|link)\.exe: exit status 0xc0000043\s*$'
    for($attempt=1;$attempt -le 3;$attempt++){
        Write-Output "D_PROBE_BUILD_ATTEMPT stage=$Stage attempt=$attempt/3"
        $buildLines=[Collections.Generic.List[string]]::new()
        # PowerShell 7's optional native-error preference must not throw before
        # we can inspect the exit code. This setting is local to this function.
        $PSNativeCommandUseErrorActionPreference=$false
        & go.exe @GoArguments 2>&1 | ForEach-Object {
            $line=[string]$_
            $buildLines.Add($line)
            Write-Output $line
        }
        $buildExit=$LASTEXITCODE
        if($buildExit -eq 0){return}
        $diagnostics=@($buildLines | Where-Object {$_ -notmatch '^\s*$|^# \S+(?: \[\S+\])?\s*$|^FAIL(?:\s|$)'})
        $sharingOnly=$diagnostics.Count -gt 0 -and @($diagnostics | Where-Object {$_ -notmatch $sharingPattern}).Count -eq 0
        if(-not $sharingOnly -or $attempt -eq 3){throw "Linux $Stage build failed after $attempt attempt(s); no dependencies downloaded; remote not started"}
        if($HistoryCLI -and (Get-HistoryCLISourceHash) -ne $historySourceHash){throw 'Backend source changed after compiler failure; retry refused'}
        $delay=2*$attempt
        Write-Output "D_PROBE_BUILD_RETRY stage=$Stage reason=windows-sharing-violation delay_seconds=$delay cache=retained"
        Start-Sleep -Seconds $delay
    }
}
function Invoke-ProbeGoVet {
    param([string]$Stage,[string[]]$GoArguments)
    $sharingPattern='(?i)(?:^|[\\/])vet\.exe: exit status 0xc0000043\s*$'
    for($attempt=1;$attempt -le 3;$attempt++){
        Write-Output "D_PROBE_VET_ATTEMPT stage=$Stage attempt=$attempt/3"
        $vetLines=[Collections.Generic.List[string]]::new()
        $PSNativeCommandUseErrorActionPreference=$false
        & go.exe vet @GoArguments 2>&1 | ForEach-Object {
            $line=[string]$_
            $vetLines.Add($line)
            Write-Output $line
        }
        if($LASTEXITCODE -eq 0){return}
        $diagnostics=@($vetLines | Where-Object {$_ -notmatch '^\s*$|^# \S+(?: \[\S+\])?\s*$|^FAIL(?:\s|$)'})
        $sharingOnly=$diagnostics.Count -gt 0 -and @($diagnostics | Where-Object {$_ -notmatch $sharingPattern}).Count -eq 0
        if(-not $sharingOnly -or $attempt -eq 3){throw "D $Stage vet failed after $attempt attempt(s); remote MySQL test not started; no dependencies downloaded"}
        if($HistoryCLI -and (Get-HistoryCLISourceHash) -ne $historySourceHash){throw 'Backend source changed after vet failure; retry refused'}
        $delay=2*$attempt
        Write-Output "D_PROBE_VET_RETRY stage=$Stage reason=windows-sharing-violation delay_seconds=$delay cache=retained"
        Start-Sleep -Seconds $delay
    }
}
try {
    if($Remote -or $CheckRemote){
        $probeSsh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
        $probeScp = Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
        if (-not (Test-Path -LiteralPath $probeSsh) -or ($Remote -and -not (Test-Path -LiteralPath $probeScp))) { throw 'Existing Windows OpenSSH tools are required' }
        $probeSshOptions = @('-T','-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','NumberOfPasswordPrompts=1','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
        if($PSBoundParameters.ContainsKey('Verbose') -and $PSBoundParameters['Verbose']){$probeSshOptions=@('-v')+$probeSshOptions}
        Write-Output "D_PROBE_SSH_PREFLIGHT target=$SshTarget build-started=false remote-files=none"
        $preflightMarker="D_PROBE_SSH_READY_$probeID"
        $preflight=Invoke-ProbeSshCommand "printf '%s\n' '$preflightMarker'"
        if($preflight.ExitCode -ne 0 -or @($preflight.Lines | Where-Object {$_ -ceq $preflightMarker}).Count -ne 1){
            throw "SSH command preflight failed (exit=$($preflight.ExitCode)); no build/upload/remote test started. Connection closed alone does not identify an authentication or server-session cause."
        }
        Write-Output 'D_PROBE_SSH_PREFLIGHT_PASS command-execution=yes real_mysql=not_run'
        if(-not $HistoryReview){
            $imageQuery="kubectl --context='$KubeContext' --namespace='$SourceNamespace' get pods -l app=clawmanager-app -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'"
            $sourceImage=Invoke-ProbeSshCommand $imageQuery
            if($sourceImage.ExitCode -ne 0 -or @($sourceImage.Lines).Count -ne 1){throw 'Source app image identity is unavailable; build/upload/remote test not started'}
            $sourceImageID=([string]$sourceImage.Lines[0]).Trim()
            $sourceImageRef=$sourceImageID -creplace '^[A-Za-z0-9._+-]+://',''
            if($sourceImageRef -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:([0-9a-f]{64})$'){
                throw "Source app imageID is not an immutable repository reference: $sourceImageID; build/upload/remote test not started"
            }
            $sourceDigest=$Matches[1]
            if($sourceDigest -cne $ExpectedAppDigest){
                throw "Source app digest is $sourceDigest, expected $ExpectedAppDigest. Rerun with -ExpectedAppDigest $sourceDigest after reviewing the image; build/upload/remote test not started"
            }
            Write-Output "D_PROBE_IMAGE_PREFLIGHT_PASS digest=$sourceDigest"
        }
        if($CheckRemote){return}
        # Establish transport scratch before the expensive local build. This is
        # the only remote operation that can retry; never replay the MySQL test.
        Write-Output "D_PROBE_REMOTE_SCRATCH path=$probeRemote owner=$probeID"
        $probeRemoteAttempted = $true
        Initialize-ProbeRemoteScratch
    }
    foreach ($tool in @('go.exe','tar.exe','node.exe')) { Get-Command $tool -ErrorAction Stop | Out-Null }
    New-Item -ItemType Directory -Path $probeScratch | Out-Null
    foreach ($folder in @('cache','tmp','bundle','telemetry')) { New-Item -ItemType Directory -Path (Join-Path $probeScratch $folder) | Out-Null }
    $env:GO111MODULE='on'; $env:GOWORK='off'; $env:GOFLAGS="-mod=readonly -p=$BuildParallelism"
    $env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOTELEMETRY='off'
    $env:CGO_ENABLED='0'; $env:GOOS='windows'; $env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $probeScratch 'cache'; $env:GOTMPDIR=Join-Path $probeScratch 'tmp'
    $env:TEST_TELEMETRY_DIR=Join-Path $probeScratch 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    Write-Output "D_PROBE_LOCAL_BUILD parallelism=$BuildParallelism dependency-download=false remote-started=false"
    if($HistoryCLI){$historySourceHash=Get-HistoryCLISourceHash}
    Push-Location (Join-Path $probeRoot 'backend')
    try {
        if($BuildOnly){
            Write-Output 'D_PROBE_LOCAL_CHECKS unit-tests=skipped vet=skipped reason=explicit-build-only'
        } else {
        & go.exe test -vet=off -count=1 ./internal/db ./internal/migrationcoord ./internal/systembackupcontroller ./internal/migrationcatalog
        if ($LASTEXITCODE -ne 0) { throw 'D local test/build failed; remote MySQL test not started. Retain the compiler error; dependencies will not be downloaded.' }
        if($HistoryCLI){
            & go.exe test -vet=off -tags systembackup_integration -run '^TestDHistoryFaultProxy$' -count=1 -timeout=60s ./internal/db
            if($LASTEXITCODE -ne 0){throw 'History CLI local fault proxy tests failed; remote MySQL test not started'}
            & go.exe test -vet=off -count=1 -timeout=60s ./cmd/system-backup-migrate
            if($LASTEXITCODE -ne 0){throw 'History CLI subprocess tests failed; remote MySQL test not started'}
        }
        Write-Output 'D_PROBE_VET serial=true'
        Invoke-ProbeGoVet -Stage 'serial' -GoArguments @('./internal/db','./internal/migrationcoord','./internal/systembackupcontroller','./internal/migrationcatalog')
        if($HistoryCLI){
            Invoke-ProbeGoVet -Stage 'history-cli-integration' -GoArguments @('-tags','systembackup_integration','./internal/db','./cmd/system-backup-migrate')
        }
        }
        $env:GOOS='linux'
        $probeBinary = Join-Path $probeScratch 'bundle/d-invariants.test'
        Write-Output 'D_PROBE_BUILD linux-integration=true'
        $probeBuildFlags=@('-c')
        if($BuildOnly){$probeBuildFlags+='-vet=off'}
        if($HistoryCLI){$probeBuildFlags+='-trimpath'}
        Invoke-ProbeGoBuild -Stage 'integration-probe' -GoArguments (@('test')+$probeBuildFlags+@('-tags','systembackup_integration','-o',$probeBinary,'./internal/db'))
        if($HistoryCLI){
            Write-Output 'D_PROBE_BUILD linux-history-cli=true'
            $historyCLIBinary=Join-Path $probeScratch 'bundle/d-history-migrate'
            Invoke-ProbeGoBuild -Stage 'history-cli' -GoArguments @('build','-trimpath','-o',$historyCLIBinary,'./cmd/system-backup-migrate')
            $historyCLIHash=(Get-FileHash -LiteralPath $historyCLIBinary -Algorithm SHA256).Hash.ToLowerInvariant()
            Write-Output "HISTORY_CLI_BINARY_SHA256=$historyCLIHash"
        }
    } finally { Pop-Location }
    if($HistoryCLI){
        if((Get-HistoryCLISourceHash) -ne $historySourceHash){throw 'Backend source changed during CLI/probe build; remote execution refused'}
        Write-Output "HISTORY_CLI_SOURCE_SHA256=$historySourceHash"
    }
    $probeBinaryHash = (Get-FileHash -LiteralPath $probeBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    $localChecks=if($BuildOnly){'skipped'}else{'yes'}
    Write-Output "LOCAL_PASS unit-tests=$localChecks vet=$localChecks linux-probe-compiled=yes binary_sha256=$probeBinaryHash real_mysql=not_run"
    if ($Remote) {
        $probeBundle = Join-Path $probeScratch 'bundle'
        $probeFiles = @('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','backend/internal/systembackupcontroller/bootstrap.go')
        if($HistoryCLI){$probeFiles += @('scripts/system-backup-d-history-cli-phase.sh','scripts/system-backup-d-migration-phase.sh')}
        $probeFiles += @(Get-ChildItem -LiteralPath (Join-Path $probeRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | ForEach-Object { 'backend/internal/db/migrations/' + $_.Name })
        # Normalize text before transport: Windows CRLF cannot enter bash here.
        $probeUTF8 = New-Object System.Text.UTF8Encoding($false)
        foreach ($file in $probeFiles) {
            $destination = Join-Path $probeBundle $file
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            $content = [IO.File]::ReadAllText((Join-Path $probeRoot $file)).Replace("`r`n","`n")
            [IO.File]::WriteAllText($destination,$content,$probeUTF8)
        }
        if($HistoryCLI -and (Get-HistoryCLISourceHash) -ne $historySourceHash){throw 'Backend source changed before bundle completion; remote execution refused'}
        $probeArchive = Join-Path $probeScratch 'bundle.tar'
        & tar.exe -cf $probeArchive -C $probeBundle .
        if ($LASTEXITCODE -ne 0) { throw 'Probe bundle creation failed' }
        $probeArchiveHash = (Get-FileHash -LiteralPath $probeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        # scp uses -T for a different purpose; only SSH command sessions need it.
        $probeScpOptions=@($probeSshOptions | Where-Object {$_ -ne '-T'})
        & $probeScp @probeScpOptions $probeArchive "${SshTarget}:$probeRemote/bundle.tar"
        if ($LASTEXITCODE -ne 0) { throw 'Probe upload failed' }
        $probeCommand = "set -eu; cd '$probeRemote'; echo '$probeArchiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; KUBE_CONTEXT='$KubeContext' SOURCE_NAMESPACE='$SourceNamespace' TEST_NODE='$TestNode' EXPECTED_APP_DIGEST='$ExpectedAppDigest' D_DB_INVARIANT_SMOKE=1 D_INVARIANT_BINARY='$probeRemote/d-invariants.test' D_INVARIANT_BINARY_SHA256='$probeBinaryHash' bash scripts/system-backup-fresh-migration-smoke.sh"
        if($HistoryReview){
            $probeCommand = "set -eu; cd '$probeRemote'; echo '$probeArchiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; KUBE_CONTEXT='$KubeContext' SOURCE_NAMESPACE='$SourceNamespace' TEST_NODE='$TestNode' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:$ExpectedAppDigest' EXPECTED_APP_DIGEST='$ExpectedAppDigest' D_HISTORY_REVIEW_SMOKE=1 D_DB_INVARIANT_SMOKE=1 D_INVARIANT_BINARY='$probeRemote/d-invariants.test' D_INVARIANT_BINARY_SHA256='$probeBinaryHash' bash scripts/system-backup-fresh-migration-smoke.sh"
        }
        if($HistoryCLI){
            $probeCommand=$probeCommand.Replace('D_HISTORY_REVIEW_SMOKE=1 ',"D_HISTORY_CLI_SMOKE=1 D_HISTORY_CLI_BINARY='$probeRemote/d-history-migrate' D_HISTORY_CLI_SHA256='$historyCLIHash' D_HISTORY_REVIEW_SMOKE=1 ")
        }
        & $probeSsh @probeSshOptions $SshTarget $probeCommand
        if ($LASTEXITCODE -ne 0) { throw 'Remote D invariant smoke failed; retain the terminal error and any CLEANUP_PENDING identity' }
    }
} finally {
    foreach ($name in $probeVariables) { [Environment]::SetEnvironmentVariable($name,$probePrevious[$name],'Process') }
    if ($probeRemoteAttempted) {
        # Lost mkdir responses still need reconciliation. Never remove a path
        # without this run's ownership marker; absence is already clean.
        $cleanedMarker="D_PROBE_SCRATCH_CLEAN_$probeID"
        try {
            $cleanup=Invoke-ProbeSshCommand "set -eu; test '$probeRemote' = '/tmp/clawmanager-d-invariants-$probeID'; test ! -L '$probeRemote'; if test -e '$probeRemote'; then test -d '$probeRemote'; test ! -L '$probeRemote/.owner'; test -f '$probeRemote/.owner'; printf '%s\n' '$probeID' | cmp -s - '$probeRemote/.owner'; rm -rf -- '$probeRemote'; fi; test ! -e '$probeRemote'; printf '%s\n' '$cleanedMarker'"
            if($cleanup.ExitCode -ne 0 -or @($cleanup.Lines | Where-Object {$_ -ceq $cleanedMarker}).Count -ne 1){$probeRemoteCleanupFailed=$true}
        } catch {$probeRemoteCleanupFailed=$true}
        if ($probeRemoteCleanupFailed) { Write-Warning "CLEANUP_PENDING remote-probe-scratch=$probeRemote owner=$probeID; absence/ownership/removal unverified" }
        else { Write-Output 'CLEANED remote-probe-scratch=yes' }
    }
    if (Test-Path -LiteralPath $probeScratch) {
        $resolvedProbeScratch=(Resolve-Path -LiteralPath $probeScratch).Path
        if (-not $resolvedProbeScratch.StartsWith($probePrefix,[StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($resolvedProbeScratch) -notmatch '^\.tmp-d-invariants-[0-9a-f]{32}$') { throw 'Refusing cleanup outside owned probe scratch' }
        Remove-Item -LiteralPath $resolvedProbeScratch -Recurse -Force
    }
    Write-Output ('CLEANED local-probe-build-cache=' + (-not (Test-Path -LiteralPath $probeScratch)))
    if ($probeRemoteCleanupFailed) { throw 'Remote probe scratch cleanup is unverified; this run is incomplete' }
}
