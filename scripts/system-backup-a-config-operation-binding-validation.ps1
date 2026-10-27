[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$bindingRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$bindingScratch=Join-Path $bindingRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$bindingSourceOwner=Join-Path $bindingRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$bindingFrozen=Join-Path $bindingSourceOwner 'source'
$bindingEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$bindingPrevious=@{}
foreach($bindingName in $bindingEnvironment){$bindingPrevious[$bindingName]=[Environment]::GetEnvironmentVariable($bindingName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$bindingManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($bindingManifest) -ne [IO.Path]::GetFullPath((Join-Path $bindingRoot 'docs/evidence')) -or (Test-Path -LiteralPath $bindingManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($bindingSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $bindingSourceOwner 'owner.txt'),[IO.Path]::GetFileName($bindingSourceOwner))
    $bindingSnapshot=New-DIndexSourceSnapshot -Root $bindingRoot -Destination $bindingFrozen
    $bindingStream=[IO.File]::Open($bindingManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$bindingBytes=[Text.Encoding]::UTF8.GetBytes(($bindingSnapshot|ConvertTo-Json -Depth 6));$bindingStream.Write($bindingBytes,0,$bindingBytes.Length)}finally{$bindingStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-operation-binding-frozen=yes source_sha256='+$bindingSnapshot.source_sha256+' files='+$bindingSnapshot.files.Count)
    foreach($bindingFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $bindingScratch $bindingFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $bindingScratch 'cache';$env:GOTMPDIR=Join-Path $bindingScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $bindingScratch
    Push-Location (Join-Path $bindingFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-operation-binding-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfig(OperationA|MutationACommitClockAfterFinalBoundaries|MutationHTTPRealTLSJWTWriterAndOriginalReplay)','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-operation-binding-counterfactual'
        $bindingOriginalFile=Join-Path $bindingFrozen 'backend/internal/systembackupsecurity/config_mutation_transaction.go'
        $bindingControlFile=Join-Path $bindingScratch 'borrowed-response-control.go'
        $bindingControlOverlay=Join-Path $bindingScratch 'borrowed-response-overlay.json'
        $bindingOriginalCode=[IO.File]::ReadAllText($bindingOriginalFile)
        $bindingSafeCall='prepared.Stage(ctx, v.tx, operationPolicy, append([]byte(nil), response...), retention)'
        if($bindingOriginalCode.Split([string[]]@($bindingSafeCall),[StringSplitOptions]::None).Count -ne 2){throw 'Cannot isolate the exact Operation response-copy guard'}
        $bindingControlCode=$bindingOriginalCode.Replace($bindingSafeCall,'prepared.Stage(ctx, v.tx, operationPolicy, response, retention)')
        [IO.File]::WriteAllText($bindingControlFile,$bindingControlCode,[Text.UTF8Encoding]::new($false))
        $bindingOverlayMap=[ordered]@{};$bindingOverlayMap[$bindingOriginalFile]=$bindingControlFile
        [IO.File]::WriteAllText($bindingControlOverlay,([ordered]@{Replace=$bindingOverlayMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
        $bindingControlLines=[Collections.Generic.List[string]]::new()
        $bindingSavedNative=$PSNativeCommandUseErrorActionPreference
        try{
            $PSNativeCommandUseErrorActionPreference=$false
            & go test -overlay $bindingControlOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigOperationACallbackCannotRewriteOriginalResponse$/^.*$/^recheck$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$bindingLine=$_.ToString();$bindingControlLines.Add($bindingLine);Write-Host $bindingLine}
            $bindingControlExit=$LASTEXITCODE
        }finally{$PSNativeCommandUseErrorActionPreference=$bindingSavedNative}
        $bindingControlText=$bindingControlLines -join "`n"
        $bindingFailedChecks=[regex]::Matches($bindingControlText,'(?m)^[ \t]+--- FAIL: TestConfigOperationACallbackCannotRewriteOriginalResponse/(?:updateSystemBackupConfig|rollbackSystemBackupConfig)/recheck ').Count
        if($bindingControlExit -ne 1 -or $bindingFailedChecks -ne 2 -or [regex]::Matches($bindingControlText,"Recheck rewrote the writer's private response bytes").Count -ne 2){throw 'Counterfactual did not prove both original-response alias failures'}
        Write-Output ('LOCAL_PASS expected-counterfactual-rejections=2 actual-exit=1 default-vet=yes original-source-unchanged=yes control_source_sha256='+(Get-FileHash -LiteralPath $bindingControlFile -Algorithm SHA256).Hash.ToLowerInvariant())
        Write-Output 'LOCAL_STAGE config-operation-binding-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $bindingFrozen -Manifest $bindingSnapshot
        Write-Output 'LOCAL_PASS config-operation-binding-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($bindingName in $bindingEnvironment){[Environment]::SetEnvironmentVariable($bindingName,$bindingPrevious[$bindingName],'Process')}
    foreach($bindingOwned in @($bindingScratch,$bindingSourceOwner)){
        if(Test-Path -LiteralPath $bindingOwned){
            $bindingResolved=(Resolve-Path -LiteralPath $bindingOwned).Path
            if([IO.Path]::GetDirectoryName($bindingResolved) -ne $bindingRoot -or [IO.Path]::GetFileName($bindingResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $bindingResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing operation binding cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $bindingResolved
        }
        Write-Output ('LOCAL_CLEANUP config-operation-binding-owned='+$bindingOwned+' removed='+(-not(Test-Path -LiteralPath $bindingOwned)))
    }
}
