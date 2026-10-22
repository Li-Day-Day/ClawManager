$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $readerRoot
try {
    $readerRecord='docs/evidence/a-gc-journal-receipt-readers-preparation-20261021.json'
    $ownerParser='docs/evidence/a-download-owners-actual-review-parser-checks-20261021-r5.json'
    $roleParser='docs/evidence/a-download-gc-role-actual-review-parser-checks-20261021-r2.json'
    foreach($output in @($readerRecord,$ownerParser,$roleParser)){if(Test-Path -LiteralPath $output){throw 'Refusing to replace reader verification evidence'}}
    $before=@(Get-ChildItem -LiteralPath 'docs/evidence' -File | Where-Object {$_.Name -match '^a-download-(owners|gc-role)-mysql-accepted-.*\.json$'} | Select-Object -ExpandProperty Name | Sort-Object)
    $parserResults=@(foreach($entry in @(@('docs/evidence/a-download-owners-actual-review-20261020.test.mjs',$ownerParser,54),@('docs/evidence/a-download-gc-role-actual-review-20261021.test.mjs',$roleParser,43))){
        $parsedText=(& node $entry[0] | Out-String)
        if($LASTEXITCODE -ne 0){throw 'Reader parser regression failed'}
        $parsed=$parsedText|ConvertFrom-Json
        if($parsed.status -ne 'PASS' -or $parsed.parser_checks -ne $entry[2] -or $parsed.actual_acceptance_receipts_written -ne 0){throw 'Unexpected reader parser result'}
        [ordered]@{path=$entry[1];count=$entry[2];text=$parsedText.Trim()+"`n"}
    })
    $cases=@(
        @('owners','a-download-owners-mysql-remote-20261020-133409-ebbf810b.txt','a-download-owners-mysql-remote-source-20261020-133409-ebbf810b.json','no_test_failure_skip_panic_or_pending_cleanup'),
        @('owners','a-download-owners-mysql-remote-20261020-152911-f87d0e35.txt','a-download-owners-local-repair-source-20261020-144930-6819f05e.json','one_frozen_source'),
        @('owners','a-download-owners-local-repair-20261020-144930-6819f05e.txt','a-download-owners-local-repair-source-20261020-144930-6819f05e.json','one_actual_remote_run'),
        @('owners','a-download-owners-mysql-remote-20261021-083734-aca6615d.txt','a-download-owners-mysql-remote-source-20261021-083734-aca6615d.json','no_test_failure_skip_panic_or_pending_cleanup'),
        @('owners','a-download-owners-mysql-remote-20261021-100630-92ddbad0.txt','a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json','no_test_failure_skip_panic_or_pending_cleanup'),
        @('gc-role','a-download-gc-role-20261020-r1-native.txt','a-download-gc-role-20261020-r1-source.json','no_failure_skip_panic_or_pending_cleanup'),
        @('gc-role','a-download-gc-role-20261020-r2-native.txt','a-download-gc-role-20261020-r2-source.json','no_failure_skip_panic_or_pending_cleanup'),
        @('gc-role','a-download-owners-mysql-remote-20261021-100630-92ddbad0.txt','a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json','no_failure_skip_panic_or_pending_cleanup'),
        @('gc-role','a-download-owners-mysql-remote-20261021-083734-aca6615d.txt','a-download-owners-mysql-remote-source-20261021-083734-aca6615d.json','no_failure_skip_panic_or_pending_cleanup'),
        @('gc-role','a-download-owners-local-repair-20261020-144930-6819f05e.txt','a-download-owners-local-repair-source-20261020-144930-6819f05e.json','one_actual_remote_run'),
        @('gc-role','d-download-producer-remote-20261021-091802.txt','d-download-producer-remote-20261021-091802-source.json','exact_two_packaged_seeds_nine_checks')
    )
    $cliResults=@(foreach($case in $cases){
        $reviewer=if($case[0] -eq 'owners'){'docs/evidence/a-download-owners-actual-review-20261020.mjs'}else{'docs/evidence/a-download-gc-role-actual-review-20261021.mjs'}
        $savedPreference=$ErrorActionPreference
        try {$ErrorActionPreference='Continue';$lines=@(& node $reviewer --log $case[1] --source $case[2] --write 2>&1);$readerExit=$LASTEXITCODE} finally {$ErrorActionPreference=$savedPreference}
        $message=(($lines|ForEach-Object {$_.ToString()}) -join "`n")|ConvertFrom-Json
        if($readerExit -ne 1 -or $message.status -ne 'rejected' -or $message.code -ne $case[3] -or $message.receipt_written -ne $false){throw ('Real CLI rejection failed: '+$case[1])}
        [ordered]@{profile=$case[0];log=('docs/evidence/'+$case[1]);log_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath ('docs/evidence/'+$case[1])).Hash.ToLowerInvariant();source=('docs/evidence/'+$case[2]);source_manifest_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath ('docs/evidence/'+$case[2])).Hash.ToLowerInvariant();exit=1;code=$message.code;receipt_written=$false}
    })
    $after=@(Get-ChildItem -LiteralPath 'docs/evidence' -File | Where-Object {$_.Name -match '^a-download-(owners|gc-role)-mysql-accepted-.*\.json$'} | Select-Object -ExpandProperty Name | Sort-Object)
    if(($before -join "`n") -ne ($after -join "`n")){throw 'Negative validation created an actual SQL receipt'}
    $proof='docs/evidence/a-gc-journal-accepted-20261021-r1.json'
    $baseline=Get-Content -Raw -LiteralPath $proof | ConvertFrom-Json
    if($baseline.status -ne 'accepted_frozen_local_runtime_and_models_only' -or $baseline.owner_baseline.all -ne 4967){throw 'Unexpected final journal baseline'}
    $parserPins=@(foreach($parserResult in $parserResults){[IO.File]::WriteAllText((Join-Path $readerRoot $parserResult.path),$parserResult.text,[Text.UTF8Encoding]::new($false));[ordered]@{path=$parserResult.path;parser_checks=$parserResult.count;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $parserResult.path).Hash.ToLowerInvariant()}})
    $inputPins=@(foreach($inputPath in @('docs/evidence/a-download-owners-actual-review-20261020.mjs','docs/evidence/a-download-owners-actual-review-20261020.test.mjs','docs/evidence/a-download-gc-role-actual-review-20261021.mjs','docs/evidence/a-download-gc-role-actual-review-20261021.test.mjs','scripts/system-backup-contract-check.mjs')){[ordered]@{path=$inputPath;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $inputPath).Hash.ToLowerInvariant()}})
    $record=[ordered]@{kind='a_gc_journal_updated_receipt_readers_preparation';recorded_at=[DateTime]::UtcNow.ToString('o');owner_parser_checks=54;role_parser_checks=43;parsers=$parserPins;inputs=$inputPins;baseline_proof=$proof;baseline_proof_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $proof).Hash.ToLowerInvariant();owner_baseline_complete_checks=4967;retained_baseline_complete_checks=@(4822,4864,4939);actual_cli_rejections=$cliResults;actual_acceptance_receipts_created=0;actual_sql_cases_executed=0;successful_transcripts='synthetic_in_memory_only';dependencies_installed=$false;test_build_artifacts_created=$false;runner_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()}
    [IO.File]::WriteAllText((Join-Path $readerRoot $readerRecord),($record|ConvertTo-Json -Depth 10)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output 'PASS owner_parser=54 role_parser=43 real_cli_rejections=11 actual_sql_receipts_created=0'
} finally {Pop-Location}
