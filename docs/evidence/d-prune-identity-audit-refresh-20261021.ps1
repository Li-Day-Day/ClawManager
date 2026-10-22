$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61';$source=Join-Path $owner 'source'
$out=Join-Path $PSScriptRoot 'd-prune-identity-audit-refresh-20261021.json'
if(Test-Path -LiteralPath $out){throw 'Audit input refresh exists'}
$full=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-20261021-r1-full-native.json')|ConvertFrom-Json
if($full.exit -ne 1 -or -not $full.source_postcheck){throw 'Wait for original full validation to finish with the two known stale metric expectations'}
$events=@(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-20261021-r1-full.jsonl')|ForEach-Object {$_|ConvertFrom-Json})
$failed=@($events|Where-Object {$_.Action -eq 'fail' -and $_.Test}|ForEach-Object Test|Sort-Object)
if(($failed -join ',') -ne 'TestQueueBudgetMetricsRenderCompleteClosedPrometheusSampleSet,TestSQLQueueBudgetReaderEmitsOnlyClosedLowCardinalitySamples'){throw 'Unexpected full-package failure'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$before=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-20261021-r1-full-source.json')|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $before
$patches=@(
 @{path='backend/internal/systembackupevidence/download_admission_audit_mysql_test.go';old='len(zero.Migrations) != 95';new='len(zero.Migrations) != 96'},
 @{path='scripts/system-backup-d-download-audit-bundle.mjs';old='catalog_migrations: 95';new='catalog_migrations: 96'}
)
foreach($patch in $patches){
 $target=Join-Path $source $patch.path;$text=[IO.File]::ReadAllText($target)
 if([regex]::Matches($text,[regex]::Escape($patch.old)).Count -ne 1){throw 'Ambiguous audit count pin'}
 (Get-Item -LiteralPath $target).IsReadOnly=$false
 [IO.File]::WriteAllText($target,$text.Replace($patch.old,$patch.new))
 (Get-Item -LiteralPath $target).IsReadOnly=$true
}
$metric=Join-Path $source 'backend/internal/systembackupcontroller/metrics_http_test.go'
$text=[IO.File]::ReadAllText($metric)
if(-not $text.Contains('!= 25')){throw 'Metric expectation changed'}
(Get-Item -LiteralPath $metric).IsReadOnly=$false
$text=$text.Replace('0, 25)','0, 26)').Replace('!= 25','!= 26').Replace('!strings.Contains(output, "verification_scope=', '!strings.Contains(output, "operation_type=\"evidence_download_admission\"} 0\n") ||' + "`n`t`t" + '!strings.Contains(output, "verification_scope=')
[IO.File]::WriteAllText($metric,$text)
$sqlMetric=Join-Path $source 'backend/internal/systembackupcontroller/sql_queue_budget_test.go'
$text=[IO.File]::ReadAllText($sqlMetric)
if(-not $text.Contains('len(samples) != 25')){throw 'SQL metric expectation changed'}
(Get-Item -LiteralPath $sqlMetric).IsReadOnly=$false
$text=$text.Replace('len(samples) != 25','len(samples) != 26')
$marker="`tif values[`"clawmanager_system_backup_task_queue_deadline_utilization_ratio/backup/acceptance///`"] != 2 ||"
if(-not $text.Contains($marker)){throw 'Cannot locate independent metric values'}
$guard="`tif value, present := values[`"clawmanager_system_backup_operation_queue_deadline_utilization_ratio/////evidence_download_admission`"`]; !present || value != 0 {`n`t`tt.Fatal(`"missing zero sample for contract download admission operation`"`)`n`t}`n"
$text=$text.Replace($marker,$guard+$marker)
[IO.File]::WriteAllText($sqlMetric,$text)
& 'C:/Program Files/Go/bin/gofmt.exe' -w $metric $sqlMetric
if($LASTEXITCODE -ne 0){throw 'Metric test formatting failed'}
foreach($p in @($metric,$sqlMetric)){(Get-Item -LiteralPath $p).IsReadOnly=$true}
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
Push-Location (Join-Path $source 'backend')
try{& 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -json ./internal/systembackupevidence 1>(Join-Path $PSScriptRoot 'd-prune-identity-normal-go-list-20261021.json') 2>(Join-Path $PSScriptRoot 'd-prune-identity-normal-go-list-20261021.stderr');if($LASTEXITCODE -ne 0){throw 'Cannot verify normal Go source selection'}}finally{Pop-Location}
$list=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-normal-go-list-20261021.json')|ConvertFrom-Json
$tag='download_admission_audit_mysql_test.go'
$compiledNames=@($list.GoFiles)+@($list.TestGoFiles)+@($list.XTestGoFiles)
if($list.IgnoredGoFiles -notcontains $tag -or $compiledNames -contains $tag){throw 'Audit probe unexpectedly affects normal Go packages'}
$after=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$oldPins=@{};foreach($p in $before.files){$oldPins[$p.path]=$p}
$changed=@($after|Where-Object {$oldPins[$_.path].sha256 -ne $_.sha256})
if($changed.Count -ne 4 -or $after.Count -ne $before.files.Count){throw 'Unexpected source transition'}
$expectedChanges=@($patches.path)+@('backend/internal/systembackupcontroller/metrics_http_test.go','backend/internal/systembackupcontroller/sql_queue_budget_test.go')
foreach($p in $changed){if($expectedChanges -notcontains $p.path){throw 'Unowned transition'}}
[ordered]@{kind='d_prune_identity_audit_count_and_metric_fixture_refresh';before_source_sha256=$before.source_sha256;after_source_sha256=(Get-DIndexPinDigest -Pins $after);files=$after;changes=$patches;metric_fixture_changes=@('backend/internal/systembackupcontroller/metrics_http_test.go','backend/internal/systembackupcontroller/sql_queue_budget_test.go');production_go_sources_unchanged=$true;full_packages_require_new_success=$true;tagged_probe_excluded_from_normal_go=$true;normal_go_list_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-normal-go-list-20261021.json')).Hash.ToLowerInvariant();dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output 'PRUNE_IDENTITY refresh: tagged audit count 96 and two metric fixtures require all 26 closed samples'
