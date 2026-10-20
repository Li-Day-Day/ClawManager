$ErrorActionPreference='Stop'
$chainRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$chainPrefix='d-download-task-chain-current-seed-20261019-r54'
$chainOwner=Join-Path $chainRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$chainExit=1
$chainLog=Join-Path $PSScriptRoot ($chainPrefix+'-native.txt')
$chainJSON=Join-Path $PSScriptRoot ($chainPrefix+'.jsonl')
$chainErr=Join-Path $PSScriptRoot ($chainPrefix+'-stderr.txt')
$chainPattern='^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed|ASQLTaskDownloadOwnersMySQLSeed|DTaskOwnerDownloadChainMySQLSeed)$'
foreach($chainOutput in @($chainLog,$chainJSON,$chainErr,(Join-Path $PSScriptRoot ($chainPrefix+'-source.json')))){if(Test-Path -LiteralPath $chainOutput){throw 'Refusing existing current seed evidence'}}
Start-Transcript -LiteralPath $chainLog -NoClobber|Out-Null
try{
    [IO.Directory]::CreateDirectory($chainOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $chainOwner 'owner.txt'),[IO.Path]::GetFileName($chainOwner))
    . (Join-Path $chainRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $chainRoot 'scripts/system-backup-a-config-proof-source.ps1')
    $chainSnapshot=New-AConfigProofSourceSnapshot -Root $chainRoot -Owner $chainOwner -MaxAttempts 3
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot ($chainPrefix+'-source.json')),($chainSnapshot|ConvertTo-Json -Depth 8))
    Write-Host ('FROZEN files='+$chainSnapshot.files.Count+' sha256='+$chainSnapshot.source_sha256+' owner='+$chainOwner)
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS=''
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $chainOwner 'cache';$env:GOTMPDIR=$chainOwner
    $env:TMP=Join-Path $chainOwner 'tmp';$env:TEMP=$env:TMP
    [IO.Directory]::CreateDirectory($env:TMP)|Out-Null
    $env:TEST_TELEMETRY_DIR=Join-Path $chainOwner 'telemetry'
    [IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off 2026-10-19')
    $chainProcess=Start-Process -FilePath (Get-Command go).Source -ArgumentList @('test','-mod=readonly','-p=2','-count=1','-timeout=900s','-json','-tags','systembackup_mysql','-run',$chainPattern,'./internal/systembackupevidence') -WorkingDirectory (Join-Path $chainOwner 'source/backend') -RedirectStandardOutput $chainJSON -RedirectStandardError $chainErr -WindowStyle Hidden -PassThru -Wait
    Write-Host ('CURRENT_SEED_EXIT='+$chainProcess.ExitCode+' default_vet=yes actual_mysql=no')
    if($chainProcess.ExitCode -ne 0){throw 'Current task owner seed failed; preserve original result'}
    $chainBinary=Join-Path $chainOwner 'task-owner-current.test.exe'
    $chainBuild=Start-Process -FilePath (Get-Command go).Source -ArgumentList @('test','-mod=readonly','-p=2','-c','-tags','systembackup_mysql','-o',$chainBinary,'./internal/systembackupevidence') -WorkingDirectory (Join-Path $chainOwner 'source/backend') -RedirectStandardOutput (Join-Path $PSScriptRoot ($chainPrefix+'-build.txt')) -RedirectStandardError (Join-Path $PSScriptRoot ($chainPrefix+'-build-stderr.txt')) -WindowStyle Hidden -PassThru -Wait
    Write-Host ('CURRENT_SEED_BUILD_EXIT='+$chainBuild.ExitCode)
    if($chainBuild.ExitCode -ne 0){throw 'Current detached probe build failed'}
    $chainDetached=Start-Process -FilePath $chainBinary -ArgumentList @('-test.run',$chainPattern,'-test.v','-test.count=1','-test.timeout=60s') -WorkingDirectory $chainOwner -RedirectStandardOutput (Join-Path $PSScriptRoot ($chainPrefix+'-detached.txt')) -RedirectStandardError (Join-Path $PSScriptRoot ($chainPrefix+'-detached-stderr.txt')) -WindowStyle Hidden -PassThru -Wait
    Write-Host ('CURRENT_SEED_DETACHED_EXIT='+$chainDetached.ExitCode)
    if($chainDetached.ExitCode -ne 0){throw 'Current detached seed failed'}
    Write-Host ('CURRENT_SEED_BINARY sha256='+(Get-FileHash -LiteralPath $chainBinary -Algorithm SHA256).Hash.ToLowerInvariant())
    Test-DIndexSourceSnapshot -Root (Join-Path $chainOwner 'source') -Manifest $chainSnapshot
    Write-Host 'FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'
    $chainExit=0
}finally{
    if(Test-Path -LiteralPath $chainOwner){
        $chainResolved=(Resolve-Path -LiteralPath $chainOwner).Path
        if([IO.Path]::GetDirectoryName($chainResolved) -ne $chainRoot -or [IO.Path]::GetFileName($chainResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $chainResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $chainResolved 'owner.txt')) -ne [IO.Path]::GetFileName($chainResolved)){throw 'Refusing current seed cleanup outside its exact owned directory'}
        if(@(Get-ChildItem -LiteralPath $chainResolved -Force -Recurse -Attributes ReparsePoint).Count){throw 'Current seed owner has redirected children'}
        Remove-Item -LiteralPath $chainResolved -Recurse -Force
    }
    Write-Host ('CLEANED snapshot='+(-not(Test-Path -LiteralPath $chainOwner)))
    Write-Host ('d_task_chain_current_seed_exit='+$chainExit)
    Stop-Transcript|Out-Null
}
exit $chainExit
