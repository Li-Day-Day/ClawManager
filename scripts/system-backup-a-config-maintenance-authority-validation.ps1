[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$maintenanceAuthorityRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$maintenanceAuthorityScratch=Join-Path $maintenanceAuthorityRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$maintenanceAuthoritySourceOwner=Join-Path $maintenanceAuthorityRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$maintenanceAuthorityFrozen=Join-Path $maintenanceAuthoritySourceOwner 'source'
$maintenanceAuthorityEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$maintenanceAuthorityPrevious=@{}
foreach($maintenanceAuthorityName in $maintenanceAuthorityEnvironment){$maintenanceAuthorityPrevious[$maintenanceAuthorityName]=[Environment]::GetEnvironmentVariable($maintenanceAuthorityName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$maintenanceAuthorityManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($maintenanceAuthorityManifest) -ne [IO.Path]::GetFullPath((Join-Path $maintenanceAuthorityRoot 'docs/evidence')) -or (Test-Path -LiteralPath $maintenanceAuthorityManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($maintenanceAuthoritySourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $maintenanceAuthoritySourceOwner 'owner.txt'),[IO.Path]::GetFileName($maintenanceAuthoritySourceOwner))
    $maintenanceAuthoritySnapshot=New-DIndexSourceSnapshot -Root $maintenanceAuthorityRoot -Destination $maintenanceAuthorityFrozen
    $maintenanceAuthorityStream=[IO.File]::Open($maintenanceAuthorityManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$maintenanceAuthorityBytes=[Text.Encoding]::UTF8.GetBytes(($maintenanceAuthoritySnapshot|ConvertTo-Json -Depth 6));$maintenanceAuthorityStream.Write($maintenanceAuthorityBytes,0,$maintenanceAuthorityBytes.Length)}finally{$maintenanceAuthorityStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-maintenance-authority-frozen=yes source_sha256='+$maintenanceAuthoritySnapshot.source_sha256+' files='+$maintenanceAuthoritySnapshot.files.Count)
    foreach($maintenanceAuthorityFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $maintenanceAuthorityScratch $maintenanceAuthorityFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $maintenanceAuthorityScratch 'cache';$env:GOTMPDIR=Join-Path $maintenanceAuthorityScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $maintenanceAuthorityScratch
    Push-Location (Join-Path $maintenanceAuthorityFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-maintenance-authority-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigMaintenanceAuthorityA','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-maintenance-authority-counterfactual'
        $maintenanceAuthoritySQL=Join-Path $maintenanceAuthorityFrozen 'backend/internal/systembackupsecurity/config_maintenance_authority.go'
        $maintenanceAuthorityControl=Join-Path $maintenanceAuthorityScratch 'audit-times-control.go'
        $maintenanceAuthorityOverlay=Join-Path $maintenanceAuthorityScratch 'audit-times-overlay.json'
        $maintenanceAuthoritySource=[IO.File]::ReadAllText($maintenanceAuthoritySQL)
        $maintenanceAuthorityGuards=@('!maintenanceSameGrant(p.grant, fresh.grant) || !maintenanceSameSource(p.source, fresh.source) || !p.until.Equal(fresh.until)')
        foreach($maintenanceAuthorityGuard in $maintenanceAuthorityGuards){
            if($maintenanceAuthoritySource.Split([string[]]@($maintenanceAuthorityGuard),[StringSplitOptions]::None).Count -ne 2){throw 'Cannot isolate exact original verified-facts guard'}
            $maintenanceAuthoritySource=$maintenanceAuthoritySource.Replace($maintenanceAuthorityGuard,('(('+$maintenanceAuthorityGuard+') && false)'))
        }
        [IO.File]::WriteAllText($maintenanceAuthorityControl,$maintenanceAuthoritySource,[Text.UTF8Encoding]::new($false))
        $maintenanceAuthorityOverlayMap=[ordered]@{};$maintenanceAuthorityOverlayMap[$maintenanceAuthoritySQL]=$maintenanceAuthorityControl
        [IO.File]::WriteAllText($maintenanceAuthorityOverlay,([ordered]@{Replace=$maintenanceAuthorityOverlayMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
        $maintenanceAuthorityLines=[Collections.Generic.List[string]]::new()
        $maintenanceAuthoritySavedNative=$PSNativeCommandUseErrorActionPreference
        try {
            $PSNativeCommandUseErrorActionPreference=$false
            & go test -overlay $maintenanceAuthorityOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigMaintenanceAuthorityARecheckPinsEveryOriginalObservation$/^(grant-bytes-same-version|grant-revocation|grant-extended|source-verifier-rotation)$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$maintenanceAuthorityLine=$_.ToString();$maintenanceAuthorityLines.Add($maintenanceAuthorityLine);Write-Host $maintenanceAuthorityLine}
            $maintenanceAuthorityControlExit=$LASTEXITCODE
        } finally {$PSNativeCommandUseErrorActionPreference=$maintenanceAuthoritySavedNative}
        $maintenanceAuthorityControlText=$maintenanceAuthorityLines -join "`n"
        $maintenanceAuthorityFailureCount=[regex]::Matches($maintenanceAuthorityControlText,'(?m)^\s+--- FAIL: TestConfigMaintenanceAuthorityARecheckPinsEveryOriginalObservation/(?:grant-bytes-same-version|grant-revocation|grant-extended|source-verifier-rotation) ').Count
        $maintenanceAuthorityAssertionCount=[regex]::Matches($maintenanceAuthorityControlText,'recheck adopted changed authenticated facts').Count
        if($maintenanceAuthorityControlExit -ne 1 -or $maintenanceAuthorityFailureCount -ne 4 -or $maintenanceAuthorityAssertionCount -ne 4){throw 'Counterfactual did not prove four exact authenticated-fact replacement failures'}
        Write-Output ('LOCAL_PASS expected-original-facts-rejections=4 actual-exit=1 default-vet=yes original-source-unchanged=yes control_source_sha256='+(Get-FileHash -LiteralPath $maintenanceAuthorityControl -Algorithm SHA256).Hash.ToLowerInvariant())
        Write-Output 'LOCAL_STAGE config-maintenance-authority-grant-binding-counterfactual'
        $maintenanceAuthorityBindingControl=Join-Path $maintenanceAuthorityScratch 'grant-binding-control.go'
        $maintenanceAuthorityBindingOverlay=Join-Path $maintenanceAuthorityScratch 'grant-binding-overlay.json'
        $maintenanceAuthorityBindingCode=[IO.File]::ReadAllText($maintenanceAuthoritySQL)
        if($maintenanceAuthorityBindingCode.Split([string[]]@('g.bindings != scope.identity'),[StringSplitOptions]::None).Count -ne 2){throw 'Cannot isolate independent grant binding comparison'}
        $maintenanceAuthorityBindingCode=$maintenanceAuthorityBindingCode.Replace('g.bindings != scope.identity','(g.bindings != scope.identity && false)')
        [IO.File]::WriteAllText($maintenanceAuthorityBindingControl,$maintenanceAuthorityBindingCode,[Text.UTF8Encoding]::new($false))
        $maintenanceAuthorityBindingMap=[ordered]@{};$maintenanceAuthorityBindingMap[$maintenanceAuthoritySQL]=$maintenanceAuthorityBindingControl
        [IO.File]::WriteAllText($maintenanceAuthorityBindingOverlay,([ordered]@{Replace=$maintenanceAuthorityBindingMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
        $maintenanceAuthorityBindingLines=[Collections.Generic.List[string]]::new()
        try {
            $PSNativeCommandUseErrorActionPreference=$false
            & go test -overlay $maintenanceAuthorityBindingOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigMaintenanceAuthorityAIndependentGrantAndSourceBindings$/^(target-server|config-hash|row-fingerprint|schema)$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$maintenanceAuthorityBindingLine=$_.ToString();$maintenanceAuthorityBindingLines.Add($maintenanceAuthorityBindingLine);Write-Host $maintenanceAuthorityBindingLine}
            $maintenanceAuthorityBindingExit=$LASTEXITCODE
        } finally {$PSNativeCommandUseErrorActionPreference=$maintenanceAuthoritySavedNative}
        $maintenanceAuthorityBindingText=$maintenanceAuthorityBindingLines -join "`n"
        $maintenanceAuthorityBindingFailures=[regex]::Matches($maintenanceAuthorityBindingText,'(?m)^\s+--- FAIL: TestConfigMaintenanceAuthorityAIndependentGrantAndSourceBindings/(?:target-server|config-hash|row-fingerprint|schema) ').Count
        if($maintenanceAuthorityBindingExit -ne 1 -or $maintenanceAuthorityBindingFailures -ne 4 -or [regex]::Matches($maintenanceAuthorityBindingText,'foreign/unverified binding admitted').Count -ne 4){throw 'Counterfactual did not prove four independent grant tuple mismatches'}
        Write-Output ('LOCAL_PASS expected-grant-binding-rejections=4 actual-exit=1 default-vet=yes original-source-unchanged=yes control_source_sha256='+(Get-FileHash -LiteralPath $maintenanceAuthorityBindingControl -Algorithm SHA256).Hash.ToLowerInvariant())
        Write-Output 'LOCAL_STAGE config-maintenance-authority-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $maintenanceAuthorityFrozen -Manifest $maintenanceAuthoritySnapshot
        Write-Output 'LOCAL_PASS config-maintenance-authority-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($maintenanceAuthorityName in $maintenanceAuthorityEnvironment){[Environment]::SetEnvironmentVariable($maintenanceAuthorityName,$maintenanceAuthorityPrevious[$maintenanceAuthorityName],'Process')}
    foreach($maintenanceAuthorityOwned in @($maintenanceAuthorityScratch,$maintenanceAuthoritySourceOwner)){
        if(Test-Path -LiteralPath $maintenanceAuthorityOwned){
            $maintenanceAuthorityResolved=(Resolve-Path -LiteralPath $maintenanceAuthorityOwned).Path
            if([IO.Path]::GetDirectoryName($maintenanceAuthorityResolved) -ne $maintenanceAuthorityRoot -or [IO.Path]::GetFileName($maintenanceAuthorityResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $maintenanceAuthorityResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing maintenance authority cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $maintenanceAuthorityResolved
        }
        Write-Output ('LOCAL_CLEANUP config-maintenance-authority-owned='+$maintenanceAuthorityOwned+' removed='+(-not(Test-Path -LiteralPath $maintenanceAuthorityOwned)))
    }
}
