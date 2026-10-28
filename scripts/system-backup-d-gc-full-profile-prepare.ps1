[CmdletBinding()]
param([string]$ExistingCompilationCache=(Join-Path $env:LOCALAPPDATA 'go-build'))
$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false
$gcProfileRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$gcProfileID=[guid]::NewGuid().ToString('N');$gcProfileOwner=Join-Path $gcProfileRoot ('.tmp-d-index-cache-'+$gcProfileID)
$gcProfileSource=Join-Path $gcProfileOwner 'source';$gcProfilePrefix=Join-Path $gcProfileRoot ('docs/evidence/d-gc-full-profile-prep-'+$gcProfileID)
$gcProfileNames=@('GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$gcProfileSaved=@{};foreach($gcProfileName in $gcProfileNames){$gcProfileSaved[$gcProfileName]=[Environment]::GetEnvironmentVariable($gcProfileName,'Process')}
$gcProfileFailure=$null;$gcProfileSeedExit=$null;$gcProfileLinuxExit=$null;$gcProfileBinaryHash=$null;$gcProfileStable=$false
try {
    if(Test-Path -LiteralPath $gcProfileOwner){throw 'Refusing existing profile owner'}
    [IO.Directory]::CreateDirectory($gcProfileOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $gcProfileOwner 'owner.txt'),[IO.Path]::GetFileName($gcProfileOwner))
    foreach($gcProfileDirectory in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $gcProfileOwner $gcProfileDirectory))|Out-Null}
    & node (Join-Path $PSScriptRoot 'system-backup-d-gc-full-snapshot.mjs') capture $gcProfileRoot $gcProfileSource ($gcProfilePrefix+'-source.json')
    if($LASTEXITCODE -ne 0){throw 'Profile source snapshot refused'}
    & node (Join-Path $gcProfileSource 'scripts/system-backup-d-gc-full-profile-cache-seed.mjs') $gcProfileRoot $ExistingCompilationCache (Join-Path $gcProfileOwner 'cache') > ($gcProfilePrefix+'-compilation-seed.json')
    if($LASTEXITCODE -ne 0){throw 'Profile cache seed failed before compiler'}
    $env:GOWORK='off';$env:GOFLAGS='';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $gcProfileOwner 'cache';$env:GOTMPDIR=Join-Path $gcProfileOwner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $gcProfileOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location $gcProfileSource
    try {
        & ./scripts/system-backup-d-download-gc-full-profile-dispatch.test.ps1
        & ./scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1
        if($LASTEXITCODE -ne 0){throw 'Profile or historical dispatcher failed'}
        Push-Location backend
        try {
            & go test -mod=readonly -tags systembackup_mysql -p=2 -json -count=1 -timeout=180s -run '^TestDDownloadGCFullProfileMySQLSeed$' ./internal/systembackupevidence > ($gcProfilePrefix+'-seed.jsonl') 2>&1
            $gcProfileSeedExit=$LASTEXITCODE;if($gcProfileSeedExit -ne 0){throw 'Full-profile native seed failed'}
            $env:GOOS='linux';$gcProfileBinary=Join-Path $gcProfileOwner 'd-download-gc-full-profile.test'
            & go test -mod=readonly -tags systembackup_mysql -p=2 -c -o $gcProfileBinary ./internal/systembackupevidence > ($gcProfilePrefix+'-linux.txt') 2>&1
            $gcProfileLinuxExit=$LASTEXITCODE;if($gcProfileLinuxExit -ne 0){throw 'Full-profile Linux probe compile failed'}
            $gcProfileBinaryHash=(Get-FileHash -LiteralPath $gcProfileBinary -Algorithm SHA256).Hash.ToLowerInvariant()
        } finally {Pop-Location}
    } finally {Pop-Location}
    & node (Join-Path $gcProfileSource 'scripts/system-backup-d-gc-full-snapshot.mjs') check $gcProfileSource ($gcProfilePrefix+'-source.json')
    if($LASTEXITCODE -ne 0){throw 'Full-profile frozen inputs drifted'}
    $gcProfileStable=$true
} catch {$gcProfileFailure=$_.Exception.Message} finally {
    foreach($gcProfileName in $gcProfileNames){[Environment]::SetEnvironmentVariable($gcProfileName,$gcProfileSaved[$gcProfileName],'Process')}
    if(Test-Path -LiteralPath $gcProfileOwner){
        $gcProfileResolved=(Resolve-Path -LiteralPath $gcProfileOwner).Path
        if([IO.Path]::GetDirectoryName($gcProfileResolved) -cne $gcProfileRoot -or [IO.Path]::GetFileName($gcProfileResolved) -cne ('.tmp-d-index-cache-'+$gcProfileID) -or ((Get-Item -Force -LiteralPath $gcProfileResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $gcProfileResolved 'owner.txt')) -cne [IO.Path]::GetFileName($gcProfileResolved)){throw 'Refusing profile cleanup outside exact owner'}
        Remove-Item -LiteralPath $gcProfileResolved -Recurse -Force
    }
    $gcProfileReceipt=[ordered]@{kind='d_gc_full_profile_local_preparation.v1';source_manifest=($gcProfilePrefix+'-source.json');seed_log=($gcProfilePrefix+'-seed.jsonl');seed_exit=$gcProfileSeedExit;linux_compile_exit=$gcProfileLinuxExit;linux_binary_sha256=$gcProfileBinaryHash;binary_removed=$true;frozen_source_postcheck=$gcProfileStable;owner=$gcProfileOwner;owner_removed=(-not(Test-Path -LiteralPath $gcProfileOwner));error=$gcProfileFailure;profile_cases=33;actual_profile_cases_executed=0;actual_mysql=$false;public_collect=$false;complete_group_fixture=$false;production_approved=$false;whole_tree_ready=$false;dependencies_installed=$false}
    [IO.File]::WriteAllText(($gcProfilePrefix+'.json'),($gcProfileReceipt|ConvertTo-Json -Depth 7));Write-Output ('FULL_PROFILE_PREPARATION='+$gcProfilePrefix+'.json')
}
if($gcProfileFailure){throw $gcProfileFailure}
