param([Parameter(Mandatory=$true)][ValidateSet('publish','cleanup')][string]$Stage,[switch]$ValidationSessionsTerminal)
$ErrorActionPreference='Stop'
if(-not $ValidationSessionsTerminal){throw 'Exact validation handles must be terminal'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'));$name='.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61'
$owner=(Resolve-Path -LiteralPath (Join-Path $root $name)).Path
if([IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.Path]::GetFileName($owner) -ne $name -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne $name){throw 'Wrong exact prune repair owner'}
if((Get-Item -Force -LiteralPath $owner).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
if(@(Get-ChildItem -LiteralPath $owner -Force -Recurse|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}|Select-Object -First 1).Count){throw 'Redirected child'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$source=Join-Path $owner 'source'
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-20261021-r1-controller-source.json')|ConvertFrom-Json
$base=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-base-20261021.json')|ConvertFrom-Json
foreach($prefix in @('d-prune-identity-20261021-r3-node','d-prune-identity-20261021-r1-controller','d-prune-identity-20261021-r2-probe')){
 $native=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ($prefix+'-native.json'))|ConvertFrom-Json
 if($native.exit -ne 0 -or -not $native.source_postcheck -or $native.source_sha256 -ne $manifest.source_sha256){throw 'Matching successful stage missing'}
}
$initial=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-20261021-r1-full-native.json')|ConvertFrom-Json
$transition=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-audit-refresh-20261021.json')|ConvertFrom-Json
if($initial.exit -ne 1 -or -not $initial.source_postcheck -or $initial.source_sha256 -ne $transition.before_source_sha256 -or $manifest.source_sha256 -ne $transition.after_source_sha256 -or -not $transition.production_go_sources_unchanged){throw 'Original full scope or narrow fixture transition not proven'}
$binaryCheck=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-prepublish-binaries-20261021.json')|ConvertFrom-Json
if($binaryCheck.source_sha256 -ne $manifest.source_sha256 -or $binaryCheck.files.Count -ne 4){throw 'Prepublication binary check missing'}
foreach($p in $binaryCheck.files){
 if($p.name -notin @('gc-task.test.exe','gc-task.test','system-backup-migrate','audit-inputs-r2.json') -or (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $owner $p.name)).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Prepublication binary changed'}
}
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$before=@{};foreach($p in $base.files){$before[$p.path]=$p}
$changed=@($manifest.files|Where-Object { -not $before.ContainsKey($_.path) -or $before[$_.path].sha256 -ne $_.sha256 })
if($changed.Count -ne 17){throw 'Unexpected publication scope'}
$contextPath=Join-Path $PSScriptRoot 'd-prune-identity-published-context-20261021.json'
if($Stage -eq 'publish'){
 if(Test-Path -LiteralPath $contextPath){throw 'Publication evidence exists'}
 $oldMigrations=@($base.files|Where-Object {$_.path -match '^backend/internal/db/migrations/[^/]+\.sql$'})
 $liveMigrationNames=@(Get-ChildItem -LiteralPath (Join-Path $root 'backend/internal/db/migrations') -File -Filter '*.sql'|ForEach-Object Name|Sort-Object -CaseSensitive)
 $oldMigrationNames=@($oldMigrations|ForEach-Object {[IO.Path]::GetFileName($_.path)}|Sort-Object -CaseSensitive)
 if(($liveMigrationNames -join ',') -ne ($oldMigrationNames -join ',')){throw 'Concurrent migration catalog file set changed'}
 foreach($p in @($oldMigrations)+@($manifest.files|Where-Object {$_.path -in @('backend/go.mod','backend/go.sum')})){
  if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $p.path)).Hash.ToLowerInvariant() -ne $p.sha256){throw ('Concurrent catalog or module change: '+$p.path)}
 }
 $generatedInputs=@('contracts/system-backup/v12/schema-registry-decisions.json','contracts/system-backup/v12/registry-enums.json','contracts/system-backup/v12/contract-manifest.json','docs/system-backup-restore-schema-inventory.json','scripts/system-backup-contract-check.mjs','scripts/system-backup-a-download-mfa-inputs.mjs','docs/system-backup-d-config-canonical-081-proposal-20261014.sql','docs/system-backup-d-download-admission-schema-proposal-20261019.sql','docs/evidence/a-config-canonical-request-vectors-20261014.json','contracts/system-backup/v12/producer-authority-candidate.sql','contracts/system-backup/v12/producer-authority-vectors.json','contracts/system-backup/v12/a-owned-redacted-examples.json')
 foreach($p in $generatedInputs){if(-not $before.ContainsKey($p) -or (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $p)).Hash.ToLowerInvariant() -ne $before[$p].sha256){throw ('Concurrent generator input change: '+$p)}}
 $metricContractInputs=@($base.files|Where-Object {$_.path -eq 'contracts/system-backup/v12/status-failure-enums.schema.json' -or $_.path -match '^backend/internal/systembackupcontract/[^/]+\.go$'})
 foreach($p in $metricContractInputs){if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $p.path)).Hash.ToLowerInvariant() -ne $p.sha256){throw ('Concurrent metric contract change: '+$p.path)}}
 foreach($p in $changed){$target=Join-Path $root $p.path;if($before.ContainsKey($p.path)){if((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -ne $before[$p.path].sha256){throw ('Concurrent change: '+$p.path)}}elseif(Test-Path -LiteralPath $target){throw ('New path occupied: '+$p.path)}}
 foreach($p in $changed){Copy-Item -LiteralPath (Join-Path $source $p.path) -Destination (Join-Path $root $p.path);(Get-Item -LiteralPath (Join-Path $root $p.path)).IsReadOnly=$false}
 $first=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root);$second=Get-DIndexInputPins -Root $root -Files (Get-DIndexSourceFiles -Root $root)
 $digest=Get-DIndexPinDigest -Pins $first;if($digest -ne (Get-DIndexPinDigest -Pins $second)){throw 'Publication context observation drift'}
 [ordered]@{kind='d_prune_identity_published_context';source_sha256=$digest;files=$second;published=@($changed|ForEach-Object path);stable_copy_verified=$true;dependencies_installed=$false;remote=$false;production_approved=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $contextPath -Encoding utf8NoBOM
}elseif(-not(Test-Path -LiteralPath $contextPath)){throw 'Published source receipt missing'}
foreach($p in @($changed)+@($manifest.files|Where-Object { $_.path -in @('backend/go.mod','backend/go.sum') })){
 if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $p.path)).Hash.ToLowerInvariant() -ne $p.sha256){throw ('Published bytes differ: '+$p.path)}
}
if($Stage -eq 'cleanup'){
 $out=Join-Path $PSScriptRoot 'd-prune-identity-cleanup-20261021.json';if(Test-Path -LiteralPath $out){throw 'Cleanup evidence exists'}
 Remove-Item -LiteralPath $owner -Recurse -Force
 if(Test-Path -LiteralPath $owner){throw 'Owned artifacts remain'}
 [ordered]@{kind='d_prune_identity_cleanup';absolute_owner=$owner;removed=$true;process_terminal=$true;source_postcheck=$true;source_sha256=$manifest.source_sha256;retained='logs, manifests, review evidence';dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $out -Encoding utf8NoBOM
}
Write-Output ('PRUNE_IDENTITY finalize='+$Stage+' source='+$manifest.source_sha256)
