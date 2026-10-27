$ErrorActionPreference='Stop'
$aInventoryTestRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$aInventoryOwned=Join-Path $aInventoryTestRoot ('.tmp-a-live-inventory-test-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($aInventoryOwned)|Out-Null
$global:aInventoryTestCalls=0
$global:aInventoryTestFailure=$false
$global:aInventoryDatabaseSeen=$false
$global:aInventoryStateSeen=$false
function global:ssh {
    [CmdletBinding(PositionalBinding=$false)]
    param([Parameter(ValueFromPipeline=$true)][string]$InputObject,[Parameter(ValueFromRemainingArguments=$true)][object[]]$Arguments)
    begin {$aInventoryPayload=''}
    process {$aInventoryPayload += $InputObject}
    end {
        $global:aInventoryTestCalls++
        if(($Arguments -join ' ') -notmatch "tr -d '\\015' \| bash -s -- isolated-test"){throw 'Missing final-CR sanitizer'}
        if($aInventoryPayload -notmatch 'A_LIVE_CHAIN_INVENTORY'){throw 'Wrong payload'}
        if($aInventoryPayload -match 'A_LIVE_DB_OBSERVATION'){
            if($aInventoryPayload -notmatch "a_live_db_ns='isolated-test'" -or $aInventoryPayload -notmatch 'information_schema.TABLES'){throw 'Missing pinned SELECT observation'}
            $global:aInventoryDatabaseSeen=$true
        }
        if($aInventoryPayload -match 'mode=state_only'){
            if($aInventoryPayload -match 'NAMESPACES name uid phase' -or $aInventoryPayload -notmatch "a_live_db_server='11111111-2222-3333-4444-555555555555'" -or $aInventoryPayload -notmatch 'BOOTSTRAP_REQUIREMENTS_EXIT'){throw 'State payload lost UUID or repeats full inventory'}
            $global:aInventoryStateSeen=$true
        }
        'A_LIVE_CHAIN_INVENTORY version=1'
        'INVENTORY_COMPLETE live_chain_verified=false'
        $global:LASTEXITCODE=if($global:aInventoryTestFailure){127}else{0}
    }
}
try {
    $aInventoryReceipt=Join-Path $aInventoryOwned 'success.txt'
    & (Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.ps1') -SshTarget 'test@example.invalid' -Namespace 'isolated-test' -OutputPath $aInventoryReceipt
    if([IO.File]::ReadAllText($aInventoryReceipt) -notmatch 'inventory_ssh_exit=0'){throw 'Missing successful final exit'}
    $aInventoryBefore=$global:aInventoryTestCalls
    try {& (Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.ps1') -Namespace 'isolated-test' -OutputPath $aInventoryReceipt;throw 'Overwrite accepted'} catch {if($_.Exception.Message -eq 'Overwrite accepted'){throw}}
    if($global:aInventoryTestCalls -ne $aInventoryBefore){throw 'Existing receipt was contacted remotely'}
    & (Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.ps1') -SshTarget 'test@example.invalid' -Namespace 'isolated-test' -OutputPath (Join-Path $aInventoryOwned 'database.txt') -InspectDatabase -ExpectedNamespaceUid '11111111-2222-3333-4444-555555555555' -MySqlPod 'mysql-test' -ExpectedMySqlPodUid '22222222-3333-4444-5555-666666666666'
    if(-not $global:aInventoryDatabaseSeen){throw 'Database observation was not transmitted'}
    & (Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.ps1') -SshTarget 'test@example.invalid' -Namespace 'isolated-test' -OutputPath (Join-Path $aInventoryOwned 'state.txt') -InspectDatabase -StateOnly -ExpectedNamespaceUid '11111111-2222-3333-4444-555555555555' -MySqlPod 'mysql-test' -ExpectedMySqlPodUid '22222222-3333-4444-5555-666666666666' -ExpectedServerUuid '11111111-2222-3333-4444-555555555555' -AppPod 'app-test' -ExpectedAppPodUid '33333333-4444-5555-6666-777777777777'
    if(-not $global:aInventoryStateSeen){throw 'State-only observation was not transmitted'}
    $global:aInventoryTestFailure=$true
    $aInventoryFailed=Join-Path $aInventoryOwned 'failed.txt'
    try {& (Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.ps1') -Namespace 'isolated-test' -OutputPath $aInventoryFailed;throw 'Failure accepted'} catch {if($_.Exception.Message -eq 'Failure accepted'){throw}}
    if([IO.File]::ReadAllText($aInventoryFailed) -notmatch 'inventory_ssh_exit=127'){throw 'Failure exit not retained'}
    $aInventoryBefore=$global:aInventoryTestCalls
    try {& (Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.ps1') -Namespace 'bad;command' -OutputPath (Join-Path $aInventoryOwned 'unsafe.txt');throw 'Unsafe namespace accepted'} catch {if($_.Exception.Message -eq 'Unsafe namespace accepted'){throw}}
    if($global:aInventoryTestCalls -ne $aInventoryBefore){throw 'Invalid namespace reached transport'}
    Write-Host 'PASS inventory wrapper: final CR sanitizer, success, pinned database payload, no overwrite, remote failure and namespace rejection'
} finally {
    Remove-Item Function:\ssh -ErrorAction SilentlyContinue
    $aInventoryResolved=[IO.Path]::GetFullPath($aInventoryOwned)
    if([IO.Path]::GetDirectoryName($aInventoryResolved) -ne $aInventoryTestRoot -or -not [IO.Path]::GetFileName($aInventoryResolved).StartsWith('.tmp-a-live-inventory-test-')){throw 'Unsafe test cleanup path'}
    Remove-Item -LiteralPath $aInventoryResolved -Force -Recurse
}
