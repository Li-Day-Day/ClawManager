$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$prefix=$PSCommandPath.Substring(0,$PSCommandPath.Length-'-baseline-node-r2.ps1'.Length)
$env:D_CONTROL_TRACE_ROOT=$root
$env:D_CONTROL_TRACE_OUTPUT=$prefix+'-baseline-node-r2-reads.jsonl'
if(Test-Path -LiteralPath $env:D_CONTROL_TRACE_OUTPUT){throw 'Existing baseline Node trace'}
$preload='file:///C:/Users/zhanghui08/Desktop/clawmanager/ClawManager/docs/evidence/d-control-exclusion-35-20261022-3ef89a46-fs-trace.mjs'
Push-Location $root
try{
 & 'C:/Program Files/nodejs/node.exe' --import $preload scripts/system-backup-contract-artifacts.test.mjs 1> ($prefix+'-baseline-node-r2.stdout') 2> ($prefix+'-baseline-node-r2.stderr')
 $artifactsExit=$LASTEXITCODE
 & 'C:/Program Files/nodejs/node.exe' --import $preload scripts/system-backup-d-dto-check.mjs 1> ($prefix+'-baseline-dto-r2.stdout') 2> ($prefix+'-baseline-dto-r2.stderr')
 $dtoExit=$LASTEXITCODE
 [ordered]@{kind='d_control_exclusion_baseline_node';artifacts_exit=$artifactsExit;dto_exit=$dtoExit;dependencies_installed=$false}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'-baseline-node-r2-native.json') -Encoding utf8NoBOM
 Write-Output ('BASELINE_NODE artifacts='+$artifactsExit+' dto='+$dtoExit)
}finally{Pop-Location}
