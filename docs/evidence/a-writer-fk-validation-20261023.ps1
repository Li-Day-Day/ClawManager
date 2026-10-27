$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$aRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$aToken=[guid]::NewGuid().ToString('N')
$aOwner=Join-Path $aRoot ('.tmp-a-writer-fk-'+$aToken)
$aSource=Join-Path $aOwner 'source'
$aStem=Join-Path $PSScriptRoot ('a-writer-fk-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$aToken.Substring(0,8))
$aNames=@('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOPATH','GOMAXPROCS','TEMP','TMP')
$aPrior=@{};foreach($k in $aNames){$aPrior[$k]=[Environment]::GetEnvironmentVariable($k,'Process')}
$aResult=[ordered]@{kind='a_writer_FK_regression_validation.v1';passed=$false;owner=$aOwner;cleanup=$false;old_exit=$null;fixed_exit=$null;error=$null;dependencies_installed=$false;actual_MySQL=$false;production_approved=$false}
function Get-AWriterPaths([string]$Base){
    $p=@(Get-ChildItem -LiteralPath (Join-Path $Base 'backend/internal/systembackupresources') -Recurse -File|ForEach-Object {$_.FullName.Substring($Base.Length+1).Replace('\','/')})
    return @($p+@('contracts/system-backup/v12/schema-registry.json','contracts/system-backup/v12/verifier-contract.schema.json','scripts/system-backup-d-resources-rules-validation.ps1','docs/evidence/a-writer-fk-original-20261023.json','docs/evidence/a-writer-fk-validation-20261023.ps1')|Sort-Object)
}
function Get-AWriterPin([string]$Base,[string]$Relative){
    $b=[IO.File]::ReadAllBytes((Join-Path $Base $Relative));$h=[Security.Cryptography.SHA256]::Create()
    try {$digest=([BitConverter]::ToString($h.ComputeHash($b))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}
    return [ordered]@{path=$Relative;size=$b.Length;sha256=$digest;bytes_base64=[Convert]::ToBase64String($b)}
}
function Get-AWriterEvents([string]$File){return @(Get-Content -LiteralPath $File|ForEach-Object {$line=$_.TrimStart([char]0xfeff);if($line.StartsWith('{')){$line|ConvertFrom-Json}})}
function Run-AWriterGo([string]$Phase,[string]$Pattern){
    Push-Location (Join-Path $aSource 'backend/internal/systembackupresources')
    try {& go test -json -count=1 -timeout=180s -p 2 -run $Pattern . 2>&1|Tee-Object -FilePath ($aStem+'-'+$Phase+'.jsonl')|ForEach-Object {Write-Host $_.ToString()};return $LASTEXITCODE}finally{Pop-Location}
}
Start-Transcript -LiteralPath ($aStem+'.txt') -NoClobber|Out-Null
try {
    [IO.Directory]::CreateDirectory($aOwner)|Out-Null;[IO.File]::WriteAllText((Join-Path $aOwner '.owner'),$aToken)
    $aPaths=Get-AWriterPaths $aRoot;$aInputs=@()
    foreach($p in $aPaths){$pin=Get-AWriterPin $aRoot $p;$dest=Join-Path $aSource $p;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null;[IO.File]::WriteAllBytes($dest,[Convert]::FromBase64String($pin.bytes_base64));if((Get-AWriterPin $aRoot $p).sha256 -ne $pin.sha256 -or (Get-AWriterPin $aSource $p).sha256 -ne $pin.sha256){throw 'Source changed while freezing'};$aInputs+=$pin}
    [IO.File]::WriteAllText(($aStem+'-source.json'),([ordered]@{kind='a_writer_FK_frozen_source.v1';inputs=$aInputs}|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $aResult.source=$aStem+'-source.json'
    foreach($dir in @('cache','tmp','gopath','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $aOwner $dir))|Out-Null}
    $env:GO111MODULE='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $aOwner 'cache';$env:GOTMPDIR=Join-Path $aOwner 'tmp';$env:GOPATH=Join-Path $aOwner 'gopath';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $aOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $telemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $telemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Telemetry is not isolated'}
    $writer='backend/internal/systembackupresources/restore_write.go'
    $fixed=$aInputs|Where-Object {$_.path -eq $writer}
    $original=Get-Content -LiteralPath (Join-Path $aSource 'docs/evidence/a-writer-fk-original-20261023.json') -Raw|ConvertFrom-Json
    if($original.path -ne $writer){throw 'Wrong original writer capsule'}
    [IO.File]::WriteAllBytes((Join-Path $aSource $writer),[Convert]::FromBase64String($original.bytes_base64))
    if((Get-AWriterPin $aSource $writer).sha256 -ne $original.sha256){throw 'Original writer bytes mismatch'}
    $aResult.original_writer_sha256=$original.sha256;$aResult.fixed_writer_sha256=$fixed.sha256
    $aResult.old_exit=Run-AWriterGo 'old' '^TestARestoreWriterReparentsBeforeParentDeletion$'
    $old=Get-AWriterEvents ($aStem+'-old.jsonl')
    $failed=@($old|Where-Object {$_.Action -eq 'fail' -and $_.Test}|ForEach-Object {$_.Test}|Sort-Object)
    $expected=@('TestARestoreWriterReparentsBeforeParentDeletion','TestARestoreWriterReparentsBeforeParentDeletion/items','TestARestoreWriterReparentsBeforeParentDeletion/reports','TestARestoreWriterReparentsBeforeParentDeletion/both','TestARestoreWriterReparentsBeforeParentDeletion/existing_parent')|Sort-Object
    if($aResult.old_exit -eq 0 -or @(Compare-Object $failed $expected).Count -ne 0){throw 'Original writer did not reproduce the exact four Go regression leaves'}
    $aResult.original_failed_tests=$failed
    [IO.File]::WriteAllBytes((Join-Path $aSource $writer),[Convert]::FromBase64String($fixed.bytes_base64))
    $aResult.fixed_exit=Run-AWriterGo 'fixed' '.'
    $events=Get-AWriterEvents ($aStem+'-fixed.jsonl')
    if($aResult.fixed_exit -ne 0 -or @($events|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -ne 0){throw 'Fixed complete resources package failed'}
    foreach($name in @('TestARestoreWriterReparentsBeforeParentDeletion','TestARestoreWriterDeletesChildrenExplicitly','TestARestoreWriterReparentFailureRollsBack')){if(@($events|Where-Object {$_.Test -eq $name -and $_.Action -eq 'pass'}).Count -ne 1){throw 'Required A regression root missing'}}
    $aResult.roots=@($events|Where-Object {$_.Test -and $_.Action -eq 'pass' -and -not $_.Test.Contains('/')}).Count
    $aResult.pass_events=@($events|Where-Object {$_.Test -and $_.Action -eq 'pass'}).Count
    foreach($base in @($aSource,$aRoot)){
        if(((Get-AWriterPaths $base)-join "`n") -cne ($aPaths-join "`n")){throw 'Validation source file set changed'}
        foreach($pin in $aInputs){if((Get-AWriterPin $base $pin.path).sha256 -ne $pin.sha256){throw ('Validation source bytes changed: '+$pin.path)}}
    }
    $aResult.frozen_and_current_postcheck=$true;$aResult.default_vet=$true;$aResult.passed=$true
} catch {$aResult.error=$_.Exception.Message} finally {
    foreach($k in $aNames){[Environment]::SetEnvironmentVariable($k,$aPrior[$k],'Process')}
    if(Test-Path -LiteralPath $aOwner){$resolved=(Resolve-Path -LiteralPath $aOwner).Path;if([IO.Path]::GetDirectoryName($resolved) -cne $aRoot -or [IO.Path]::GetFileName($resolved) -cne ('.tmp-a-writer-fk-'+$aToken) -or (Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint -or [IO.File]::ReadAllText((Join-Path $resolved '.owner')) -cne $aToken){throw 'Unsafe writer regression cleanup target'};Remove-Item -LiteralPath $resolved -Recurse -Force}
    $aResult.cleanup= -not (Test-Path -LiteralPath $aOwner)
    [IO.File]::WriteAllText(($aStem+'.json'),($aResult|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));Write-Host ('A_WRITER_FK_RESULT='+$aStem+'.json');Stop-Transcript|Out-Null
}
if(-not $aResult.passed){throw $aResult.error}
