$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $taskRoot
try {
    $taskGrantPath='backend/internal/systembackupcontroller/database_grants.go'
    $taskSource=Get-Content -LiteralPath $taskGrantPath -Raw
    $taskRequired=@(
        @{table='system_backup_events';verbs=@('INSERT','SELECT');reason='append claim/core events and lock-read the three original event IDs'},
        @{table='system_backup_attempts';verbs=@('SELECT','INSERT');reason='insert initial capture/secret_capture units and share-lock their current state'},
        @{table='system_backup_job_observations';verbs=@('SELECT');reason='initial-start NOT EXISTS guard'},
        @{table='system_backup_staging_resources';verbs=@('SELECT');reason='initial-start NOT EXISTS guard'}
    )
    $taskDelta=@(foreach($row in $taskRequired){
        $pattern='"'+$row.table+'"\s*:\s*\{(?<verbs>[^}]+)\}'
        $match=[regex]::Match($taskSource,$pattern)
        $old=@();if($match.Success){$old=@([regex]::Matches($match.Groups['verbs'].Value,'"(?<verb>[A-Z]+)"')|ForEach-Object {$_.Groups['verb'].Value})}
        [ordered]@{table=$row.table;original_verbs=$old;required_by_visible_start_queries=$row.verbs;missing_verbs=@($row.verbs|Where-Object {$_ -notin $old});reason=$row.reason}
    })
    $taskPaths=@($taskGrantPath,'backend/internal/systembackupcontroller/execution_ports.go','backend/internal/systembackupcontroller/execution_ports_test.go','backend/internal/systembackupcontroller/sql_backup_start_store.go','backend/internal/systembackupcontroller/sql_backup_start_store_test.go')
    $taskPins=@($taskPaths|ForEach-Object {[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})
    $taskReport=[ordered]@{
        kind='a_d_controller_start_grant_source_review.v1';date='2026-10-28';scope='current visible start SQL against unchanged default controller grant matrix';inputs=$taskPins
        official_source='https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html'
        mysql_version_condition='SELECT-only FOR SHARE requires MySQL >=8.0.22; generic 8.0 is insufficient evidence; verify actual server identity/version before production enablement'
        source_lock_review='installation remains FOR UPDATE; configs, attempts and event validation use FOR SHARE; no history UPDATE/DELETE/LOCK TABLES grant inferred'
        candidate_delta=$taskDelta
        decision='four visible-query deltas documented for explicit D/A matrix review and new real positive/negative grant tests; no runtime matrix or authority changed'
        test_requirements=@('old exact grants refuse initial start without partial writes','candidate exact grants permit the reviewed SQL under same RR transaction and real server version','remove each of the four new privileges individually and verify denial/rollback','reject extra history UPDATE/DELETE, LOCK TABLES, wildcard/global grants, role/delegation expansion','confirm shared-lock current-read/concurrent configuration and attempt semantics under real MySQL')
        excludes=@('full future ExecutionWorkStore permissions','A original resource authorization and grant/source SQL','B runner/Job/cursor writes','C provider/finalizer/catalog privileges')
        matrix_changed=$false;grants_executed=$false;real_grant_tests_performed=$false;tests_rerun_by_A=$false;dependencies_installed=$false;production_approved=$false;field_slots_closed=0
        new_lock_shape_final_receipt_verified=$false;prior_38_96_does_not_cover_new_lock_bytes=$true
    }
    $taskReport|ConvertTo-Json -Depth 9|Set-Content -LiteralPath 'docs/evidence/a-d-controller-start-grant-review-20261028.json' -Encoding utf8
    @($taskDelta|ForEach-Object {[pscustomobject]@{table=$_.table;missing_verbs=$_.missing_verbs}})|ConvertTo-Json -Depth 3
} finally {Pop-Location}
