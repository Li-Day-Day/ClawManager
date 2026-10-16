[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SourceManifestPath,[string]$ModuleCachePath=(Join-Path $env:USERPROFILE 'go/pkg/mod'),[ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$GoImage='sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039')
$ErrorActionPreference='Stop'
$ldapGateRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ldapGateID=[guid]::NewGuid().ToString('N')
$ldapGateOwner=Join-Path $ldapGateRoot ('.tmp-d-index-cache-'+$ldapGateID)
$ldapGateFrozen=Join-Path $ldapGateOwner 'source'
$ldapGateBaseline=Join-Path $ldapGateRoot 'docs/evidence/a-ldap-auth-before-cancellation-20261016.go'
$ldapGateManifest=[IO.Path]::GetFullPath($SourceManifestPath)
$ldapGateContainer='codex-a-ldap-request-'+$ldapGateID
if([IO.Path]::GetDirectoryName($ldapGateManifest) -ne (Join-Path $ldapGateRoot 'docs/evidence') -or (Test-Path -LiteralPath $ldapGateManifest)){throw 'Expected new LDAP evidence manifest'}
if(-not(Test-Path -LiteralPath $ModuleCachePath -PathType Container)){throw 'Existing module cache required'}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
try {
    [IO.Directory]::CreateDirectory($ldapGateOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $ldapGateOwner 'owner.txt'),[IO.Path]::GetFileName($ldapGateOwner))
    Write-Output ('LOCAL_OWNER ldap-request-source='+$ldapGateOwner+' container='+$ldapGateContainer)
    $ldapGateSnapshot=New-AConfigProofSourceSnapshot -Root $ldapGateRoot -Owner $ldapGateOwner -MaxAttempts 3
    $ldapGateSnapshot['baseline_sha256']=(Get-FileHash -LiteralPath $ldapGateBaseline -Algorithm SHA256).Hash.ToLowerInvariant()
    $ldapGateStream=[IO.File]::Open($ldapGateManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$ldapGateBytes=[Text.Encoding]::UTF8.GetBytes(($ldapGateSnapshot|ConvertTo-Json -Depth 6));$ldapGateStream.Write($ldapGateBytes,0,$ldapGateBytes.Length)}finally{$ldapGateStream.Dispose()}
    Write-Output ('LOCAL_SOURCE ldap-request=yes files='+$ldapGateSnapshot.files.Count+' source_sha256='+$ldapGateSnapshot.source_sha256+' baseline_sha256='+$ldapGateSnapshot.baseline_sha256)
    $ldapGateBuild=@'
set -eu
mkdir -p /tmp/cache /tmp/telemetry
printf 'off 2026-10-16' > /tmp/telemetry/mode
go version
printf '{"Replace":{"/work/backend/internal/services/ldap_auth.go":"/baseline/ldap_auth.go"}}' > /tmp/old-overlay.json
printf 'LOCAL_STAGE ldap-old-source-negative-control exact-cancel-case=yes default-vet=yes retry=no\n'
set +e
(cd /work/backend; go test -overlay=/tmp/old-overlay.json -mod=readonly -p=1 -count=1 -timeout=30s -json -run '^TestLDAPRequestACancelClosesTransport$/^plain$/^service-bind$' ./internal/services) > /tmp/negative.json 2>&1
negative_exit=$?
set -e
cat /tmp/negative.json
[ "$negative_exit" = 1 ] || exit 1
grep -q '"Action":"fail"' /tmp/negative.json
grep -q 'LDAP operation exceeded its cancellation/timeout bound' /tmp/negative.json
if grep -q '"Action":"build-fail"' /tmp/negative.json; then exit 1; fi
printf 'LOCAL_PASS ldap-old-source-negative-control=reproduced test-exit=1 context-cancel-ignored=yes\n'
printf 'LOCAL_STAGE ldap-real-transport-positive default-vet=yes retry=no scope=complete-services-package\n'
cd /work/backend
go test -mod=readonly -p=1 -count=1 -timeout=900s -json ./internal/services
printf 'LOCAL_PASS ldap-real-transport=yes protocols=plain/ldaps/starttls source-service-package=complete real-directory=no SSH=no SQL=no\n'
'@
    $ldapGateDocker=@('run','--rm','--pull=never','--name',$ldapGateContainer,'--label',('codex.a-ldap-request-owner='+$ldapGateID),'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','1','--memory','3072m','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=2304m',
        '--mount',('type=bind,source='+$ldapGateFrozen+',target=/work,readonly'),'--mount',('type=bind,source='+[IO.Path]::GetFullPath($ModuleCachePath)+',target=/modules,readonly'),'--mount',('type=bind,source='+$ldapGateBaseline+',target=/baseline/ldap_auth.go,readonly'),
        '--env','GOPROXY=off','--env','GOSUMDB=off','--env','GOTOOLCHAIN=local','--env','GOENV=off','--env','GOMODCACHE=/modules','--env','GOCACHE=/tmp/cache','--env','GOTMPDIR=/tmp','--env','TEST_TELEMETRY_DIR=/tmp/telemetry','--env','CGO_ENABLED=0','--env','GOMAXPROCS=1',$GoImage,'sh','-c',$ldapGateBuild)
    $ldapGateExit=Invoke-AEvidenceNative -FilePath 'docker' -Arguments $ldapGateDocker
    Write-Output ('LDAP_REQUEST_GO_CONTAINER_EXIT='+$ldapGateExit)
    if($ldapGateExit -ne 0){throw ('LDAP request validation failed exit='+$ldapGateExit+'; no automatic retry')}
    Test-DIndexSourceSnapshot -Root $ldapGateFrozen -Manifest $ldapGateSnapshot
    foreach($ldapGatePin in @($ldapGateSnapshot.files|Where-Object {$_.path -like 'backend/internal/services/ldap*' -or $_.path -eq 'backend/internal/services/enterprise_auth.go' -or $_.path -eq 'scripts/system-backup-a-ldap-request-validation.ps1'})){
        if((Get-FileHash -LiteralPath (Join-Path $ldapGateRoot $ldapGatePin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ldapGatePin.sha256){throw 'LDAP source changed during gate'}
    }
    Write-Output 'LOCAL_PASS ldap-request-frozen-postcheck=yes current-LDAP-postcheck=yes dependencies-installed=no remote-executed=no'
} finally {
    if(Test-Path -LiteralPath $ldapGateOwner){
        $ldapGateResolved=(Resolve-Path -LiteralPath $ldapGateOwner).Path
        if([IO.Path]::GetDirectoryName($ldapGateResolved) -ne $ldapGateRoot -or [IO.Path]::GetFileName($ldapGateResolved) -ne ('.tmp-d-index-cache-'+$ldapGateID) -or ((Get-Item -Force -LiteralPath $ldapGateResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $ldapGateResolved 'owner.txt')) -ne [IO.Path]::GetFileName($ldapGateResolved)){throw 'Refusing LDAP source cleanup outside exact owner'}
        Remove-Item -LiteralPath $ldapGateResolved -Recurse -Force
    }
    Write-Output ('LOCAL_CLEANUP ldap-request-owned='+$ldapGateOwner+' removed='+(-not(Test-Path -LiteralPath $ldapGateOwner)))
}
