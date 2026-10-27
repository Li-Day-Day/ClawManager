$ErrorActionPreference='Stop'
$httpReviewRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
function Assert-HTTPSource([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Get-HTTPSourcePin([string]$Path){
    $item=Get-Item -LiteralPath (Join-Path $httpReviewRoot $Path)
    [ordered]@{path=$Path;size=$item.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()}
}
function Get-HTTPSourceAST([string]$Path){
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $httpReviewRoot $Path),[ref]$tokens,[ref]$errors)
    Assert-HTTPSource ($errors.Count -eq 0) ('PowerShell parse failure: '+$Path)
    return $ast
}
function Get-HTTPGoArrays($AST){
    @($AST.FindAll({param($n)$n -is [Management.Automation.Language.ArrayExpressionAst] -and $n.Extent.Text.Contains('./cmd/server/system_backup_read_live.go')},$true) | ForEach-Object {
        $values=@($_.SafeGetValue())
        [pscustomobject]@{values=$values;files=@($values | Where-Object {$_ -cmatch '^\./cmd/server/[a-z0-9_]+\.go$'})}
    })
}
$httpHarness='scripts/system-backup-a-evidence-validation.ps1'
$httpNative='scripts/system-backup-d-event-api-native-validation.ps1'
$httpDocker='scripts/system-backup-d-task-read-local-validation.ps1'
$httpWrapper='scripts/system-backup-d-verification-detail-validation.ps1'
$httpArrays=@(Get-HTTPGoArrays (Get-HTTPSourceAST $httpHarness))
Assert-HTTPSource ($httpArrays.Count -eq 2) 'Expected one ordinary and one tagged HTTP source array'
$httpOrdinary=@($httpArrays | Where-Object {$_.values -contains 'test'})
$httpTagged=@($httpArrays | Where-Object {$_.values -notcontains 'test'})
Assert-HTTPSource ($httpOrdinary.Count -eq 1 -and $httpTagged.Count -eq 1) 'HTTP source array roles ambiguous'
$httpNativeArrays=@(Get-HTTPGoArrays (Get-HTTPSourceAST $httpNative))
Assert-HTTPSource ($httpNativeArrays.Count -eq 1) 'Native HTTP invocation ambiguous'
$httpDockerAST=Get-HTTPSourceAST $httpDocker
$httpShell=@($httpDockerAST.FindAll({param($n)$n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.Contains('LOCAL_STAGE live-read-http-focused')},$true))
Assert-HTTPSource ($httpShell.Count -eq 1) 'Docker shell fixture ambiguous'
$httpDockerCommand=@($httpShell[0].Value -split "`n" | Where-Object {$_ -match '^go test .*system_backup_read_live\.go'})
Assert-HTTPSource ($httpDockerCommand.Count -eq 1) 'Docker HTTP go command ambiguous'
$httpDockerFiles=@([regex]::Matches($httpDockerCommand[0],'\./cmd/server/[a-z0-9_]+\.go') | ForEach-Object {$_.Value})
$httpSets=[ordered]@{admin_read=@($httpOrdinary[0].files);event_native=@($httpNativeArrays[0].files);task_read_container=$httpDockerFiles}
$httpCanonical=(@($httpSets.admin_read | Sort-Object -CaseSensitive) -join "`n")
foreach($httpSetName in $httpSets.Keys){
    Assert-HTTPSource ((@($httpSets[$httpSetName] | Sort-Object -CaseSensitive) -join "`n") -ceq $httpCanonical) ('Untested alternate HTTP file set: '+$httpSetName)
}
foreach($httpRequired in @('./cmd/server/system_backup_read_cursor_key.go','./cmd/server/system_backup_read_cursor_key_test.go')){
    Assert-HTTPSource ($httpSets.admin_read -ccontains $httpRequired) ('Cursor dependency or its tests omitted: '+$httpRequired)
}
foreach($httpFile in @($httpSets.admin_read)+@('./cmd/server/system_backup_read_live_mysql_test.go','./cmd/server/system_backup_read_verification_history_mysql_test.go')){
    Assert-HTTPSource ($httpTagged[0].files -ccontains $httpFile) ('Tagged HTTP build omits tested dependency or history probe: '+$httpFile)
}
$httpOldStem='docs/evidence/d-verification-detail-remote-20261022-150230-2e5ffbcd'
$httpNewStem='docs/evidence/d-verification-http-source-repair-20261022'
$httpOldLogPath=$httpOldStem+'.txt';$httpOldSourcePath=$httpOldStem+'-source.json';$httpOldResultPath=$httpOldSourcePath+'.result.json'
$httpNewLogPath=$httpNewStem+'-local.txt';$httpNewSourcePath=$httpNewStem+'-source.json';$httpNewResultPath=$httpNewSourcePath+'.result.json'
$httpOldLog=[IO.File]::ReadAllText((Join-Path $httpReviewRoot $httpOldLogPath))
$httpNewLog=[IO.File]::ReadAllText((Join-Path $httpReviewRoot $httpNewLogPath))
$httpOldSource=Get-Content -Raw -LiteralPath (Join-Path $httpReviewRoot $httpOldSourcePath) | ConvertFrom-Json
$httpNewSource=Get-Content -Raw -LiteralPath (Join-Path $httpReviewRoot $httpNewSourcePath) | ConvertFrom-Json
$httpOldResult=Get-Content -Raw -LiteralPath (Join-Path $httpReviewRoot $httpOldResultPath) | ConvertFrom-Json
$httpNewResult=Get-Content -Raw -LiteralPath (Join-Path $httpReviewRoot $httpNewResultPath) | ConvertFrom-Json
Assert-HTTPSource ($httpOldLog.Contains('undefined: loadBackupReadCursorKey') -and $httpOldLog.Contains('remote validation has not started')) 'Original compile failure/before-remote boundary missing'
Assert-HTTPSource ($httpOldResult.status -ceq 'failed' -and $httpOldResult.child_exit -eq 1 -and -not $httpOldResult.source_postcheck -and $httpOldResult.source_sha256 -ceq $httpOldSource.source_sha256) 'Original result receipt changed'
foreach($httpGoFile in @('./cmd/server/system_backup_read_cursor_key.go','./cmd/server/system_backup_read_cursor_key_test.go')){
    $httpOriginalKeyPin=@($httpOldSource.files | Where-Object path -CEQ ('backend/'+$httpGoFile.Substring(2)))
    $httpRepairedKeyPin=@($httpNewSource.files | Where-Object path -CEQ ('backend/'+$httpGoFile.Substring(2)))
    Assert-HTTPSource ($httpOriginalKeyPin.Count -eq 1 -and $httpRepairedKeyPin.Count -eq 1 -and $httpOriginalKeyPin[0].sha256 -ceq $httpRepairedKeyPin[0].sha256) 'Cursor dependency changed between the failed and repaired runs; review separately'
}
Assert-HTTPSource ($httpNewResult.status -ceq 'profile_completed_actual_results_require_review' -and $httpNewResult.child_exit -eq 0 -and $httpNewResult.source_postcheck -and -not $httpNewResult.remote_requested -and -not $httpNewResult.freeze_only -and -not $httpNewResult.actual_mysql_results_accepted -and $httpNewResult.source_sha256 -ceq $httpNewSource.source_sha256) 'Local full detail profile has not completed successfully'
Assert-HTTPSource ($httpNewLog -match '(?m)^verification_detail_http_exit=0\r?$' -and $httpNewLog -notmatch '(?m)^RUN namespace=|^--- FAIL:|^FAIL[ \t]') 'Local exit/failure/remote boundary invalid'
foreach($httpRequiredMarker in @('clawreef/internal/systembackupread','clawreef/internal/systembackupsecurity','command-line-arguments','LOCAL_PASS a-admin-read-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run','LOCAL_PASS d-admin-read-http-probe-compiled=yes','LOCAL_PASS pinned-migration-runner-compiled=yes','LOCAL_PASS verification-detail-frozen-postcheck=yes freeze-only=False dependencies-installed=no remote-requested=False')){
    Assert-HTTPSource ($httpNewLog.Contains($httpRequiredMarker)) ('Local full profile marker missing: '+$httpRequiredMarker)
}
. (Join-Path $httpReviewRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
foreach($httpSource in @($httpOldSource,$httpNewSource)){
    Assert-HTTPSource ((Get-DIndexPinDigest -Pins $httpSource.files) -ceq $httpSource.source_sha256) 'Source manifest digest invalid'
}
$httpCriticalPaths=@($httpHarness,$httpNative,$httpDocker,$httpWrapper)+@($httpTagged[0].files | ForEach-Object {'backend/'+$_.Substring(2)})
$httpConcurrentOverlay=$null
$httpCurrentPins=@(foreach($httpPath in $httpCriticalPaths){
    $httpPin=Get-HTTPSourcePin $httpPath
    $httpFrozen=@($httpNewSource.files | Where-Object path -CEQ $httpPath)
    Assert-HTTPSource ($httpFrozen.Count -eq 1) ('Tested critical input missing: '+$httpPath)
    if($httpFrozen[0].sha256 -cne $httpPin.sha256){
        Assert-HTTPSource ($httpPath -ceq $httpHarness) ('Current critical input differs from tested version: '+$httpPath)
        # Preserve both versions. Accept only the exact independently reversible
        # owner-profile budget change; do not replace the tested source digest.
        $httpAfterBytes=[IO.File]::ReadAllBytes((Join-Path $httpReviewRoot $httpPath))
        $httpAfterText=[Text.Encoding]::UTF8.GetString($httpAfterBytes)
        $httpOwnerCondition='if($ConfigDownloadGCFreezeOnly -or $ConfigDownloadOwnersOnly)'
        Assert-HTTPSource ([regex]::Matches($httpAfterText,[regex]::Escape($httpOwnerCondition)).Count -eq 1) 'Owner budget overlay condition ambiguous'
        $httpOwnerComments='(?m)^[ \t]*# Both freeze and owner profiles exceeded 900s on this host\.\r?\n[ \t]*# The owner 2026-10-22 run timed out while testing''s TempDir\r?\n[ \t]*# cleanup was running, without an assertion failure\. Preserve\r?\n[ \t]*# every test and vet check; only the package budget changes\.\r?\n[ \t]*# Other profiles and production deadlines stay unchanged\.\r?\n'
        Assert-HTTPSource ([regex]::Matches($httpAfterText,$httpOwnerComments).Count -eq 1) 'Owner budget overlay comments ambiguous'
        $httpBeforeText=$httpAfterText.Replace($httpOwnerCondition,'if($ConfigDownloadGCFreezeOnly)')
        $httpBeforeText=[regex]::Replace($httpBeforeText,$httpOwnerComments,("                    # The freeze profile's full package exceeded 900s on this host.`n                    # Existing profiles and production deadlines stay unchanged.`n"))
        $httpBeforeBytes=[Text.Encoding]::UTF8.GetBytes($httpBeforeText)
        $httpOverlayHasher=[Security.Cryptography.SHA256]::Create()
        try{
            $httpBeforeHash=([BitConverter]::ToString($httpOverlayHasher.ComputeHash($httpBeforeBytes))).Replace('-','').ToLowerInvariant()
            $httpAfterHash=([BitConverter]::ToString($httpOverlayHasher.ComputeHash($httpAfterBytes))).Replace('-','').ToLowerInvariant()
        }finally{$httpOverlayHasher.Dispose()}
        Assert-HTTPSource ($httpBeforeBytes.Length -eq $httpFrozen[0].size -and $httpBeforeHash -ceq $httpFrozen[0].sha256 -and $httpAfterHash -ceq $httpPin.sha256) 'Controlled inverse does not recover the exact tested harness'
        $httpOverlayTokens=$null;$httpOverlayErrors=$null
        $httpBeforeAST=[Management.Automation.Language.Parser]::ParseInput($httpBeforeText,[ref]$httpOverlayTokens,[ref]$httpOverlayErrors)
        Assert-HTTPSource ($httpOverlayErrors.Count -eq 0) 'Recovered tested harness parse failure'
        $httpBeforeArrays=@(Get-HTTPGoArrays $httpBeforeAST)
        Assert-HTTPSource (($httpBeforeArrays | ConvertTo-Json -Depth 5 -Compress) -ceq ($httpArrays | ConvertTo-Json -Depth 5 -Compress)) 'Admin HTTP test/build source arrays changed in the concurrent overlay'
        $httpConcurrentOverlay=[ordered]@{
            path=$httpPath;tested_pin=$httpFrozen[0];current_pin=$httpPin
            tested_bytes_base64=[Convert]::ToBase64String($httpBeforeBytes);current_bytes_base64=[Convert]::ToBase64String($httpAfterBytes)
            inverse_sha256=$httpBeforeHash;exact_tested_bytes_recovered=$true;admin_http_source_arrays_unchanged=$true
            only_change='ConfigDownloadOwnersOnly ordinary package framework budget 900s -> 2700s and its comments; AdminReadOnly branch and all other bytes unchanged'
            scope='owner-profile change preserved and excluded from this detail-profile runtime acceptance'
            original_comment_source=(Get-HTTPSourcePin 'docs/evidence/d-gc-freeze-probe-suite-budget-20261021.mjs')
            initial_strict_review_rejected_harness_byte_drift=$true
        }
    }
    $httpPin
})
$httpCleanups=@(foreach($httpResult in @($httpOldResult,$httpNewResult)){
    $httpOwner=[IO.Path]::GetFullPath($httpResult.cleanup.owner)
    Assert-HTTPSource ([IO.Path]::GetDirectoryName($httpOwner) -ceq $httpReviewRoot -and [IO.Path]::GetFileName($httpOwner) -match '^\.tmp-d-index-cache-[a-f0-9]{32}$' -and $httpResult.cleanup.removed -and $httpResult.cleanup.test_build_artifacts_removed) 'Invalid owned cleanup receipt'
    Assert-HTTPSource (-not(Test-Path -LiteralPath $httpOwner)) ('Exact validation owner remains: '+$httpOwner)
    [ordered]@{owner=$httpOwner;files_removed=$httpResult.cleanup.files_removed;absent_verified=$true;test_build_artifacts_removed=$true}
})
$httpReceipt=[ordered]@{
    kind='d_verification_http_named_sources_repair';status='full_local_profile_passed_cleaned_actual_mysql_pending'
    original=[ordered]@{log=(Get-HTTPSourcePin $httpOldLogPath);source=(Get-HTTPSourcePin $httpOldSourcePath);result=(Get-HTTPSourcePin $httpOldResultPath);source_sha256=$httpOldSource.source_sha256;exit=1;stage='ordinary_http_named_file_compile';error='undefined: loadBackupReadCursorKey';helper_already_present_in_frozen_source=$true;remote_not_started=$true}
    file_sets=$httpSets;tagged_http_sources=@($httpTagged[0].files)
    changes_by_this_repair=@($httpNative,$httpDocker);main_harness_correction_already_present_when_inspected=$true;production_go_changed_by_this_repair=$false
    local=[ordered]@{log=(Get-HTTPSourcePin $httpNewLogPath);source=(Get-HTTPSourcePin $httpNewSourcePath);result=(Get-HTTPSourcePin $httpNewResultPath);source_sha256=$httpNewSource.source_sha256;source_files=$httpNewSource.files.Count;exit=0;ordinary_windows_http_tests_passed=$true;scope_and_full_read_package_tests_passed=$true;linux_http_tagged_probe_compiled=$true;linux_sql_probe_and_migration_compiled=$true;default_vet=$true;frozen_postcheck=$true;current_critical_pins=$httpCurrentPins;current_whole_tree_tested=$false}
    concurrent_harness_overlay=$httpConcurrentOverlay
    cleanup=$httpCleanups;dependencies_installed=$false;remote_executed_by_repair=$false;repaired_actual_mysql_executed=$false;new_history_cases_pending=16;production_approved=$false;reviewed_utc=[DateTime]::UtcNow.ToString('o')
}
$httpReceiptPath=Join-Path $PSScriptRoot 'd-verification-http-source-repair-20261022.json'
Assert-HTTPSource (-not(Test-Path -LiteralPath $httpReceiptPath)) 'Receipt already exists; preserve prior review'
[IO.File]::WriteAllText($httpReceiptPath,($httpReceipt | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
Write-Output ('PASS HTTP sources ordinary/native/container agree; full local profile exit=0; artifacts removed; actual_mysql=pending receipt='+$httpReceiptPath)
