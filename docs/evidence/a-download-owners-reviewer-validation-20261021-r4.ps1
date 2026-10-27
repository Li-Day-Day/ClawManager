$ErrorActionPreference='Stop'
$reviewRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $reviewRoot
try {
    $parserPath='docs/evidence/a-download-owners-actual-review-parser-checks-20261021-r4.json'
    $recordPath='docs/evidence/a-download-owners-actual-review-cli-checks-20261021-r4.json'
    foreach($outputPath in @($parserPath,$recordPath)){if(Test-Path -LiteralPath $outputPath){throw 'Refusing to replace validation evidence'}}
    $parserText=(& node docs/evidence/a-download-owners-actual-review-20261020.test.mjs | Out-String)
    if($LASTEXITCODE -ne 0){throw 'Parser checks failed'}
    $parser=$parserText|ConvertFrom-Json
    if($parser.status -ne 'PASS' -or $parser.parser_checks -ne 53 -or $parser.actual_acceptance_receipts_written -ne 0){throw 'Unexpected parser result'}
    [IO.File]::WriteAllText((Join-Path $reviewRoot $parserPath),$parserText.Trim()+"`n",[Text.UTF8Encoding]::new($false))
    $before=@(Get-ChildItem -LiteralPath 'docs/evidence' -Filter 'a-download-owners-mysql-accepted-*.json' | Select-Object -ExpandProperty Name | Sort-Object)
    $cases=@(
        @('a-download-owners-mysql-remote-20261020-133409-ebbf810b.txt','a-download-owners-mysql-remote-source-20261020-133409-ebbf810b.json','no_test_failure_skip_panic_or_pending_cleanup'),
        @('a-download-owners-mysql-remote-20261020-152911-f87d0e35.txt','a-download-owners-local-repair-source-20261020-144930-6819f05e.json','one_frozen_source'),
        @('a-download-owners-local-repair-20261020-144930-6819f05e.txt','a-download-owners-local-repair-source-20261020-144930-6819f05e.json','one_actual_remote_run'),
        @('a-download-owners-mysql-remote-20261021-083734-aca6615d.txt','a-download-owners-mysql-remote-source-20261021-083734-aca6615d.json','no_test_failure_skip_panic_or_pending_cleanup'),
        @('a-download-owners-mysql-remote-20261021-100630-92ddbad0.txt','a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json','no_test_failure_skip_panic_or_pending_cleanup')
    )
    $results=@(foreach($case in $cases){
        $savedErrorPreference=$ErrorActionPreference
        try {
            $ErrorActionPreference='Continue'
            $lines=@(& node docs/evidence/a-download-owners-actual-review-20261020.mjs --log $case[0] --source $case[1] --write 2>&1)
            $reviewExit=$LASTEXITCODE
        } finally {$ErrorActionPreference=$savedErrorPreference}
        $result=(($lines|ForEach-Object {$_.ToString()}) -join "`n")|ConvertFrom-Json
        if($reviewExit -ne 1 -or $result.status -ne 'rejected' -or $result.code -ne $case[2] -or $result.receipt_written -ne $false){throw 'CLI did not reject exact incomplete/failed attempt'}
        [ordered]@{log=$case[0];log_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path 'docs/evidence' $case[0])).Hash.ToLowerInvariant();source=$case[1];source_manifest_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path 'docs/evidence' $case[1])).Hash.ToLowerInvariant();exit=$reviewExit;rejection_code=$result.code;receipt_written=$false}
    })
    $after=@(Get-ChildItem -LiteralPath 'docs/evidence' -Filter 'a-download-owners-mysql-accepted-*.json' | Select-Object -ExpandProperty Name | Sort-Object)
    if(($before -join "`n") -ne ($after -join "`n")){throw 'Negative CLI validation created an actual receipt'}
    $record=[ordered]@{
        kind='a_owner_actual_receipt_reviewer_preparation';version=4;recorded_at=[DateTime]::UtcNow.ToString('o')
        reviewer_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath 'docs/evidence/a-download-owners-actual-review-20261020.mjs').Hash.ToLowerInvariant()
        parser_tests_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath 'docs/evidence/a-download-owners-actual-review-20261020.test.mjs').Hash.ToLowerInvariant()
        parser_result=$parserPath;parser_result_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $parserPath).Hash.ToLowerInvariant();parser_checks=53
        baseline_proof='docs/evidence/a-download-gc-producer-independent-accepted-20261021.json';baseline_complete_checks=4939
        retained_baseline_complete_checks=@(4822,4864);ordinary_tests_dropped=0;exact_encoding_aliases_allowed=4
        actual_cli_rejections=$results;actual_sql_cases_accepted=0;actual_acceptance_receipts_created=0
        dependencies_installed=$false;test_build_artifacts_created=$false;remote_executed=$false
    }
    [IO.File]::WriteAllText((Join-Path $reviewRoot $recordPath),($record|ConvertTo-Json -Depth 10)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output ('PASS parser_checks=53 actual_cli_rejections=5 actual_receipts_created=0 record='+$recordPath)
} finally {Pop-Location}
