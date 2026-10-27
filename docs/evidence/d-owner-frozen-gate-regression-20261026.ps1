[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputPrefix)
$ErrorActionPreference='Stop'
$gateRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gatePrefix=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPrefix)
if([IO.Path]::GetDirectoryName($gatePrefix) -ne (Join-Path $gateRoot 'docs/evidence')){throw 'Evidence prefix must be directly in docs/evidence'}
if(Test-Path -LiteralPath ($gatePrefix+'.json')){throw 'Choose a fresh evidence prefix'}
$gateOwner=Join-Path $gateRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $gateOwner){throw 'Test owner already exists'}
$gateSavedFixture=$env:D_OWNER_FROZEN_GATE_FIXTURE
$gateSavedPath=$env:PATH
$gateRecords=[Collections.Generic.List[object]]::new()
$gateError=$null
$gateCode=@('scripts/system-backup-d-config-writer-validation.ps1','docs/evidence/a-download-owner-role-retest-20261021.ps1','docs/evidence/a-download-retest-source-preflight-20261021.mjs','docs/evidence/a-download-owners-actual-review-20261020.mjs','docs/evidence/a-owner-final-source-20261026.json','docs/evidence/d-owner-frozen-gate-predecessor-wrapper-20261026.txt','docs/evidence/d-owner-frozen-gate-predecessor-entry-20261026.txt','docs/evidence/d-owner-frozen-gate-regression-20261026.ps1')
function Gate-Pin([string]$Path){[ordered]@{path=$Path;sha256=(Get-FileHash -LiteralPath (Join-Path $gateRoot $Path) -Algorithm SHA256).Hash.ToLowerInvariant()}}
$gateBefore=@($gateCode|ForEach-Object {Gate-Pin $_})
function Gate-Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
$gateUTF8=[Text.UTF8Encoding]::new($false)
function Gate-Write([string]$Path,[string]$Text){[IO.File]::WriteAllText($Path,$Text,$gateUTF8)}
function Gate-Case([string]$Name,[string]$Mutation='none',[string]$Mode='Owners',[string]$Fault='none',[switch]$Predecessor,[switch]$Local,[switch]$InvalidProfile){
    $caseRoot=Join-Path $gateOwner $Name
    foreach($dir in @('scripts','docs/evidence','stub')){[IO.Directory]::CreateDirectory((Join-Path $caseRoot $dir))|Out-Null}
    $env:D_OWNER_FROZEN_GATE_FIXTURE=$caseRoot
    $approved=Get-Content -LiteralPath (Join-Path $gateRoot 'docs/evidence/a-owner-final-source-20261026.json') -Raw|ConvertFrom-Json
    $snapshot=$approved|ConvertTo-Json -Depth 20|ConvertFrom-Json
    if($Mutation -eq 'ordinary'){
        $changed=$snapshot.files|Where-Object {$_.path -eq 'backend/internal/systembackupsecurity/config_bootstrap_transaction.go'}
        Gate-Assert ($null -ne $changed) 'Missing ordinary fixture input'
        $changed.sha256=('0'*64)
    }elseif($Mutation -eq 'script'){
        $changed=$snapshot.files|Where-Object {$_.path -eq 'scripts/system-backup-d-config-writer-validation.ps1'}
        Gate-Assert ($null -ne $changed) 'Missing script fixture input'
        $changed.sha256=('0'*64)
    }
    $pinLines=@($snapshot.files|ForEach-Object {($_.path+"`0"+$_.sha256+"`0"+$_.size)})
    $snapshot.source_sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($gateUTF8.GetBytes(($pinLines -join "`n")+"`n"))).ToLowerInvariant()
    if($Fault -eq 'malformed_snapshot'){$snapshot.files=@()}
    Gate-Write (Join-Path $caseRoot 'approved.json') ($approved|ConvertTo-Json -Depth 20)
    Gate-Write (Join-Path $caseRoot 'snapshot.json') ($snapshot|ConvertTo-Json -Depth 20)
    Gate-Write (Join-Path $caseRoot 'settings.json') (@{fault=$Fault;retry=($Mutation -eq 'ordinary')}|ConvertTo-Json)
    $wrapperSource=if($Predecessor){'docs/evidence/d-owner-frozen-gate-predecessor-wrapper-20261026.txt'}else{'scripts/system-backup-d-config-writer-validation.ps1'}
    $entrySource=if($Predecessor){'docs/evidence/d-owner-frozen-gate-predecessor-entry-20261026.txt'}else{'docs/evidence/a-download-owner-role-retest-20261021.ps1'}
    [IO.File]::Copy((Join-Path $gateRoot $wrapperSource),(Join-Path $caseRoot 'scripts/system-backup-d-config-writer-validation.ps1'))
    [IO.File]::Copy((Join-Path $gateRoot $entrySource),(Join-Path $caseRoot 'docs/evidence/a-download-owner-role-retest-20261021.ps1'))
    $realGateURI=([Uri]::new((Join-Path $gateRoot 'docs/evidence/a-download-retest-source-preflight-20261021.mjs'))).AbsoluteUri
    Gate-Write (Join-Path $caseRoot 'docs/evidence/a-download-retest-source-preflight-20261021.mjs') ('import '+($realGateURI|ConvertTo-Json -Compress)+';')
    # The exact entry/wrapper and real registered-baseline parser run. Only the
    # expensive snapshot copier, dispatch, Go/SSH and actual SQL receiver are
    # fixture substitutes. No fixture success is actual SQL or build evidence.
    Gate-Write (Join-Path $caseRoot 'scripts/system-backup-d-index-source-snapshot.ps1') @'
