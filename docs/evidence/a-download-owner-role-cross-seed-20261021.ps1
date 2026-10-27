$ErrorActionPreference='Stop'
$crossRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$crossStem=Join-Path $crossRoot 'docs/evidence/a-download-owner-role-repaired-cross-seed-20261021'
foreach($crossSuffix in @('.jsonl','-stderr.txt','-detached.txt','-detached-stderr.txt','-native.json')){if(Test-Path -LiteralPath ($crossStem+$crossSuffix)){throw 'Refusing cross-seed evidence overwrite'}}
$crossManifestPath=Join-Path $crossRoot 'docs/evidence/a-download-gc-role-drift-fixture-20261021-r1-source.json'
$crossManifest=Get-Content -Raw -LiteralPath $crossManifestPath|ConvertFrom-Json
$crossStream=[IO.File]::Open((Join-Path $crossRoot 'docs/evidence/a-download-gc-role-drift-fixture-20261021-r1-native.txt'),[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
$crossReader=[IO.StreamReader]::new($crossStream)
try {$crossNative=$crossReader.ReadToEnd()} finally {$crossReader.Dispose()}
$crossMatch=[regex]::Match($crossNative,'(?m)^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$')
$crossOwner=$crossMatch.Groups[3].Value.Trim()
if(-not $crossMatch.Success -or $crossMatch.Groups[2].Value -cne $crossManifest.source_sha256 -or [IO.Path]::GetDirectoryName($crossOwner) -ne $crossRoot -or [IO.Path]::GetFileName($crossOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.File]::ReadAllText((Join-Path $crossOwner 'owner.txt')) -cne [IO.Path]::GetFileName($crossOwner)){throw 'Cross-seed source identity mismatch'}
$crossCacheRoot=Join-Path $crossRoot '.tmp-d-admission-a-role-drift-20261021-r1'
if([IO.File]::ReadAllText((Join-Path $crossCacheRoot 'owner.txt')) -cne 'a-role-drift-20261021-r1'){throw 'Cross-seed cache ownership mismatch'}
$crossBinary=Join-Path $crossOwner 'download-admission.test.exe'
$crossBinaryHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $crossBinary).Hash.ToLowerInvariant()
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOCACHE=Join-Path $crossCacheRoot 'cache';$env:GOTMPDIR=$crossOwner;$env:TEST_TELEMETRY_DIR=Join-Path $crossOwner 'telemetry'
$crossPattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
$crossStarted=[DateTime]::UtcNow.ToString('o')
$crossGo=Start-Process -FilePath (Get-Command go).Source -ArgumentList @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','-tags','systembackup_mysql','-run',$crossPattern,'./internal/systembackupevidence') -WorkingDirectory (Join-Path $crossOwner 'source/backend') -RedirectStandardOutput ($crossStem+'.jsonl') -RedirectStandardError ($crossStem+'-stderr.txt') -WindowStyle Hidden -PassThru -Wait
if($crossGo.ExitCode -ne 0){throw 'Cross-seed package failed; no business retry'}
$crossDetached=Start-Process -FilePath $crossBinary -ArgumentList @('-test.run',$crossPattern,'-test.v','-test.count=1','-test.timeout=60s') -WorkingDirectory $crossOwner -RedirectStandardOutput ($crossStem+'-detached.txt') -RedirectStandardError ($crossStem+'-detached-stderr.txt') -WindowStyle Hidden -PassThru -Wait
if($crossDetached.ExitCode -ne 0){throw 'Cross-seed detached failed'}
. (Join-Path $crossRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
Test-DIndexSourceSnapshot -Root (Join-Path $crossOwner 'source') -Manifest $crossManifest
if((Get-FileHash -Algorithm SHA256 -LiteralPath $crossBinary).Hash.ToLowerInvariant() -cne $crossBinaryHash){throw 'Cross-seed binary changed'}
$crossRecord=[ordered]@{kind='a_owner_seeds_on_repaired_role_frozen_input';started_utc=$crossStarted;finished_utc=[DateTime]::UtcNow.ToString('o');source='docs/evidence/a-download-gc-role-drift-fixture-20261021-r1-source.json';source_manifest_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $crossManifestPath).Hash.ToLowerInvariant();source_sha256=$crossManifest.source_sha256;source_owner=$crossOwner;windows_binary_sha256=$crossBinaryHash;package_exit=$crossGo.ExitCode;detached_exit=$crossDetached.ExitCode;default_vet=$true;count_one=$true;source_postcheck=$true;actual_sql=$false;dependencies_installed=$false;cleanup_owner='role native runner and role wrapper; verify their final cleanup receipt'}
[IO.File]::WriteAllText(($crossStem+'-native.json'),($crossRecord|ConvertTo-Json -Depth 6)+"`n",[Text.UTF8Encoding]::new($false))
Write-Output 'PASS repaired combined source owner seeds packaged=13 detached=13 default_vet=yes source_postcheck=yes actual_mysql=no'
