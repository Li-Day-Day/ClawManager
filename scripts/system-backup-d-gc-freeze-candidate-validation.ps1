[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$freezeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$freezeToken=[guid]::NewGuid().ToString('N')
$freezeOwner=Join-Path $freezeRoot ('.tmp-d-freeze-protocol-'+$freezeToken)
$freezePrefix=Join-Path $freezeRoot ('docs/evidence/d-gc-freeze-protocol-'+$freezeToken)
$freezePaths=@('backend/internal/systembackupevidence/download_retention_gc_freeze.go','backend/internal/systembackupevidence/download_retention_gc_freeze_test.go','backend/internal/systembackupevidence/download_retention_gc_freeze_a_test.go','backend/internal/systembackupevidence/download_retention_gc_finalize.go','backend/internal/systembackupevidence/download_retention_gc_finalize_test.go','scripts/system-backup-d-gc-freeze-candidate-validation.ps1')
$freezeNames=@('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOPATH','GOMAXPROCS','TEST_TELEMETRY_DIR')
$freezeSaved=@{};foreach($freezeName in $freezeNames){$freezeSaved[$freezeName]=[Environment]::GetEnvironmentVariable($freezeName,'Process')}
$freezeFailure=$null;$freezeInputs=@();$freezeExit=$null;$freezeBuildExit=$null;$freezeStable=$false
try {
    if(Test-Path -LiteralPath $freezeOwner){throw 'Freeze protocol owner exists'}
    [IO.Directory]::CreateDirectory($freezeOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $freezeOwner '.owner'),$freezeToken)
    foreach($freezeDirectory in @('source','cache','tmp','gopath','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $freezeOwner $freezeDirectory))|Out-Null}
    foreach($freezePath in $freezePaths){
        $freezeBytes=[IO.File]::ReadAllBytes((Join-Path $freezeRoot $freezePath));$freezeHash=(Get-FileHash -LiteralPath (Join-Path $freezeRoot $freezePath) -Algorithm SHA256).Hash.ToLowerInvariant()
        $freezeInputs+=@([ordered]@{path=$freezePath;sha256=$freezeHash;bytes_base64=[Convert]::ToBase64String($freezeBytes)})
        $freezeTarget=Join-Path $freezeOwner ('source/'+[IO.Path]::GetFileName($freezePath));[IO.File]::WriteAllBytes($freezeTarget,$freezeBytes)
        if((Get-FileHash -LiteralPath $freezeTarget -Algorithm SHA256).Hash.ToLowerInvariant() -cne $freezeHash){throw 'Freeze source changed while copying'}
    }
    [IO.File]::WriteAllText(($freezePrefix+'-source.json'),($freezeInputs|ConvertTo-Json -Depth 5))
    $env:GO111MODULE='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $freezeOwner 'cache';$env:GOTMPDIR=Join-Path $freezeOwner 'tmp';$env:GOPATH=Join-Path $freezeOwner 'gopath';$env:TEST_TELEMETRY_DIR=Join-Path $freezeOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location (Join-Path $freezeOwner 'source')
    try {
        & go test -json -count=1 -timeout=90s -p 2 . 2>&1 | Tee-Object -FilePath ($freezePrefix+'.jsonl');$freezeExit=$LASTEXITCODE
        if($freezeExit -ne 0){throw 'Freeze protocol unit tests failed'}
        $env:GOOS='linux'; & go test -c -o (Join-Path $freezeOwner 'freeze-protocol.test') .;$freezeBuildExit=$LASTEXITCODE
        if($freezeBuildExit -ne 0){throw 'Freeze protocol Linux build failed'}
    } finally {Pop-Location}
    foreach($freezeInput in $freezeInputs){
        if((Get-FileHash -LiteralPath (Join-Path $freezeRoot $freezeInput.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $freezeInput.sha256 -or (Get-FileHash -LiteralPath (Join-Path $freezeOwner ('source/'+[IO.Path]::GetFileName($freezeInput.path))) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $freezeInput.sha256){throw 'Freeze protocol inputs drifted'}
    }
    $freezeStable=$true
} catch {$freezeFailure=$_.Exception.Message} finally {
    foreach($freezeName in $freezeNames){[Environment]::SetEnvironmentVariable($freezeName,$freezeSaved[$freezeName],'Process')}
    if(Test-Path -LiteralPath $freezeOwner){
        $freezeResolved=(Resolve-Path -LiteralPath $freezeOwner).Path
        if([IO.Path]::GetDirectoryName($freezeResolved) -cne $freezeRoot -or [IO.Path]::GetFileName($freezeResolved) -cne ('.tmp-d-freeze-protocol-'+$freezeToken) -or ((Get-Item -Force -LiteralPath $freezeResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $freezeResolved '.owner')) -cne $freezeToken){throw 'Refusing freeze protocol cleanup outside exact owner'}
        Remove-Item -LiteralPath $freezeResolved -Recurse -Force
    }
    $freezeResult=[ordered]@{kind='d_gc_freeze_protocol_candidate_validation.v1';exit_code=$freezeExit;linux_build_exit=$freezeBuildExit;error=$freezeFailure;source=($freezePrefix+'-source.json');log=($freezePrefix+'.jsonl');owner=$freezeOwner;owner_removed=(-not(Test-Path -LiteralPath $freezeOwner));inputs_stable=$freezeStable;scope='private_protocol_and_finalizer_primitive_with_A_typed_nil_standard_library_not_concrete_collector';default_vet=$true;actual_mysql=$false;collector_wired=$false;role_approved=$false;dependencies_installed=$false}
    [IO.File]::WriteAllText(($freezePrefix+'.json'),($freezeResult|ConvertTo-Json -Depth 6))
    Write-Output ('GC_FREEZE_PROTOCOL_RESULT='+$freezePrefix+'.json')
}
if($freezeFailure){throw $freezeFailure}
