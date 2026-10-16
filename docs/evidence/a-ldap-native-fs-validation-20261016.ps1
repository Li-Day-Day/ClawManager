[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PreparedOwner,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$nativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$nativeOwner=[IO.Path]::GetFullPath($PreparedOwner)
$nativeName=[IO.Path]::GetFileName($nativeOwner)
if([IO.Path]::GetDirectoryName($nativeOwner) -ne $nativeRoot -or $nativeName -notmatch '^\.tmp-a-evidence-([a-f0-9]{32})$'){throw 'Expected direct owned preparation directory'}
$nativeID=$Matches[1]
function Assert-NativeOwner {
    if(-not(Test-Path -LiteralPath $nativeOwner -PathType Container) -or ((Get-Item -Force -LiteralPath $nativeOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $nativeOwner 'owner.txt')) -ne $nativeName){throw 'Refusing unowned preparation directory'}
}
Assert-NativeOwner
$nativeManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($nativeManifest) -ne $PSScriptRoot -or (Test-Path -LiteralPath $nativeManifest)){throw 'Expected new evidence manifest'}
$nativeVolume='codex-a-ldap-nativefs-'+$nativeID
$nativeContainer='codex-a-ldap-nativefs-run-'+$nativeID
$nativeImage='sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039'
. (Join-Path $nativeRoot 'scripts/system-backup-a-evidence-go-step.ps1')
$nativeSnapshot=Get-Content -Raw -LiteralPath (Join-Path $nativeOwner 'source-manifest.json')|ConvertFrom-Json -AsHashtable
$nativeHarness=Join-Path $nativeRoot 'scripts/system-backup-a-ldap-request-validation.ps1'
$nativeChecker=Join-Path $PSScriptRoot 'a-ldap-linux-source-check-20261016.go'
$nativeHarnessPin=$nativeSnapshot.files|Where-Object {$_.path -eq 'scripts/system-backup-a-ldap-request-validation.ps1'}
if((Get-FileHash -LiteralPath $nativeHarness -Algorithm SHA256).Hash.ToLowerInvariant() -ne $nativeHarnessPin.sha256){throw 'Original validation commands changed'}
$nativeMatch=[regex]::Match([IO.File]::ReadAllText($nativeHarness),'(?s)\$ldapGateBuild=@''\r?\n(.*?)\r?\n''@')
if(-not $nativeMatch.Success){throw 'Original command body absent'}
$nativeBuild=$nativeMatch.Groups[1].Value.Replace('/work/backend','/workspace/source/backend').Replace('/baseline/ldap_auth.go','/workspace/source/docs/evidence/a-ldap-auth-before-cancellation-20261016.go').Replace('/tmp/cache','/workspace/cache').Replace('/tmp/telemetry','/workspace/telemetry')
$nativePins=@{}
foreach($nativeInput in @('source.tar','modules.tar','source-manifest.json')){$nativePins[$nativeInput]=(Get-FileHash -LiteralPath (Join-Path $nativeOwner $nativeInput) -Algorithm SHA256).Hash.ToLowerInvariant()}
$nativeCheckerSHA=(Get-FileHash -LiteralPath $nativeChecker -Algorithm SHA256).Hash.ToLowerInvariant()
$nativeSnapshot.native_fs_recovery=@{preparation_owner=$nativeOwner;volume=$nativeVolume;container=$nativeContainer;image=$nativeImage;archive_pins=$nativePins;checker_sha256=$nativeCheckerSHA;harness_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();previous_io_log='docs/evidence/a-ldap-request-local-20261016-153910-4062e7d6.txt';LDAP_source_and_wire_test_bytes_unchanged=$true;dependencies_installed=$false;network='none'}
[IO.File]::WriteAllText($nativeManifest,($nativeSnapshot|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
Write-Output ('LOCAL_OWNER ldap-native-source='+$nativeOwner+' container='+$nativeContainer+' volume='+$nativeVolume)
Write-Output ('LOCAL_SOURCE ldap-request=yes files='+$nativeSnapshot.files.Count+' source_sha256='+$nativeSnapshot.source_sha256+' baseline_sha256='+$nativeSnapshot.baseline_sha256)
$nativeCreated=$false
try {
    $nativeExisting=@(& docker volume ls --format '{{.Name}}')
    if($LASTEXITCODE -ne 0 -or $nativeExisting -contains $nativeVolume){throw 'Cannot establish fresh owned volume'}
    $nativeCreate=Invoke-AEvidenceNative -FilePath docker -Arguments @('volume','create','--label',('codex.a-ldap-nativefs-owner='+$nativeID),$nativeVolume)
    if($nativeCreate -ne 0){throw 'Volume creation failed'}
    $nativeCreated=$true
    $nativeInit=Invoke-AEvidenceNative -FilePath docker -Arguments @('run','--rm','--pull=never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',('type=volume,source='+$nativeVolume+',target=/workspace'),$nativeImage,'chmod','0777','/workspace')
    if($nativeInit -ne 0){throw 'Owned volume initialization failed'}
    $nativeBootstrap=@'
set -eu
printf 'LOCAL_STAGE ldap-native-filesystem same-snapshot=yes network=none dependencies-installed=no\n'
printf '%s  /inputs/source.tar\n%s  /inputs/modules.tar\n%s  /inputs/source-manifest.json\n' "$SOURCE_TAR_SHA" "$MODULES_TAR_SHA" "$SOURCE_MANIFEST_SHA" | sha256sum -c -
mkdir -p /workspace/source /workspace/modules /workspace/cache /workspace/tmp /workspace/telemetry /workspace/home
tar -xf /inputs/source.tar -C /workspace/source
tar -xf /inputs/modules.tar -C /workspace/modules
cp /inputs/source-manifest.json /workspace/source-manifest.json
printf 'off 2026-10-16' > /workspace/telemetry/mode
printf '%s  /workspace/source/docs/evidence/a-ldap-linux-source-check-20261016.go\n' "$CHECKER_SHA" | sha256sum -c -
cd /workspace/source/backend
go run -mod=readonly /workspace/source/docs/evidence/a-ldap-linux-source-check-20261016.go /workspace/source /workspace/source-manifest.json
'@
    $nativePost=@'
printf '%s  /workspace/source/docs/evidence/a-ldap-linux-source-check-20261016.go\n%s  /workspace/source-manifest.json\n' "$CHECKER_SHA" "$SOURCE_MANIFEST_SHA" | sha256sum -c -
go run -mod=readonly /workspace/source/docs/evidence/a-ldap-linux-source-check-20261016.go /workspace/source /workspace/source-manifest.json
'@
    $nativeShell=$nativeBootstrap+"`n"+$nativeBuild+"`n"+$nativePost
    $nativeArgs=@('run','--rm','--pull=never','--name',$nativeContainer,'--label',('codex.a-ldap-nativefs-owner='+$nativeID),'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','1','--memory','3072m','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=512m','--mount',('type=volume,source='+$nativeVolume+',target=/workspace'),'--mount',('type=bind,source='+$nativeOwner+',target=/inputs,readonly'))
    $nativeEnv=@{GOPROXY='off';GOSUMDB='off';GOTOOLCHAIN='local';GOENV='off';GOMODCACHE='/workspace/modules';GOCACHE='/workspace/cache';GOTMPDIR='/workspace/tmp';TMPDIR='/workspace/tmp';TEST_TELEMETRY_DIR='/workspace/telemetry';CGO_ENABLED='0';GOMAXPROCS='1';HOME='/workspace/home';SOURCE_TAR_SHA=$nativePins['source.tar'];MODULES_TAR_SHA=$nativePins['modules.tar'];SOURCE_MANIFEST_SHA=$nativePins['source-manifest.json'];CHECKER_SHA=$nativeCheckerSHA}
    foreach($nativeKey in $nativeEnv.Keys){$nativeArgs+=@('--env',($nativeKey+'='+$nativeEnv[$nativeKey]))}
    $nativeArgs+=@($nativeImage,'sh','-c',$nativeShell)
    $nativeExit=Invoke-AEvidenceNative -FilePath docker -Arguments $nativeArgs
    Write-Output ('LDAP_REQUEST_GO_CONTAINER_EXIT='+$nativeExit)
    if($nativeExit -ne 0){throw ('Native filesystem validation failed exit='+$nativeExit+'; no automatic retry')}
    foreach($nativePin in @($nativeSnapshot.files|Where-Object {$_.path -like 'backend/internal/services/ldap*' -or $_.path -eq 'backend/internal/services/enterprise_auth.go' -or $_.path -eq 'backend/internal/services/enterprise_auth_manager.go' -or $_.path -eq 'scripts/system-backup-a-ldap-request-validation.ps1'})){
        if((Get-FileHash -LiteralPath (Join-Path $nativeRoot $nativePin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $nativePin.sha256){throw 'LDAP source changed during native validation'}
    }
    Write-Output 'LOCAL_PASS ldap-request-frozen-postcheck=yes current-LDAP-postcheck=yes dependencies-installed=no remote-executed=no'
} finally {
    if($nativeCreated){
        $nativeInspection=@(& docker volume inspect $nativeVolume)|ConvertFrom-Json
        if($LASTEXITCODE -ne 0 -or $nativeInspection.Count -ne 1 -or $nativeInspection[0].Name -ne $nativeVolume -or $nativeInspection[0].Labels.'codex.a-ldap-nativefs-owner' -ne $nativeID){throw 'Refusing cleanup of unowned Docker volume'}
        $nativeRemoval=Invoke-AEvidenceNative -FilePath docker -Arguments @('volume','rm',$nativeVolume)
        if($nativeRemoval -ne 0){throw 'Owned volume cleanup failed; preparation retained'}
        Write-Output ('LOCAL_CLEANUP ldap-native-volume='+$nativeVolume+' removed=True')
    }
    Assert-NativeOwner
    Remove-Item -LiteralPath $nativeOwner -Recurse -Force
    Write-Output ('LOCAL_CLEANUP ldap-native-owned='+$nativeOwner+' removed='+(-not(Test-Path -LiteralPath $nativeOwner)))
}
