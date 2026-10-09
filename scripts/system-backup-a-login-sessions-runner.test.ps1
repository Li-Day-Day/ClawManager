$ErrorActionPreference='Stop'
$aSessionTestRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$aSessionTestScratch=Join-Path $aSessionTestRoot ('.tmp-a-session-runner-'+[guid]::NewGuid().ToString('N'))
$aSessionTestFixture=Join-Path $aSessionTestScratch 'fixture with spaces'
$aSessionTestUTF8=New-Object Text.UTF8Encoding($false)
$aSessionTestEnvironment=@{}
foreach($name in @('A_SESSION_TEST_TRACE','A_SESSION_TEST_FAIL','GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')) {
    $aSessionTestEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
}
try {
    $fixtureInputs=@('scripts/system-backup-a-evidence-validation.ps1','backend/internal/systembackupcontroller/bootstrap.go','contracts/system-backup/v12/a-evidence-gc-migration-proposal.sql')
    $fixtureInputs+=@(Get-ChildItem -LiteralPath (Join-Path $aSessionTestRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | ForEach-Object { 'backend/internal/db/migrations/'+$_.Name })
    foreach($relative in $fixtureInputs) {
        $destination=Join-Path $aSessionTestFixture $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        [IO.File]::Copy((Join-Path $aSessionTestRoot $relative),$destination)
    }
    # Replace only the copied runner's tool boundary. No Go/SSH/provider call
    # is made; tiny output files exercise the runner's hash and cleanup paths.
    $mock=@'
function Initialize-AEvidenceTelemetry { param([string]$Scratch) }
function Invoke-AEvidenceGoStep {
    param([string[]]$Arguments,[string]$Stage)
    Add-Content -LiteralPath $env:A_SESSION_TEST_TRACE -Value (ConvertTo-Json -Compress -InputObject ([ordered]@{arguments=$Arguments;stage=$Stage}))
    if ($env:GOPROXY -ne 'off' -or $env:GOSUMDB -ne 'off' -or $env:GOTOOLCHAIN -ne 'local' -or $env:GOFLAGS -notmatch '-mod=readonly') { throw 'Dependency isolation missing' }
    if ($env:A_SESSION_TEST_FAIL -eq $Stage -or ($env:A_SESSION_TEST_FAIL -eq 'seed' -and ($Arguments -contains '^TestLoginSessionMySQLSeed$' -or $Arguments -contains '^TestLoginStateMySQLSeed$'))) { throw 'Synthetic gate failure' }
    if ($Arguments -contains '-o') {
        $output=$Arguments[[Array]::IndexOf($Arguments,'-o')+1]
        [IO.File]::WriteAllText($output,'synthetic output for runner verification')
    }
}
function Invoke-AEvidenceGoTest { Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupevidence') -Stage 'test-vet' }
function Invoke-AEvidenceNative { throw 'Unexpected remote native command' }
'@
    [IO.File]::WriteAllText((Join-Path $aSessionTestFixture 'scripts/system-backup-a-evidence-go-step.ps1'),$mock,$aSessionTestUTF8)
    $cases=@(
        @{name='session-profile';parameters=@{LoginSessionsOnly=$true};fail='';calls=4;reject=$false;package='./internal/systembackupsecurity'},
        @{name='default-profile-unchanged';parameters=@{};fail='';calls=4;reject=$false;package='./internal/systembackupevidence'},
        @{name='login-state-profile';parameters=@{LoginStateOnly=$true};fail='';calls=4;reject=$false;package='./internal/repository'},
        @{name='login-state-seed-failure';parameters=@{LoginStateOnly=$true};fail='seed';calls=2;reject=$true},
        @{name='login-state-probe-failure';parameters=@{LoginStateOnly=$true};fail='mysql-probe-build';calls=3;reject=$true},
        @{name='login-state-migration-failure';parameters=@{LoginStateOnly=$true};fail='migration-build';calls=4;reject=$true},
        @{name='login-state-reject-sessions';parameters=@{LoginStateOnly=$true;LoginSessionsOnly=$true};fail='';calls=0;reject=$true},
        @{name='login-state-reject-security';parameters=@{LoginStateOnly=$true;IncludeSecurity=$true};fail='';calls=0;reject=$true},
        @{name='login-state-reject-auth';parameters=@{LoginStateOnly=$true;IncludeAuth=$true};fail='';calls=0;reject=$true},
        @{name='login-state-reject-auth-source';parameters=@{LoginStateOnly=$true;AuthSourceOnly=$true};fail='';calls=0;reject=$true},
        @{name='seed-failure-stops-before-build';parameters=@{LoginSessionsOnly=$true};fail='seed';calls=2;reject=$true},
        @{name='probe-failure-stops-before-migration';parameters=@{LoginSessionsOnly=$true};fail='mysql-probe-build';calls=3;reject=$true},
        @{name='migration-failure-cleans-probe';parameters=@{LoginSessionsOnly=$true};fail='migration-build';calls=4;reject=$true},
        @{name='reject-include-security';parameters=@{LoginSessionsOnly=$true;IncludeSecurity=$true};fail='';calls=0;reject=$true},
        @{name='reject-include-auth';parameters=@{LoginSessionsOnly=$true;IncludeAuth=$true};fail='';calls=0;reject=$true},
        @{name='reject-auth-source-only';parameters=@{LoginSessionsOnly=$true;AuthSourceOnly=$true};fail='';calls=0;reject=$true}
    )
    foreach($case in $cases) {
        $env:A_SESSION_TEST_TRACE=Join-Path $aSessionTestScratch ($case.name+'.jsonl')
        $env:A_SESSION_TEST_FAIL=$case.fail
        $parameters=$case.parameters
        $rejected=$false
        $output=@()
        try { $output=@(& (Join-Path $aSessionTestFixture 'scripts/system-backup-a-evidence-validation.ps1') @parameters) } catch { $rejected=$true }
        if ($rejected -ne $case.reject) { throw ('Unexpected runner outcome: '+$case.name) }
        $calls=@()
        if(Test-Path -LiteralPath $env:A_SESSION_TEST_TRACE) { $calls=@(Get-Content -LiteralPath $env:A_SESSION_TEST_TRACE | ForEach-Object { $_ | ConvertFrom-Json }) }
        if($calls.Count -ne $case.calls) { throw ('Unexpected Go call count: '+$case.name) }
        if(@(Get-ChildItem -LiteralPath $aSessionTestFixture -Directory -Force -Filter '.tmp-a-evidence-*').Count -ne 0) { throw ('Runner failed to clean scratch: '+$case.name) }
        foreach($name in $aSessionTestEnvironment.Keys) {
            if($name -notlike 'A_SESSION_TEST_*' -and [Environment]::GetEnvironmentVariable($name,'Process') -cne $aSessionTestEnvironment[$name]) { throw ('Runner did not restore '+$name) }
        }
        if(-not $rejected) {
            if($calls[0].arguments[-1] -cne $case.package -or $calls[2].arguments[-1] -cne $case.package) { throw 'Probe package selection changed' }
            $seed=if($parameters.LoginStateOnly){'^TestLoginStateMySQLSeed$'}elseif($parameters.LoginSessionsOnly){'^TestLoginSessionMySQLSeed$'}else{'^TestMySQLAuthoritySeed$'}
            if($calls[1].arguments -notcontains $seed -or $calls[2].arguments -notcontains '-c' -or $calls[3].arguments[-1] -cne './cmd/system-backup-migrate') { throw 'Seed/build sequence changed' }
            $ddl=''
            $specs=if($parameters.LoginSessionsOnly){@(@('001_init_schema.sql','users'),@('001_init_schema.sql','audit_logs'))}else{@(@('065_add_system_backup_control_metadata_core.sql','system_backup_evidence'),@('065_add_system_backup_control_metadata_core.sql','system_backup_evidence_chunks'))}
            foreach($spec in $specs) {
                $sql=[IO.File]::ReadAllText((Join-Path $aSessionTestRoot ('backend/internal/db/migrations/'+$spec[0]))).Replace("`r`n","`n")
                $match=[regex]::Matches($sql,('(?ms)^CREATE TABLE IF NOT EXISTS '+$spec[1]+' \(.*?^\) ENGINE=InnoDB[^;]*;'))
                if($match.Count -ne 1) { throw 'DDL source ambiguous' }
                $ddl+=$match[0].Value+"`n"
            }
            $extra=if($parameters.LoginSessionsOnly){'backend/internal/db/migrations/080_add_system_backup_registration_runtime.sql'}else{'contracts/system-backup/v12/a-evidence-gc-migration-proposal.sql'}
            $ddl+=[IO.File]::ReadAllText((Join-Path $aSessionTestRoot $extra)).Replace("`r`n","`n")+"`n"
            if($parameters.LoginStateOnly) {
                $source=[IO.File]::ReadAllText((Join-Path $aSessionTestRoot 'backend/internal/systembackupcontroller/bootstrap.go'))
                $pin=[regex]::Match($source,'ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"').Groups[1].Value
                $names=@(Get-ChildItem -LiteralPath (Join-Path $aSessionTestRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object { $_.Name })
                $ddl=ConvertTo-Json -Depth 4 -InputObject ([ordered]@{kind='a_login_state_probe_inputs';catalog_sha256=$pin;filenames=$names})
            }
            $sha=[Security.Cryptography.SHA256]::Create()
            try { $hash=([BitConverter]::ToString($sha.ComputeHash($aSessionTestUTF8.GetBytes($ddl)))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
            if(($output -join "`n") -notmatch ('ddl_sha256='+$hash) -or ($output -join "`n") -notmatch 'CLEANED local-registration-build-cache=True') { throw 'DDL binding or cleanup receipt missing' }
        }
        Write-Output ('PASS '+$case.name)
    }
    Write-Output ('PASS login session/state runner: '+$cases.Count+' cases; tools mocked, no builds or remote calls')
} finally {
    foreach($name in $aSessionTestEnvironment.Keys) {
        if($null -eq $aSessionTestEnvironment[$name]) { Remove-Item -LiteralPath ('Env:'+ $name) -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name,$aSessionTestEnvironment[$name],'Process') }
    }
    if(Test-Path -LiteralPath $aSessionTestScratch) {
        $resolved=(Resolve-Path -LiteralPath $aSessionTestScratch).Path
        if([IO.Path]::GetDirectoryName($resolved) -ne $aSessionTestRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-a-session-runner-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing cleanup outside owned runner fixture' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
        if(Test-Path -LiteralPath $resolved) { throw 'Runner fixture cleanup failed' }
        Write-Output 'CLEANED login-session-runner-fixture=True'
    }
}
