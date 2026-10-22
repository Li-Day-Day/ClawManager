$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-37969f59c7594194bc3d4236179ad8c3'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -Force -LiteralPath $owner).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong review source owner'}
$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot 'd-a-public-review-20261021-r1'
foreach($suffix in @('-schemas.tap','-schemas-stderr.txt','-signatures.tap','-signatures-stderr.txt','-native.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Existing public review evidence'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-a-business-review-20261021-r1-counterfactual-source.json')|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$env:TEMP=Join-Path $owner 'tmp';$env:TMP=$env:TEMP
$node='C:/Program Files/nodejs/node.exe'
$runs=@()
Push-Location $source
try{
    & $node --test-isolation=none --test-reporter=tap '--test-name-pattern=^A-owned (secret ref union|strong-auth contract|provider-proof registration|capability evidence)' --test scripts/system-backup-contract-artifacts.test.mjs 1>($prefix+'-schemas.tap') 2>($prefix+'-schemas-stderr.txt')
    $runs+=@{stage='schemas';exit=$LASTEXITCODE;pattern='^A-owned (secret ref union|strong-auth contract|provider-proof registration|capability evidence)';files=@('scripts/system-backup-contract-artifacts.test.mjs')}
    & $node --test-isolation=none --test-reporter=tap --test scripts/system-backup-a-provider-proof-signature.test.mjs scripts/system-backup-d-strong-auth-issuer.test.mjs 1>($prefix+'-signatures.tap') 2>($prefix+'-signatures-stderr.txt')
    $runs+=@{stage='signatures';exit=$LASTEXITCODE;pattern='';files=@('scripts/system-backup-a-provider-proof-signature.test.mjs','scripts/system-backup-d-strong-auth-issuer.test.mjs')}
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    [ordered]@{kind='d_a_public_contract_targeted_review';runs=$runs;source_sha256=$manifest.source_sha256;source_postcheck=$true;dependencies_installed=$false;remote=$false;production_approved=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}finally{Pop-Location}
if(@($runs|Where-Object exit -ne 0).Count){exit 1}
Write-Output 'PUBLIC_REVIEW targeted-schemas-and-public-signatures=PASS'
