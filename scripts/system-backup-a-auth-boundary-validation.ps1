[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1)

# A source-only gate: no remote operations, database or directory credentials.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$authBoundaryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$authBoundaryScratch=Join-Path $authBoundaryRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$authBoundaryNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$authBoundaryPrevious=@{}
foreach($name in $authBoundaryNames){$authBoundaryPrevious[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
    foreach($folder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $authBoundaryScratch $folder)) | Out-Null}
    Write-Output ('OWNED_SCRATCH '+$authBoundaryScratch)
    $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'
    $env:GO111MODULE='on'; $env:GOWORK='off'; $env:GOFLAGS="-mod=readonly -p=$BuildParallelism"
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOMAXPROCS=[string]$BuildParallelism
    $env:GOCACHE=Join-Path $authBoundaryScratch 'cache'; $env:GOTMPDIR=Join-Path $authBoundaryScratch 'tmp'
    Initialize-AEvidenceTelemetry -Scratch $authBoundaryScratch
    Write-Output 'VALIDATION_SCOPE auth-source-only=yes full-services-package=no full-server-build=no http-handler=no live-ldap=no real-mysql=no'
    Push-Location (Join-Path $authBoundaryRoot 'backend')
    try {
        # Report dependency readiness separately; this is not a full build gate.
        $authBoundaryDependencyExit=Invoke-AEvidenceNative -FilePath (Get-Command go -CommandType Application).Source -Arguments @('list','-deps','-f','{{if .Incomplete}}{{.ImportPath}}{{end}}','./internal/handlers','./cmd/server')
        Write-Output "FULL_PACKAGE_DEPENDENCY_PREFLIGHT exit=$authBoundaryDependencyExit"
        Push-Location 'internal/services'
        try {
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=180s','-v','auth_service.go','auth_sessions.go','enterprise_auth.go','quota_service.go','user_service.go','default_passwords.go','auth_service_test.go','auth_sessions_test.go','username_login_test.go','quota_service_test.go') -Stage 'test-vet'
            Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=60s','-v','enterprise_auth.go','enterprise_auth_manager.go','ldap_auth.go','ldap_auth_test.go') -Stage 'test-vet'
        } finally { Pop-Location }
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=120s','-v','./internal/utils') -Stage 'test-vet'
        Write-Output 'PASS a-auth-boundary-source-only full-http-and-directory-events=not-verified'
    } finally { Pop-Location }
} finally {
    foreach($name in $authBoundaryNames){
        if($null -eq $authBoundaryPrevious[$name]){Remove-Item -LiteralPath ('Env:'+$name) -ErrorAction SilentlyContinue}
        else{[Environment]::SetEnvironmentVariable($name,$authBoundaryPrevious[$name],'Process')}
    }
    if(Test-Path -LiteralPath $authBoundaryScratch){
        $authBoundaryResolved=(Resolve-Path -LiteralPath $authBoundaryScratch).Path
        if([IO.Path]::GetDirectoryName($authBoundaryResolved) -ne $authBoundaryRoot -or [IO.Path]::GetFileName($authBoundaryResolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $authBoundaryResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){
            throw 'Refusing cleanup outside owned scratch'
        }
        Remove-Item -LiteralPath $authBoundaryResolved -Recurse -Force
    }
    Write-Output ('CLEANED auth-boundary-build-cache='+(-not (Test-Path -LiteralPath $authBoundaryScratch)))
}
