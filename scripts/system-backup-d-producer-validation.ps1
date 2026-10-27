[CmdletBinding()]
param([string]$TestPattern='.')
$ErrorActionPreference='Stop'
$producerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$producerScratch=Join-Path $producerRoot ('.tmp-d-producer-'+[guid]::NewGuid().ToString('N'))
$producerNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$producerSaved=@{}
foreach($name in $producerNames){$producerSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
    foreach($dir in @($producerScratch,(Join-Path $producerScratch 'cache'),(Join-Path $producerScratch 'tmp'),(Join-Path $producerScratch 'telemetry'))){[IO.Directory]::CreateDirectory($dir)|Out-Null}
    $env:TEST_TELEMETRY_DIR=Join-Path $producerScratch 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),"off`n",[Text.UTF8Encoding]::new($false))
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOFLAGS='-mod=readonly -p=2';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='2';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $producerScratch 'cache';$env:GOTMPDIR=Join-Path $producerScratch 'tmp'
    Push-Location (Join-Path $producerRoot 'backend')
    try {
        $producerGoOutput=& go test -count=1 -json -run $TestPattern ./internal/systembackupproducer
        $producerGoExit=$LASTEXITCODE
        if($producerGoExit -ne 0){
            # Preserve actionable diagnostics without burying them under every
            # successful subtest when a large JSON stream is output-truncated.
            foreach($line in $producerGoOutput){
                try {$event=$line|ConvertFrom-Json} catch {Write-Output $line;continue}
                if($event.Action -eq 'fail'){Write-Output ('FAIL '+$event.Test)}
                elseif($event.Action -eq 'build-output'){Write-Output $event.Output}
                elseif($event.Action -eq 'output' -and $event.Output -notmatch '^(=== RUN|--- PASS|    --- PASS)'){
                    if($event.Output -match 'FAIL|\.go:\d+|panic:|fatal error:|build failed'){Write-Output $event.Output}
                }
            }
            throw 'Producer tests failed; no dependencies installed'
        }
        $producerEvents=@($producerGoOutput|ForEach-Object {$_|ConvertFrom-Json})
        $producerPasses=@($producerEvents|Where-Object {$_.Action -eq 'pass' -and $_.Test})
        $producerTop=@($producerPasses|Where-Object {$_.Test -notmatch '/'})
        Write-Output ('PASS producer-go-top-level-tests='+$producerTop.Count+' named-tests-including-subtests='+$producerPasses.Count)
        $env:GOOS='linux'
        & go test -c -o (Join-Path $producerScratch 'producer-linux.test') ./internal/systembackupproducer
        if($LASTEXITCODE -ne 0){throw 'Linux producer test compilation failed'}
        Write-Output 'PASS producer-go-tests-and-vet=true linux-test-compile=true real-mysql=false'
    } finally {Pop-Location}
} finally {
    foreach($name in $producerNames){[Environment]::SetEnvironmentVariable($name,$producerSaved[$name],'Process')}
    if(Test-Path -LiteralPath $producerScratch){
        $producerResolved=(Resolve-Path -LiteralPath $producerScratch).Path
        if(-not $producerResolved.StartsWith($producerRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($producerResolved) -notmatch '^\.tmp-d-producer-[a-f0-9]{32}$'){throw 'Refusing cleanup outside producer scratch'}
        Remove-Item -LiteralPath $producerResolved -Recurse -Force
    }
    Write-Output ('CLEANED producer-build-cache='+(-not(Test-Path -LiteralPath $producerScratch)))
}
