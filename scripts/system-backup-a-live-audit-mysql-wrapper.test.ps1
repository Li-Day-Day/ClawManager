# Run the actual wrapper using in-process Go/SSH/SCP/Node fixtures. No builds,
# remote connections or database acceptance take place in this test.
$ErrorActionPreference='Stop'
$wrapperTestRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$wrapperTestNodeExecutable=@(Get-Command node -CommandType Application)[0].Source
$wrapperTestCommands=@('go','ssh','scp','node')
foreach($name in $wrapperTestCommands){
    if(Test-Path ('Function:global:'+$name)){throw 'Refusing to replace an existing function'}
}
$global:CollectorWrapperFixture=$null
function global:go {
    $global:LASTEXITCODE=0
    $state=$global:CollectorWrapperFixture
    $state.go_calls++
    if($args[0] -eq 'env'){
        Write-Output (@{GOTELEMETRY='off';GOTELEMETRYDIR=$env:TEST_TELEMETRY_DIR}|ConvertTo-Json -Compress)
        return
    }
    $index=[Array]::IndexOf([string[]]$args,'-o')
    if($index -ge 0){
        $state.binary=[string]$args[$index+1]
        [IO.File]::WriteAllText($state.binary,'offline wrapper fixture binary')
        $state.owned=[IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($state.binary))
    }
}
function global:scp {
    $state=$global:CollectorWrapperFixture
    $state.scp_calls++
    if($state.mode.StartsWith('startup')){
        if($args.Count -ne 3 -or [string]$args[1] -notmatch 'probe\.sh$'){throw 'Startup diagnostic uploaded a binary'}
        $state.owned=[IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName([string]$args[1]))
    }
    $global:LASTEXITCODE=0
}
function global:ssh {
    $state=$global:CollectorWrapperFixture
    $state.ssh_calls++
    $command=[string]$args[-1]
    if($command -match '/tmp/(aaudit-[0-9]{14}-[a-f0-9]{8})'){$state.id=$Matches[1]}
    $global:LASTEXITCODE=0
    if($command.StartsWith("bash '")){
        if($state.mode -in @('remote_failure','startup_failure')){$global:LASTEXITCODE=23;return}
        if($state.mode -eq 'final_source_drift'){
            $frozen=Join-Path $state.owned 'source/scripts/system-backup-a-live-audit-mysql-review.mjs'
            [IO.File]::AppendAllText($frozen,"`n// offline test changes only the disposable frozen copy`n")
        }
        Write-Output 'OFFLINE_WRAPPER_FIXTURE_ONLY'
    }
}
function global:node {
    $state=$global:CollectorWrapperFixture
    $state.node_calls++
    if($state.mode -eq 'review_failure'){$global:LASTEXITCODE=1;return}
    if($state.mode -eq 'transcript_drift'){[IO.File]::AppendAllText([string]$args[-1],"`nOFFLINE_LOG_DRIFT`n")}
    $global:LASTEXITCODE=0
    $binarySHA='0'*64
    if($state.mode.StartsWith('startup')){
        if($args[1] -cne '--startup'){throw 'Startup diagnostic used the SQL reviewer'}
    } else {$binarySHA=(Get-FileHash -Algorithm SHA256 -LiteralPath $state.binary).Hash.ToLowerInvariant()}
    Write-Output (@{binary_sha256=$binarySHA;namespace=$state.id;cleanup_verified=$true;fixture='offline_wrapper_commands'}|ConvertTo-Json -Compress)
}
try {
    foreach($name in $wrapperTestCommands){if((Get-Command $name).CommandType -ne 'Function'){throw 'Offline command fixture was not selected'}}
    $rejected=$false
    try {& (Join-Path $PSScriptRoot 'system-backup-a-live-audit-mysql.ps1') -StartupOnly} catch {$rejected=$true}
    if(-not $rejected){throw 'StartupOnly without Remote was accepted'}
    foreach($mode in @('success','remote_failure','review_failure','final_source_drift','transcript_drift','startup_success','startup_failure')){
        $global:CollectorWrapperFixture=@{mode=$mode;go_calls=0;ssh_calls=0;scp_calls=0;node_calls=0;id='';binary='';owned=''}
        $caught=$false
        try {
            $startup=$mode.StartsWith('startup')
            try {& (Join-Path $PSScriptRoot 'system-backup-a-live-audit-mysql.ps1') -Remote -StartupOnly:$startup -SshTarget 'fixture@127.0.0.1'} catch {$caught=$true}
            $state=$global:CollectorWrapperFixture
            if($state.id -notmatch '^aaudit-[0-9]{14}-[a-f0-9]{8}$'){throw 'Fixture did not reach the wrapper transport'}
            $path=Join-Path $wrapperTestRoot ('docs/evidence/a-live-audit-mysql-'+$state.id+'.json')
            $receipt=Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
            $expectedGo=3;if($startup){$expectedGo=0}
            if($state.go_calls -ne $expectedGo -or $state.ssh_calls -ne 2 -or $state.scp_calls -ne 1){throw 'Unexpected fixture command sequence'}
            if($receipt.evidence_binding_version -ne 1 -or $receipt.run_id -cne $state.id){throw 'Missing evidence run binding'}
            if($receipt.transcript_sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Missing exact transcript byte hash'}
            $expectedSSH=0;if($mode -in @('remote_failure','startup_failure')){$expectedSSH=23}
            if($receipt.ssh_exit -ne $expectedSSH){throw 'SSH exit was not retained'}
            if(-not $receipt.local_cleanup_verified -or (Test-Path -LiteralPath $state.owned)){throw 'Actual wrapper failed to clean its fixture artifacts'}
            if($mode -in @('success','startup_success')){
                $expectedStatus='isolated_mysql_collector_passed';if($startup){$expectedStatus='isolated_mysql_startup_passed'}
                if($caught -or $receipt.status -ne $expectedStatus -or -not $receipt.source_stable){throw 'Successful wrapper fixture failed'}
                if($startup -and (-not $receipt.startup_only -or $receipt.test_vet_passed -or $receipt.linux_test_sha256 -ne '')){throw 'Startup diagnostic claimed Go/SQL validation'}
                if($receipt.stage -ne 'completed' -or $receipt.failure_stage -ne ''){throw 'Successful wrapper retained an incomplete stage'}
                $log=Join-Path $wrapperTestRoot ('docs/evidence/a-live-audit-mysql-'+$state.id+'.txt')
                if((Get-FileHash -Algorithm SHA256 -LiteralPath $log).Hash.ToLowerInvariant() -cne $receipt.transcript_sha256){throw 'Successful receipt does not bind original transcript bytes'}
                # Exercise the actual JS manifest implementation against the
                # real PowerShell-generated order/hash, independently of mocks.
                $paritySource=@'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mysqlSourceDigest,mysqlBundleSourcePins} from './scripts/system-backup-a-live-audit-mysql-bundle.mjs';
const receipt=JSON.parse(readFileSync(process.argv[1]));
assert.equal(mysqlSourceDigest(receipt.files),receipt.source_sha256);
assert.deepEqual([...receipt.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),mysqlBundleSourcePins());
console.log('PASS actual PowerShell/Node source catalog parity');
'@
                Push-Location $wrapperTestRoot
                try {& $wrapperTestNodeExecutable --input-type=module -e $paritySource $path;if($LASTEXITCODE -ne 0){throw 'PowerShell/Node source catalog parity failed'}} finally {Pop-Location}
            } else {
                if(-not $caught -or $receipt.status -ne 'failed'){throw 'Actual wrapper preserved a passing status after failure'}
                if($receipt.source_stable){throw 'Actual wrapper preserved source stability after an incomplete validation'}
                $expectedStage=@{remote_failure='remote_mysql';startup_failure='remote_mysql';review_failure='transcript_review';final_source_drift='final_source_recheck';transcript_drift='transcript_review'}[$mode]
                if($receipt.failure_stage -cne $expectedStage){throw 'Failure stage did not identify the failed gate'}
            }
            if($mode -in @('remote_failure','startup_failure') -and $state.node_calls -ne 0){throw 'Failed SSH result reached the reviewer'}
            Write-Output ('PASS offline actual-wrapper fixture: '+$mode)
        } finally {
            # Simulation receipts deliberately never become acceptance evidence.
            $state=$global:CollectorWrapperFixture
            if($state.id -match '^aaudit-[0-9]{14}-[a-f0-9]{8}$'){
                foreach($suffix in @('.json','.txt')){
                    $path=[IO.Path]::GetFullPath((Join-Path $wrapperTestRoot ('docs/evidence/a-live-audit-mysql-'+$state.id+$suffix)))
                    if([IO.Path]::GetDirectoryName($path) -ne (Join-Path $wrapperTestRoot 'docs/evidence')){throw 'Unsafe simulation receipt cleanup'}
                    if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
                    if(Test-Path -LiteralPath $path){throw 'Simulation receipt remained'}
                }
            }
        }
    }
    Write-Output 'PASS 7 offline wrapper fixtures and missing-Remote rejection; no dependencies installed, builds, SQL or remote contact; simulation receipts removed'
} finally {
    foreach($name in $wrapperTestCommands){Remove-Item -LiteralPath ('Function:global:'+$name) -Force}
    Remove-Variable -Name CollectorWrapperFixture -Scope Global -ErrorAction SilentlyContinue
}
