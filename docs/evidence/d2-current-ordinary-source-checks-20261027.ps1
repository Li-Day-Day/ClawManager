$ErrorActionPreference='Stop'
$checkRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ordinaryDriverPath=Join-Path $PSScriptRoot 'd2-current-ordinary-complete-validation-20261027.ps1'
$checkTokens=$null;$checkErrors=$null
$checkAst=[System.Management.Automation.Language.Parser]::ParseFile($ordinaryDriverPath,[ref]$checkTokens,[ref]$checkErrors)
if($checkErrors.Count){throw 'Ordinary driver AST failed'}
$checkFunction=$checkAst.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Assert-OrdinaryHelpers'},$true)
if($null -eq $checkFunction){throw 'Missing actual helper integrity function'}
. ([ScriptBlock]::Create($checkFunction.Extent.Text))
$ordinarySnapshotter=Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs'
$ordinaryInventory=Join-Path $PSScriptRoot 'd2-current-ordinary-inventory-20261027.mjs'
$ordinaryScopeReader=Join-Path $PSScriptRoot 'd2-current-ordinary-go-scope-20261027.mjs'
$ordinaryParser=Join-Path $PSScriptRoot 'a2-reference-capability-go-scope-20261026.mjs'
$ordinaryEventReader=Join-Path $PSScriptRoot 'd-resources-mysql-actual-review-20261023.mjs'
$ordinaryParityValidator=Join-Path $PSScriptRoot 'a2-reference-capability-supplement-review-20261027-r2.mjs'
$ordinaryDriverHash=(Get-FileHash -LiteralPath $ordinaryDriverPath -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinarySnapshotterHash=(Get-FileHash -LiteralPath $ordinarySnapshotter -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryInventoryHash=(Get-FileHash -LiteralPath $ordinaryInventory -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryScopeReaderHash=(Get-FileHash -LiteralPath $ordinaryScopeReader -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryParserHash=(Get-FileHash -LiteralPath $ordinaryParser -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryEventReaderHash=(Get-FileHash -LiteralPath $ordinaryEventReader -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryParityValidatorHash=(Get-FileHash -LiteralPath $ordinaryParityValidator -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-OrdinaryHelpers
$correctHash=$ordinaryDriverHash;$ordinaryDriverHash='0'*64;$rejected=$false
try{Assert-OrdinaryHelpers}catch{$rejected=$true}
$ordinaryDriverHash=$correctHash
if(-not $rejected){throw 'Changed helper hash accepted'}
$result=[ordered]@{kind='d2_current_ordinary_helper_integrity_check.v2';actual_function_ast_executed=$true;current_hashes_accepted=$true;changed_expected_hash_rejected=$true;Go_started=$false;filesystem_mutated_by_test=$false;driver_sha256=$ordinaryDriverHash;function_sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($checkFunction.Extent.Text))).ToLowerInvariant()}
$reportPath=Join-Path $PSScriptRoot ('d2-current-ordinary-helper-integrity-20261027-'+$ordinaryDriverHash.Substring(0,16)+'.json')
$reportText=($result|ConvertTo-Json)+[Environment]::NewLine
if(Test-Path -LiteralPath $reportPath){if([IO.File]::ReadAllText($reportPath) -cne $reportText){throw 'Refusing to overwrite another integrity observation'}}
else{[IO.File]::WriteAllText($reportPath,$reportText,[Text.UTF8Encoding]::new($false))}
Write-Output ('ORDINARY_INTEGRITY_RESULT='+$reportPath)
