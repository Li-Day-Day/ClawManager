# Resolve both platforms against one stable source; no tests, SQL or installs.
$ErrorActionPreference='Stop'
$depRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$depOwner=Join-Path $depRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$depStem=Join-Path $PSScriptRoot 'a-owner-dependency-freeze-20261023-r4'
foreach($suffix in @('-source.json','-windows-imports.txt','-windows-stderr.txt','-linux-imports.txt','-linux-stderr.txt','-native.json')){
    if(Test-Path -LiteralPath ($depStem+$suffix)){throw 'Refusing dependency evidence overwrite'}
}
$depEnvNames=@('GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOENV','GOFLAGS','GOMAXPROCS','GOOS','GOARCH','CGO_ENABLED','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR')
$depPrevious=@{}
foreach($name in $depEnvNames){$depPrevious[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
[IO.Directory]::CreateDirectory($depOwner)|Out-Null
[IO.File]::WriteAllText((Join-Path $depOwner 'owner.txt'),[IO.Path]::GetFileName($depOwner))
$depExit=1;$depSnapshot=$null;$depStarted=[DateTime]::UtcNow.ToString('o');$depPlatforms=@()
try {
    . (Join-Path $depRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $depRoot 'scripts/system-backup-a-config-proof-source.ps1')
    $depSnapshot=New-AConfigProofSourceSnapshot -Root $depRoot -Owner $depOwner -MaxAttempts 3
    [IO.File]::WriteAllText(($depStem+'-source.json'),($depSnapshot|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $depOwner 'cache';$env:GOTMPDIR=$depOwner;$env:TEST_TELEMETRY_DIR=Join-Path $depOwner 'telemetry'
    [IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off 2026-10-23')
    foreach($depPlatform in @('windows','linux')){
        $env:GOOS=$depPlatform
        $depProcess=Start-Process -FilePath (Get-Command go).Source -ArgumentList @('list','-mod=readonly','-deps','-test','-tags','systembackup_mysql','-f','{{.ImportPath}}','./internal/systembackupsecurity','./internal/systembackupevidence','./cmd/system-backup-migrate') -WorkingDirectory (Join-Path $depOwner 'source/backend') -RedirectStandardOutput ($depStem+'-'+$depPlatform+'-imports.txt') -RedirectStandardError ($depStem+'-'+$depPlatform+'-stderr.txt') -WindowStyle Hidden -PassThru -Wait
        if($depProcess.ExitCode -ne 0){throw 'Offline dependency resolution failed; do not install dependencies'}
        $depImports=[IO.File]::ReadAllText($depStem+'-'+$depPlatform+'-imports.txt')
        if($depImports -match '(?m)^clawreef/internal/systembackupresources(?:\s|\.|$)'){throw 'Resources participates in owner graph; complete fresh gate required'}
        $depPlatforms+=$depPlatform
    }
    Test-DIndexSourceSnapshot -Root (Join-Path $depOwner 'source') -Manifest $depSnapshot
    $depExit=0
} finally {
    foreach($name in $depEnvNames){[Environment]::SetEnvironmentVariable($name,$depPrevious[$name],'Process')}
    $depResolved=(Resolve-Path -LiteralPath $depOwner).Path
    if([IO.Path]::GetDirectoryName($depResolved) -ne $depRoot -or [IO.Path]::GetFileName($depResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
       ((Get-Item -LiteralPath $depResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
       [IO.File]::ReadAllText((Join-Path $depResolved 'owner.txt')) -cne [IO.Path]::GetFileName($depResolved)){throw 'Dependency scratch identity changed; refusing cleanup'}
    Remove-Item -LiteralPath $depResolved -Recurse -Force
    $depRecord=[ordered]@{kind='a_owner_tagged_dependency_freeze';started_utc=$depStarted;finished_utc=[DateTime]::UtcNow.ToString('o');exit=$depExit;source_sha256=$depSnapshot.source_sha256;source_postcheck=($depExit -eq 0);owner=$depResolved;removed=(-not(Test-Path -LiteralPath $depResolved));go_command='list -mod=readonly -deps -test -tags systembackup_mysql';roots=@('clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/cmd/system-backup-migrate');platforms_completed=$depPlatforms;resources_absent_from_completed_graphs=$true;tests_executed=$false;actual_sql=$false;dependencies_installed=$false}
    [IO.File]::WriteAllText(($depStem+'-native.json'),($depRecord|ConvertTo-Json -Depth 6)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output ('OWNER_DEPENDENCY_FREEZE exit='+$depExit+' scratch_removed='+$depRecord.removed+' platforms='+($depPlatforms -join ',')+' tests_executed=no actual_sql=no')
}
exit $depExit
