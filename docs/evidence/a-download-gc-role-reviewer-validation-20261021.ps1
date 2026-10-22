$ErrorActionPreference='Stop'
$reviewRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $reviewRoot
try {
    $reviewer='docs/evidence/a-download-gc-role-actual-review-20261021.mjs'
    $parserTests='docs/evidence/a-download-gc-role-actual-review-20261021.test.mjs'
    $parserPath='docs/evidence/a-download-gc-role-actual-review-parser-checks-20261021.json'
    $recordPath='docs/evidence/a-download-gc-role-actual-review-preparation-20261021.json'
    foreach($outputPath in @($parserPath,$recordPath)){if(Test-Path -LiteralPath $outputPath){throw 'Refusing to replace validation evidence'}}
    $before=@(Get-ChildItem -LiteralPath 'docs/evidence' -Filter 'a-download-gc-role-mysql-accepted-*.json' | Select-Object -ExpandProperty Name | Sort-Object)
    $parserText=(& node $parserTests | Out-String)
    if($LASTEXITCODE -ne 0){throw 'Parser checks failed'}
    $parser=$parserText|ConvertFrom-Json
    if($parser.status -ne 'PASS' -or $parser.parser_checks -ne 43 -or $parser.actual_mysql_cases_executed -ne 0 -or $parser.actual_acceptance_receipts_written -ne 0){throw 'Unexpected parser result'}
    $cases=@(
        @('a-download-gc-role-20261020-r1-native.txt','a-download-gc-role-20261020-r1-source.json','no_failure_skip_panic_or_pending_cleanup'),
        @('a-download-gc-role-20261020-r2-native.txt','a-download-gc-role-20261020-r2-source.json','no_failure_skip_panic_or_pending_cleanup'),
        @('a-download-owners-mysql-remote-20261021-100630-92ddbad0.txt','a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json','no_failure_skip_panic_or_pending_cleanup'),
        @('a-download-owners-mysql-remote-20261021-083734-aca6615d.txt','a-download-owners-mysql-remote-source-20261021-083734-aca6615d.json','no_failure_skip_panic_or_pending_cleanup'),
        @('a-download-owners-local-repair-20261020-144930-6819f05e.txt','a-download-owners-local-repair-source-20261020-144930-6819f05e.json','one_actual_remote_run'),
        @('d-download-producer-remote-20261021-091802.txt','d-download-producer-remote-20261021-091802-source.json','exact_two_packaged_seeds_nine_checks')
    )
    $results=@(foreach($case in $cases){
        $savedErrorPreference=$ErrorActionPreference
        try {
            $ErrorActionPreference='Continue'
            $lines=@(& node $reviewer --log $case[0] --source $case[1] --write 2>&1)
            $reviewExit=$LASTEXITCODE
        } finally {$ErrorActionPreference=$savedErrorPreference}
        $result=(($lines|ForEach-Object {$_.ToString()}) -join "`n")|ConvertFrom-Json
        if($reviewExit -ne 1 -or $result.status -ne 'rejected' -or $result.code -ne $case[2] -or $result.receipt_written -ne $false){throw ('CLI did not reject exact incomplete/failed attempt: '+$case[0])}
        [ordered]@{log=('docs/evidence/'+$case[0]);log_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path 'docs/evidence' $case[0])).Hash.ToLowerInvariant();source=('docs/evidence/'+$case[1]);source_manifest_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path 'docs/evidence' $case[1])).Hash.ToLowerInvariant();exit=$reviewExit;rejection_code=$result.code;receipt_written=$false}
    })
    $after=@(Get-ChildItem -LiteralPath 'docs/evidence' -Filter 'a-download-gc-role-mysql-accepted-*.json' | Select-Object -ExpandProperty Name | Sort-Object)
    if(($before -join "`n") -ne ($after -join "`n")){throw 'Negative CLI validation created an actual receipt'}
    $proof='docs/evidence/a-download-gc-producer-independent-accepted-20261021.json'
    $baseline=Get-Content -Raw -LiteralPath $proof | ConvertFrom-Json
    if($baseline.status -ne 'accepted_frozen_local_baseline_only' -or $baseline.owner_baseline.all -ne 4939){throw 'Unexpected current baseline proof'}
    [IO.File]::WriteAllText((Join-Path $reviewRoot $parserPath),$parserText.Trim()+"`n",[Text.UTF8Encoding]::new($false))
    $inputs=@(foreach($inputPath in @($reviewer,$parserTests,'docs/evidence/a-download-owners-actual-review-20261020.mjs','scripts/system-backup-contract-check.mjs')){[ordered]@{path=$inputPath;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $inputPath).Hash.ToLowerInvariant()}})
    $record=[ordered]@{
        kind='a_gc_restricted_role_actual_receipt_reader_preparation';recorded_at=[DateTime]::UtcNow.ToString('o')
        parser_checks=43;parser_result=$parserPath;parser_result_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $parserPath).Hash.ToLowerInvariant()
        inputs=$inputs;baseline_proof=$proof;baseline_proof_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $proof).Hash.ToLowerInvariant();current_owner_baseline_checks=4939
        retained_complete_baseline_checks=@(4822,4864);actual_cli_rejections=$results;actual_acceptance_receipts_created=0;actual_sql_cases_executed=0;actual_sql_cases_accepted=0
        successful_transcripts='synthetic_in_memory_only';dependencies_installed=$false;test_build_artifacts_created=$false;remote_executed=$false
        validation_runner_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath 'docs/evidence/a-download-gc-role-reviewer-validation-20261021.ps1').Hash.ToLowerInvariant()
        scope='Offline receipt-reader preparation; actual isolated role ten-case run remains pending; no production role or full GC approval.'
    }
    [IO.File]::WriteAllText((Join-Path $reviewRoot $recordPath),($record|ConvertTo-Json -Depth 10)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output ('PASS parser_checks=43 actual_cli_rejections=6 actual_receipts_created=0 record='+$recordPath)
} finally {Pop-Location}