function Get-DIndexSourceFiles {param($Root) (Get-Content -LiteralPath (Join-Path $env:D_OWNER_FROZEN_GATE_FIXTURE 'approved.json') -Raw|ConvertFrom-Json).files.path}
function Get-DIndexInputPins {param($Root,$Files) (Get-Content -LiteralPath (Join-Path $env:D_OWNER_FROZEN_GATE_FIXTURE 'approved.json') -Raw|ConvertFrom-Json).files}
function Test-DIndexSourceSnapshot {param($Root,$Manifest) Add-Content -LiteralPath (Join-Path $env:D_OWNER_FROZEN_GATE_FIXTURE 'events.txt') -Value 'POSTCHECK_MOCK'}
'@
    Gate-Write (Join-Path $caseRoot 'scripts/system-backup-a-config-proof-source.ps1') @'
function New-AConfigProofSourceSnapshot {
    param($Root,$Owner,$MaxAttempts)
    $fixture=$env:D_OWNER_FROZEN_GATE_FIXTURE
    $settings=Get-Content -LiteralPath (Join-Path $fixture 'settings.json') -Raw|ConvertFrom-Json
    if($settings.retry){Write-Host 'MOCK_CAPTURE attempt1=source_changed attempt2=stable_new_ordinary_bytes'}
    Add-Content -LiteralPath (Join-Path $fixture 'events.txt') -Value 'SNAPSHOT_MOCK'
    $frozenScripts=Join-Path $Owner 'source/scripts'
    [IO.Directory]::CreateDirectory($frozenScripts)|Out-Null
    foreach($f in Get-ChildItem -LiteralPath (Join-Path $fixture 'stub') -File){[IO.File]::Copy($f.FullName,(Join-Path $frozenScripts $f.Name))}
    $checker=Join-Path $fixture 'docs/evidence/a-download-retest-source-preflight-20261021.mjs'
    switch($settings.fault){
        'missing_checker' {Remove-Item -LiteralPath $checker}
        'invalid_json' {[IO.File]::WriteAllText($checker,'console.log("{bad JSON");')}
        'nonzero_ready' {[IO.File]::WriteAllText($checker,'console.log(JSON.stringify({status:"ready_for_original_snapshot_gate",reviewed_source_sha256:"1".repeat(64),actual_sql:false,tests_started:false}));process.exitCode=7;')}
        'typed_false' {[IO.File]::WriteAllText($checker,'console.log(JSON.stringify({status:"ready_for_original_snapshot_gate",reviewed_source_sha256:"1".repeat(64),actual_sql:"false",tests_started:false}));')}
        'missing_node' {$env:PATH=''}
    }
    return (Get-Content -LiteralPath (Join-Path $fixture 'snapshot.json') -Raw|ConvertFrom-Json)
}
'@
    $marker='Add-Content -LiteralPath (Join-Path $env:D_OWNER_FROZEN_GATE_FIXTURE ''events.txt'') -Value '
    Gate-Write (Join-Path $caseRoot 'stub/system-backup-a-evidence-dispatch.test.ps1') ($marker+'''COMMON_DISPATCH_MOCK''')
    foreach($dispatchScriptName in @('system-backup-a-download-owners-dispatch.test.ps1','system-backup-a-download-gc-role-dispatch.test.ps1')){
        Gate-Write (Join-Path $caseRoot ('stub/'+$dispatchScriptName)) ($marker+'''DISPATCH_MOCK''')
    }
    Gate-Write (Join-Path $caseRoot 'stub/system-backup-a-evidence-validation.ps1') ($marker+'''VALIDATION_MOCK_NO_GO_NO_SSH''')
    $eventLiteral=(Join-Path $caseRoot 'events.txt')|ConvertTo-Json -Compress
    foreach($receiverScriptName in @('a-download-owners-actual-review-20261020.mjs','a-download-gc-role-actual-review-20261021.mjs')){
        Gate-Write (Join-Path $caseRoot ('docs/evidence/'+$receiverScriptName)) ('import fs from "node:fs";fs.appendFileSync('+$eventLiteral+',"RECEIVER_MOCK_NO_SQL_ACCEPTANCE\n");')
    }
    $captured=[Collections.Generic.List[string]]::new()
    $success=$false;$message=''
    Push-Location $caseRoot
    try {
        if($Local -or $InvalidProfile){
            $argsForCase=@{SourceManifestPath=(Join-Path $caseRoot 'docs/evidence/direct-source.json')}
            if($InvalidProfile){$argsForCase.RequireReviewedOwnerBaseline=$true;$argsForCase.DownloadOwnersOnly=$true}
            else {$argsForCase.DownloadOwnersOnly=$true}
            & (Join-Path $caseRoot 'scripts/system-backup-d-config-writer-validation.ps1') @argsForCase *>&1|ForEach-Object {$captured.Add($_.ToString())}
        }else {
            & (Join-Path $caseRoot 'docs/evidence/a-download-owner-role-retest-20261021.ps1') -Mode $Mode *>&1|ForEach-Object {$captured.Add($_.ToString())}
        }
        $success=$true
    }catch{$message=$_.Exception.Message;$captured.Add($_.ToString())}
    finally {Pop-Location;$env:PATH=$gateSavedPath}
    $events=if(Test-Path -LiteralPath (Join-Path $caseRoot 'events.txt')){@(Get-Content -LiteralPath (Join-Path $caseRoot 'events.txt'))}else{@()}
    $left=@(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter '.tmp-d-index-cache-*')
    Gate-Assert ($left.Count -eq 0) ($Name+': runner owner not cleaned')
    $allowed=$Predecessor -or $Local -or ($Fault -eq 'none' -and $Mutation -ne 'ordinary' -and -not $InvalidProfile)
    Gate-Assert ($success -eq [bool]$allowed) ($Name+': unexpected success='+$success+' '+$message)
    $dispatch=@($events|Where-Object {$_ -eq 'DISPATCH_MOCK'}).Count
    $validation=@($events|Where-Object {$_ -eq 'VALIDATION_MOCK_NO_GO_NO_SSH'}).Count
    Gate-Assert ($dispatch -eq [int]$allowed -and $validation -eq [int]$allowed) ($Name+': protected stage dispatch mismatch')
    if($Mutation -eq 'ordinary' -and -not $Predecessor -and -not $Local){Gate-Assert (($captured -join "`n") -match 'ordinary_source_changed_requires_reviewed_baseline') ($Name+': not the precise frozen-baseline rejection')}
    if(-not $Local -and -not $InvalidProfile){Gate-Assert (($captured -join "`n") -match 'ready_for_original_snapshot_gate') ($Name+': early original preflight did not pass')}
    if($allowed -and -not $Predecessor -and -not $Local){Gate-Assert (($captured -join "`n") -match 'LOCAL_PASS owner-baseline-frozen=yes') ($Name+': exact frozen gate missing')}
    $log=$gatePrefix+'-'+$Name+'.log'
    if(Test-Path -LiteralPath $log){throw 'Evidence log already exists'}
    Gate-Write $log (($captured -join "`n")+"`n")
    $record=[ordered]@{name=$Name;expected_mock_dispatch=[bool]$allowed;invocation_succeeded=$success;snapshot_mutation=$Mutation;fault=$Fault;dispatch_mock_calls=$dispatch;validation_mock_calls=$validation;events=$events;runner_owner_absent=$true;log=[ordered]@{path=$log;sha256=(Get-FileHash -LiteralPath $log).Hash.ToLowerInvariant()}}
    $gateRecords.Add($record)
    Write-Output ('PASS '+$Name+' mock_dispatch='+$dispatch+' actual_Go=no actual_SSH=no')
}
try {
    [IO.Directory]::CreateDirectory($gateOwner)|Out-Null
    Gate-Case 'predecessor_ready_then_retry_new_source_reaches_dispatch' 'ordinary' -Predecessor
    Gate-Case 'owners_ready_then_retry_new_source_rejected' 'ordinary'
    Gate-Case 'role_ready_then_retry_new_source_rejected' 'ordinary' 'Role'
    Gate-Case 'approved_owners_snapshot' 'none'
    Gate-Case 'approved_role_snapshot' 'none' 'Role'
    Gate-Case 'script_only_snapshot_change_is_not_ordinary_drift' 'script'
    Gate-Case 'checker_disappears_after_early_ready' 'none' 'Owners' 'missing_checker'
    Gate-Case 'checker_invalid_json' 'none' 'Owners' 'invalid_json'
    Gate-Case 'checker_nonzero_with_ready_json' 'none' 'Owners' 'nonzero_ready'
    Gate-Case 'checker_wrong_boolean_type' 'none' 'Owners' 'typed_false'
    Gate-Case 'node_unavailable_after_early_ready' 'none' 'Owners' 'missing_node'
    Gate-Case 'malformed_frozen_snapshot' 'none' 'Owners' 'malformed_snapshot'
    Gate-Case 'local_new_source_preparation_does_not_require_old_baseline' 'ordinary' -Local
    Gate-Case 'require_gate_on_nonremote_profile_rejected' 'none' -InvalidProfile
}catch{$gateError=$_.Exception.Message;Write-Output ('FAIL '+$gateError)}
finally {
    $env:D_OWNER_FROZEN_GATE_FIXTURE=$gateSavedFixture;$env:PATH=$gateSavedPath
    if(Test-Path -LiteralPath $gateOwner){
        $resolved=(Resolve-Path -LiteralPath $gateOwner).Path
        if([IO.Path]::GetDirectoryName($resolved) -ne $gateRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing regression cleanup outside exact test owner'}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    $gateAfter=@($gateCode|ForEach-Object {Gate-Pin $_})
    $stable=($gateBefore|ConvertTo-Json -Compress) -ceq ($gateAfter|ConvertTo-Json -Compress)
    $report=[ordered]@{kind='d_owner_frozen_baseline_gate_mock_regression.v1';error=$gateError;cases=$gateRecords;input_pins=$gateBefore;inputs_stable=$stable;owner=$gateOwner;owner_removed=(-not (Test-Path -LiteralPath $gateOwner));real_snapshot_copy_executed=$false;real_registered_baseline_parser_executed=$true;predecessor_counterexample_is_mock_only=$true;Go_or_builds_run=$false;SSH_or_SQL_executed=$false;dependencies_installed=$false;production_approved=$false}
    Gate-Write ($gatePrefix+'.json') ($report|ConvertTo-Json -Depth 16)
}
if($gateError -or -not $stable){exit 1}
Write-Output ('FROZEN_GATE_REGRESSION_PASS cases='+$gateRecords.Count+' owner_removed=yes Go=no SSH=no')
exit 0
