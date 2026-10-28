$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskID='e1659ffde3e4406a81979396272bcf16'
$taskOwner=Join-Path $taskRoot ('.tmp-a-relay-peer-'+$taskID)
$taskPrefix=Join-Path $taskRoot ('docs/evidence/a-relay-peer-recovery-'+$taskID)
$taskReport=[ordered]@{kind='a_relay_peer_interrupted_round_recovery.v1';status='running';original_terminal_available=$false;original_process_exit_known=$false;dependencies_installed=$false;actual_SQL=$false;production_approved=$false;cleanup=$false}
$taskVars=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$taskSaved=@{};foreach($name in $taskVars){$taskSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
    if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($taskOwner)) -cne $taskRoot -or [IO.File]::ReadAllText((Join-Path $taskOwner 'owner.txt')) -cne ('.tmp-a-relay-peer-'+$taskID)){throw 'Owner boundary mismatch'}
    if((Get-Item -LiteralPath $taskOwner).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
    $taskNative=Join-Path $taskRoot ('docs/evidence/a-relay-peer-native-'+$taskID+'.native.jsonl')
    $events=@(Get-Content -LiteralPath $taskNative|ForEach-Object{$_|ConvertFrom-Json})
    if(@($events|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -or @($events|Where-Object {$_.Action -eq 'pass' -and -not $_.Test -and $_.Package -eq 'clawreef/internal/systembackupevidence'}).Count -ne 1){throw 'Native log incomplete'}
    $runs=@($events|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object Test|Sort-Object)
    $passed=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object Test|Sort-Object)
    if(($runs|ConvertTo-Json -Compress) -cne ($passed|ConvertTo-Json -Compress)){throw 'Native run/pass mismatch'}
    $taskReport.native_observed_roots=@($passed|Where-Object {$_ -notmatch '/'}).Count
    $taskReport.native_observed_passes=$passed.Count
    $taskReport.native_log_sha256=(Get-FileHash -LiteralPath $taskNative -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskSource=Join-Path $taskOwner 'source'
    $taskFiles=@(& rg --files --hidden $taskSource)
    if($LASTEXITCODE -ne 0){throw 'Snapshot enumeration failed'}
    $taskReport.frozen_files=@($taskFiles|ForEach-Object {[ordered]@{path=[IO.Path]::GetRelativePath($taskSource,$_).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})
    foreach($name in @('relay_peer.go','relay_peer_test.go')){
        $relative='backend/internal/systembackupevidence/'+$name
        if((Get-FileHash -LiteralPath (Join-Path $taskRoot $relative)).Hash -cne (Get-FileHash -LiteralPath (Join-Path $taskSource $relative)).Hash){throw 'A source differs from tested snapshot'}
    }
    $taskReport.current_A_matches_snapshot=$true
    $env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=2';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $taskOwner 'cache';$env:GOTMPDIR=Join-Path $taskOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $taskOwner 'telemetry';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    $binary=Join-Path $taskOwner 'recovered-evidence.test'
    Push-Location (Join-Path $taskSource 'backend')
    try { & go test -vet=off -c -o $binary ./internal/systembackupevidence 2>&1 | Tee-Object -FilePath ($taskPrefix+'.linux.log')|Out-Null; $taskReport.linux_exit=$LASTEXITCODE; if($LASTEXITCODE -ne 0){throw 'Linux compile failed'} } finally {Pop-Location}
    $bytes=[IO.File]::ReadAllBytes($binary)
    if($bytes.Length -lt 4 -or $bytes[0] -ne 127 -or $bytes[1] -ne 69 -or $bytes[2] -ne 76 -or $bytes[3] -ne 70){throw 'ELF required'}
    $taskReport.linux_binary=@{size=$bytes.Length;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();executed=$false}
    foreach($pin in $taskReport.frozen_files){if((Get-FileHash -LiteralPath (Join-Path $taskSource $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Frozen input changed'}}
    $taskReport.frozen_source_postcheck=$true
    $taskReport.status='native_log_complete_linux_compiled'
} catch { $taskReport.status='failed';$taskReport.failure=$_.Exception.Message }
finally {
    foreach($name in $taskVars){[Environment]::SetEnvironmentVariable($name,$taskSaved[$name],'Process')}
    $absolute=[IO.Path]::GetFullPath($taskOwner)
    if([IO.Path]::GetDirectoryName($absolute) -cne $taskRoot -or [IO.Path]::GetFileName($absolute) -cne ('.tmp-a-relay-peer-'+$taskID)){throw 'Cleanup boundary mismatch'}
    if(Test-Path -LiteralPath $absolute){
        if((Get-Item -LiteralPath $absolute).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
        if([IO.File]::ReadAllText((Join-Path $absolute 'owner.txt')) -cne ('.tmp-a-relay-peer-'+$taskID)){throw 'Owner marker mismatch'}
        Remove-Item -LiteralPath $absolute -Recurse -Force
    }
    $taskReport.cleanup=(-not(Test-Path -LiteralPath $absolute))
    $taskReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($taskPrefix+'.json') -Encoding utf8
    Write-Output ($taskPrefix+'.json')
}
if($taskReport.status -ne 'native_log_complete_linux_compiled' -or -not $taskReport.cleanup){exit 1}
