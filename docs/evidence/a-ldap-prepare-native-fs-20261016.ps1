[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Owner)
$ErrorActionPreference='Stop'
$prepRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prepOwner=[IO.Path]::GetFullPath($Owner)
if([IO.Path]::GetDirectoryName($prepOwner) -ne $prepRoot -or [IO.Path]::GetFileName($prepOwner) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $prepOwner)){throw 'Expected new exact preparation owner'}
[IO.Directory]::CreateDirectory($prepOwner)|Out-Null
[IO.File]::WriteAllText((Join-Path $prepOwner 'owner.txt'),[IO.Path]::GetFileName($prepOwner))
. (Join-Path $prepRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
. (Join-Path $prepRoot 'scripts/system-backup-a-config-proof-source.ps1')
$prepCapture=Join-Path $prepRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
try {
    [IO.Directory]::CreateDirectory($prepCapture)|Out-Null
    [IO.File]::WriteAllText((Join-Path $prepCapture 'owner.txt'),[IO.Path]::GetFileName($prepCapture))
    $prepSnapshot=New-AConfigProofSourceSnapshot -Root $prepRoot -Owner $prepCapture -MaxAttempts 3
    $prepFrom=[IO.Path]::GetFullPath((Join-Path $prepCapture 'source'))
    $prepTo=[IO.Path]::GetFullPath((Join-Path $prepOwner 'source'))
    if([IO.Path]::GetDirectoryName($prepCapture) -ne $prepRoot -or [IO.Path]::GetDirectoryName($prepFrom) -ne $prepCapture -or [IO.Path]::GetDirectoryName($prepTo) -ne $prepOwner -or ((Get-Item -LiteralPath $prepFrom -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing redirected source move'}
    Move-Item -LiteralPath $prepFrom -Destination $prepTo
} finally {
    if(Test-Path -LiteralPath $prepCapture){
        if([IO.Path]::GetDirectoryName((Resolve-Path -LiteralPath $prepCapture).Path) -ne $prepRoot -or ((Get-Item -LiteralPath $prepCapture -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $prepCapture 'owner.txt')) -ne [IO.Path]::GetFileName($prepCapture)){throw 'Refusing source capture cleanup'}
        Remove-Item -LiteralPath $prepCapture -Recurse -Force
    }
    Write-Output ('LOCAL_CLEANUP ldap-preparation-capture='+$prepCapture+' removed='+(-not(Test-Path -LiteralPath $prepCapture)))
}
$prepSnapshot['baseline_sha256']=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'a-ldap-auth-before-cancellation-20261016.go') -Algorithm SHA256).Hash.ToLowerInvariant()
$prepSnapshot['module_archive_permissions']='header-only normalization: directory 0755, file owner read/write; content bytes unchanged'
[IO.File]::WriteAllText((Join-Path $prepOwner 'source-manifest.json'),($prepSnapshot|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
foreach($prepDir in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $prepOwner $prepDir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $prepOwner 'telemetry/mode'),'off 2026-10-16')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOWORK='off';$env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOMAXPROCS='2';$env:GOCACHE=Join-Path $prepOwner 'cache';$env:GOTMPDIR=Join-Path $prepOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $prepOwner 'telemetry'
Push-Location (Join-Path $prepOwner 'source/backend')
try{$prepModules=@(& 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -deps -test -f '{{if .Module}}{{.Module.Dir}}{{end}}' ./internal/services);if($LASTEXITCODE -ne 0){throw 'Offline module resolution failed'}}finally{Pop-Location}
$prepCache=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'go/pkg/mod'))
$prepRelative=@($prepModules|Where-Object {$_ -and $_ -notlike ($prepOwner+'*')}|Sort-Object -Unique|ForEach-Object {
    $prepPath=[IO.Path]::GetFullPath($_)
    if(-not $prepPath.StartsWith($prepCache+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or ((Get-Item -LiteralPath $prepPath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'External or redirected module'}
    [IO.Path]::GetRelativePath($prepCache,$prepPath).Replace('\','/')
})
$prepMetadata=@(Get-ChildItem -LiteralPath (Join-Path $prepCache 'cache/download') -File -Recurse | Where-Object {$_.Extension -in @('.mod','.info','.ziphash') -or $_.Name -eq 'list'} | ForEach-Object {[IO.Path]::GetRelativePath($prepCache,$_.FullName).Replace('\','/')})
[IO.File]::WriteAllLines((Join-Path $prepOwner 'module-archive-list.txt'),@($prepRelative)+@($prepMetadata),[Text.UTF8Encoding]::new($false))
& tar -cf (Join-Path $prepOwner 'modules.tar') -C $prepCache -T (Join-Path $prepOwner 'module-archive-list.txt')
if($LASTEXITCODE -ne 0){throw 'Module archive failed'}
& node (Join-Path $PSScriptRoot 'a-ldap-normalize-tar-20261016.mjs') (Join-Path $prepOwner 'modules.tar')
if($LASTEXITCODE -ne 0){throw 'Module archive normalization failed'}
$prepFrozen=Join-Path $prepOwner 'source'
foreach($prepExtra in @('a-ldap-auth-before-cancellation-20261016.go','a-ldap-linux-source-check-20261016.go')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $prepExtra) -Destination (Join-Path $prepFrozen ('docs/evidence/'+$prepExtra))}
[IO.File]::WriteAllLines((Join-Path $prepOwner 'source-list.txt'),@($prepSnapshot.files|ForEach-Object {$_.path})+@('docs/evidence/a-ldap-auth-before-cancellation-20261016.go','docs/evidence/a-ldap-linux-source-check-20261016.go'),[Text.UTF8Encoding]::new($false))
& tar -cf (Join-Path $prepOwner 'source.tar') -C $prepFrozen -T (Join-Path $prepOwner 'source-list.txt')
if($LASTEXITCODE -ne 0){throw 'Source archive failed'}
Test-DIndexSourceSnapshot -Root $prepFrozen -Manifest $prepSnapshot
Write-Output ('LOCAL_PASS native-preparation=yes source-files='+$prepSnapshot.files.Count+' modules='+$prepRelative.Count+' dependencies-installed=no Go-tests-executed=no owner='+$prepOwner)
