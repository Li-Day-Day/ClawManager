[CmdletBinding()]
param([string]$CompilationCacheSeed)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskID=[Guid]::NewGuid().ToString('N')
$taskOwner=Join-Path $taskRoot ('.tmp-a-relay-message-'+$taskID)
$taskSource=Join-Path $taskOwner 'source'
$taskPrefix=Join-Path $taskRoot ('docs/evidence/a-relay-message-native-'+$taskID)
$taskReport=[ordered]@{kind='a_relay_message_native.v1';id=$taskID;status='running';tests_started=$false;dependencies_installed=$false;actual_sql=$false;production_authorized=$false;cleanup=$false;driver_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()}
$taskVars=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$taskSaved=@{};foreach($name in $taskVars){$taskSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
function Get-TaskPins([string]$root,[string[]]$paths){
    @($paths|ForEach-Object{$p=Join-Path $root $_;$item=Get-Item -LiteralPath $p;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected source rejected'};[ordered]@{path=$_;size=$item.Length;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}})
}
function Get-TaskFiles {
    $paths=@(& rg --files --hidden --glob '!**/.tmp-*/**' backend contracts scripts)
    if($LASTEXITCODE -ne 0){throw 'Source enumeration failed'}
    # Same existing fixture closure used by the D entry runner. Omitting these
    # makes old maintenance/registration tests fail before their assertions.
    $paths+=@('docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/system-backup-d-config-maintenance-082-proposal-20261015.sql','docs/system-backup-d-admin-read-index-candidate-20261012.sql','docs/system-backup-d-download-admission-schema-proposal-20261019.sql')
    @($paths|ForEach-Object {$_.Replace('\','/')}|Sort-Object -Unique -CaseSensitive)
}
function Run-TaskGo([string]$phase,[string[]]$goArgs){
    $taskReport.current_phase=$phase
    $taskReport|ConvertTo-Json -Depth 12|Set-Content -LiteralPath ($taskPrefix+'.running.json') -Encoding utf8
    & go @goArgs 2>&1 | Tee-Object -FilePath ($taskPrefix+'.'+$phase+'.jsonl') | Out-Null
    $taskReport[$phase+'_exit']=$LASTEXITCODE
    $taskReport|ConvertTo-Json -Depth 12|Set-Content -LiteralPath ($taskPrefix+'.running.json') -Encoding utf8
    if($LASTEXITCODE -ne 0){throw ('Go phase failed: '+$phase)}
    if($goArgs[0] -eq 'test' -and $goArgs -contains '-json'){
        $events=@(Get-Content -LiteralPath ($taskPrefix+'.'+$phase+'.jsonl')|Where-Object {$_ -match '^\{'}|ForEach-Object {$_|ConvertFrom-Json})
        if(@($events|Where-Object {$_.Action -eq 'fail' -or $_.Action -eq 'skip'}).Count){throw ('Unexpected fail/skip: '+$phase)}
        $taskReport[$phase+'_passed_roots']=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test -and $_.Test -notmatch '/'}|ForEach-Object {$_.Package+'::'+$_.Test})
        $taskReport[$phase+'_packages']=@($events|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}|ForEach-Object {$_.Package})
        if(-not $taskReport[$phase+'_packages'].Count){throw ('No package completion: '+$phase)}
    }
}
try{
    [IO.Directory]::CreateDirectory($taskSource)|Out-Null
    [IO.File]::WriteAllText((Join-Path $taskOwner 'owner.txt'),[IO.Path]::GetFileName($taskOwner))
    $paths=@(Get-TaskFiles)
    if($paths.Count -lt 100){throw 'Source enumeration failed'}
    $pins=Get-TaskPins $taskRoot $paths
    foreach($p in $paths){$target=Join-Path $taskSource $p;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;Copy-Item -LiteralPath (Join-Path $taskRoot $p) -Destination $target}
    $snapshot=Get-TaskPins $taskSource $paths
    if(($pins|ConvertTo-Json -Depth 4 -Compress) -cne ($snapshot|ConvertTo-Json -Depth 4 -Compress)){throw 'Copy changed source; no tests started'}
    $taskReport.files=$snapshot
    [IO.Directory]::CreateDirectory((Join-Path $taskOwner 'cache'))|Out-Null
    if($CompilationCacheSeed -and (Test-Path -LiteralPath $CompilationCacheSeed)){
        $seed=(Resolve-Path -LiteralPath $CompilationCacheSeed).Path
        if(-not $seed.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($seed) -ne 'cache'){throw 'Cache seed must be a workspace compiler cache'}
        if(@(Get-ChildItem -LiteralPath $seed -Recurse -Force|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Redirected cache rejected'}
        try { Get-ChildItem -LiteralPath $seed -Force|Copy-Item -Destination (Join-Path $taskOwner 'cache') -Recurse -Force;$taskReport.cache_seed='copied_read_only' } catch { $taskReport.cache_seed='cold_fallback' }
    }
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=2';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $taskOwner 'cache';$env:GOTMPDIR=Join-Path $taskOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $taskOwner 'telemetry';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    [IO.Directory]::CreateDirectory($env:GOTMPDIR)|Out-Null;[IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $telemetry=@(& go env -json GOTELEMETRY GOTELEMETRYDIR)|ConvertFrom-Json
    if($LASTEXITCODE -ne 0 -or $telemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -ne $env:TEST_TELEMETRY_DIR){throw 'Private telemetry unavailable'}
    Push-Location (Join-Path $taskSource 'backend')
    try{
        $taskReport.tests_started=$true
        Run-TaskGo 'native' @('test','-json','-count=1','-timeout=600s','-run','^TestRelayMessage','./internal/systembackupevidence')
        $env:GOOS='linux'
        $binary=Join-Path $taskOwner 'systembackupevidence.test'
        Run-TaskGo 'linux_evidence' @('test','-vet=off','-c','-o',$binary,'./internal/systembackupevidence')
        $header=[IO.File]::ReadAllBytes($binary)
        if($header.Length -lt 4 -or $header[0] -ne 127 -or $header[1] -ne 69 -or $header[2] -ne 76 -or $header[3] -ne 70){throw 'Linux test binary is not ELF'}
        $taskReport.linux_evidence_binary=@{size=$header.Length;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();executed=$false}
    }finally{Pop-Location}
    $after=Get-TaskPins $taskRoot $paths
    $byPath=@{};foreach($p in $after){$byPath[$p.path]=$p.sha256}
    $taskReport.changed_since_snapshot=@($pins|Where-Object {$byPath[$_.path] -cne $_.sha256}|ForEach-Object {$_.path})
    $taskReport.source_paths_changed=(@(Compare-Object $paths @(Get-TaskFiles)).Count -ne 0)
    $taskReport.source_unchanged=($taskReport.changed_since_snapshot.Count -eq 0 -and -not $taskReport.source_paths_changed)
    $taskReport.status='passed_for_exact_snapshot'
}catch{
    $taskReport.status='failed';$taskReport.failure=$_.Exception.Message
}finally{
    foreach($name in $taskVars){[Environment]::SetEnvironmentVariable($name,$taskSaved[$name],'Process')}
    # Delete only this invocation's exact, plain workspace owner, including all
    # test executables/caches/synthetic mounts. Keep raw logs and receipt.
    $absolute=[IO.Path]::GetFullPath($taskOwner)
    if([IO.Path]::GetDirectoryName($absolute) -cne $taskRoot -or [IO.Path]::GetFileName($absolute) -cne ('.tmp-a-relay-message-'+$taskID)){throw 'Cleanup boundary mismatch'}
    if(Test-Path -LiteralPath $absolute){
        if((Get-Item -LiteralPath $absolute).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner refused'}
        if([IO.File]::ReadAllText((Join-Path $absolute 'owner.txt')) -cne [IO.Path]::GetFileName($absolute)){throw 'Owner marker mismatch'}
        Remove-Item -LiteralPath $absolute -Recurse -Force
    }
    $taskReport.cleanup=(-not(Test-Path -LiteralPath $absolute))
    $taskReport|ConvertTo-Json -Depth 12|Set-Content -LiteralPath ($taskPrefix+'.json') -Encoding utf8
    Write-Output ($taskPrefix+'.json')
}
if($taskReport.status -ne 'passed_for_exact_snapshot' -or -not $taskReport.cleanup){exit 1}
