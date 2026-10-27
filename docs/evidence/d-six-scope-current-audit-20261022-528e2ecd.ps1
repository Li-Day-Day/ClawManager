$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$node='C:/Program Files/nodejs/node.exe'
$prefix='docs/evidence/d-six-scope-current-audit-20261022-528e2ecd'
foreach($suffix in @('.json','-source.json','-source-before.json','-native.json','-inventory.stdout.json','-inventory.stderr.txt','-contract.stdout.json','-contract.stderr.txt')){if(Test-Path -LiteralPath (Join-Path $root ($prefix+$suffix))){throw 'Refusing existing audit evidence'}}
Push-Location $root
try{
    & $node ($prefix+'.mjs') --prepare
    if($LASTEXITCODE -ne 0){throw 'Cannot pin audit inputs'}
    $gates=@()
    foreach($gate in @(@{name='inventory';arguments=@('scripts/system-backup-schema-inventory.mjs','--check')},@{name='contract';arguments=@('scripts/system-backup-contract-check.mjs','--check','--strict')})){
        $stdout=$prefix+'-'+$gate.name+'.stdout.json';$stderr=$prefix+'-'+$gate.name+'.stderr.txt'
        $arguments=$gate.arguments
        & $node @arguments 1>$stdout 2>$stderr
        $nativeExit=$LASTEXITCODE
        $gates+=@{name=$gate.name;arguments=$arguments;native_exit=$nativeExit;stdout=$stdout;stderr=$stderr}
    }
    [ordered]@{node=$node;gates=$gates;dependencies_installed=$false;remote=$false;recorded_utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
    & $node ($prefix+'.mjs')
    if($LASTEXITCODE -ne 0){throw 'Current completion audit failed to record'}
}finally{Pop-Location}
