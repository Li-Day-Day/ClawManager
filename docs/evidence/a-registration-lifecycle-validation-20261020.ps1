[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run,
    [ValidatePattern('^\.tmp-d-index-cache-[a-f0-9]{32}$')][string]$SeedOwnerName='',
    [int]$PredecessorPID=0
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefix=Join-Path $PSScriptRoot ('a-registration-lifecycle-'+$Run)
$owner=Join-Path $root ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $owner 'source'
$names=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS');$saved=@{}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
foreach($suffix in @('-native.txt','-source.json','-packages.jsonl','-packages-stderr.txt','-linux-build.txt','-linux-build-stderr.txt')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing lifecycle evidence'}}
Start-Transcript -LiteralPath ($prefix+'-native.txt') -NoClobber | Out-Null
try {
    foreach($dir in @($owner,(Join-Path $owner 'cache'),(Join-Path $owner 'tmp'),(Join-Path $owner 'telemetry'))){[IO.Directory]::CreateDirectory($dir)|Out-Null}
    [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
    Write-Output ('LOCAL_OWNER registration-lifecycle='+$owner)
    $cache=Join-Path $owner 'cache'
    if($SeedOwnerName -and $PredecessorPID -gt 0){
        $seedOwner=Join-Path $root $SeedOwnerName
        $prior=Get-Process -Id $PredecessorPID -ErrorAction SilentlyContinue
        if($prior -and $prior.ProcessName -in @('pwsh','powershell') -and (Test-Path -LiteralPath $seedOwner)){
            $resolved=(Resolve-Path -LiteralPath $seedOwner).Path
            if([IO.Path]::GetDirectoryName($resolved) -ne $root -or ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne $SeedOwnerName){throw 'Refusing unowned cache seed'}
            $seedCache=Join-Path $resolved 'cache'
            if((Get-Item -LiteralPath $seedCache -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected seed cache'}
            $null=$prior.Handle # retain this process instance, never follow PID reuse
            $copied=0;$skipped=0
            Write-Output ('WAIT predecessor_pid='+$PredecessorPID+' seed_source_read_only='+$SeedOwnerName+' tests_started=no')
            do {
                foreach($item in @(Get-ChildItem -LiteralPath $seedCache -File -Recurse -ErrorAction SilentlyContinue)){
                    if($item.Name -notmatch '^[a-f0-9]{64}-[ad]$' -or $item.Directory.Name -notmatch '^[a-f0-9]{2}$' -or $item.Directory.Parent.FullName -ne $seedCache -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($item.Directory.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
                    $bucket=Join-Path $cache $item.Directory.Name
                    $target=Join-Path $bucket $item.Name
                    if(Test-Path -LiteralPath $target){continue}
                    [IO.Directory]::CreateDirectory($bucket)|Out-Null
                    $inputStream=$null;$outputStream=$null
                    try {
                        # Shared read never locks the predecessor's cache writer.
                        $inputStream=[IO.File]::Open($item.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
                        $outputStream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                        $inputStream.CopyTo($outputStream);$copied++
                    } catch {
                        $skipped++
                        if($outputStream){$outputStream.Dispose();$outputStream=$null}
                        if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force}
                    } finally {if($inputStream){$inputStream.Dispose()};if($outputStream){$outputStream.Dispose()}}
                }
            } while(-not $prior.WaitForExit(10000))
            $prior.Dispose()
            Write-Output ('SEED_COMPLETE entries='+$copied+' unavailable_entries='+$skipped+' predecessor_terminal=yes source_mutated=no test_result_reuse=no')
        }
    }
    . (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
    $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
    $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8
    Write-Output ('LOCAL_SOURCE sha256='+$manifest.source_sha256+' files='+$manifest.files.Count)
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64';$env:GOCACHE=$cache;$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    Push-Location (Join-Path $source 'backend')
    try {
        Write-Output 'START registration-lifecycle default-vet=yes dependencies-installed=no'
        & 'C:/Program Files/Go/bin/go.exe' test -json -count=1 -timeout=120s ./cmd/system-backup-registration 1>($prefix+'-packages.jsonl') 2>($prefix+'-packages-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Registration HTTPS lifecycle gate failed'}
        $env:GOOS='linux'
        & 'C:/Program Files/Go/bin/go.exe' build -o (Join-Path $owner 'registration') ./cmd/system-backup-registration 1>($prefix+'-linux-build.txt') 2>($prefix+'-linux-build-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Linux registration lifecycle build failed'}
        Write-Output ('PASS registration-lifecycle-linux-build sha256='+(Get-FileHash -LiteralPath (Join-Path $owner 'registration') -Algorithm SHA256).Hash.ToLowerInvariant())
    } finally {Pop-Location}
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    Write-Output 'LOCAL_PASS registration-lifecycle-frozen-postcheck=yes default-vet=yes dependencies-installed=no'
} finally {
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    if(Test-Path -LiteralPath $owner){$resolved=(Resolve-Path -LiteralPath $owner).Path;if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne [IO.Path]::GetFileName($resolved)){throw 'Refusing unowned lifecycle cleanup'};Remove-Item -LiteralPath $resolved -Recurse -Force}
    Write-Output ('CLEANED registration-lifecycle-source-cache-binary='+(-not(Test-Path -LiteralPath $owner)))
    Stop-Transcript|Out-Null
}
