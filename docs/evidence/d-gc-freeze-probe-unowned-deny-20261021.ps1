param([ValidateSet(2,3,4,5,6,7,8)][int]$Revision=2)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong negative-test owner'}
$prefix=Join-Path $PSScriptRoot 'd-gc-freeze-probe-unowned-deny-20261021'
if($Revision -ge 3){$prefix+=('-r'+$Revision)}
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Negative evidence occupied'}
$env:D_INVARIANT_RUN='';$env:D_INVARIANT_NAMESPACE_UID='';$env:MYSQL_ROOT_PASSWORD=''
$env:TMP=Join-Path $owner 'tmp';$env:TEMP=$env:TMP
& (Join-Path $owner 'd-download-gc-freeze.exe') @('-test.run','^TestDDownloadGCFreezeMySQL$','-test.v','-test.count=1','-test.timeout=15s') 1>($prefix+'.stdout') 2>($prefix+'.stderr')
$negativeExit=$LASTEXITCODE
$output=[IO.File]::ReadAllText($prefix+'.stdout')
if($negativeExit -ne 1 -or -not $output.Contains('owned namespace UID required') -or -not $output.Contains('--- FAIL: TestDDownloadGCFreezeMySQL ') -or $output.Contains('FREEZE_FIXTURE') -or $output.Contains('--- SKIP:')){throw 'Unowned execution did not deny at the namespace boundary'}
[ordered]@{kind='d_gc_freeze_unowned_execution_negative_control';expected_exit=1;actual_exit=$negativeExit;denied_at_owned_namespace_uid=$true;fixture_started=$false;database_environment_cleared=$true;actual_mysql=$false;remote_executed=$false;dependencies_installed=$false;production_approved=$false}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
Write-Output 'PASS freeze unowned execution denied before fixture startup; expected exit=1; actual MySQL not run'
