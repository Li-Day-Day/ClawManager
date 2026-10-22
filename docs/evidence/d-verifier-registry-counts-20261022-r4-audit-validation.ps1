$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false;$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path;$prefix=$PSCommandPath.Substring(0,$PSCommandPath.Length-'-validation.ps1'.Length)
$inputs=Get-Content -LiteralPath ($prefix+'-inputs.json') -Raw|ConvertFrom-Json;$owner=[IO.Path]::GetFullPath($inputs.owner);$name=[IO.Path]::GetFileName($owner)
if([IO.Path]::GetDirectoryName($owner) -cne $root -or $name -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath ($prefix+'-native.json'))){throw 'Wrong or existing independent audit owner'}
$stages=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false;$owned=$false;$cleanup=$null;$errorText=$null
function Review{& 'C:/Program Files/nodejs/node.exe' ($prefix+'-review.mjs') '--audit-before';if($LASTEXITCODE -ne 0){throw 'Independent evidence or current source mismatch'}}
function Run([string]$stage,[string[]]$arguments){& 'C:/Program Files/nodejs/node.exe' @arguments 1> ($prefix+'-'+$stage+'.stdout') 2> ($prefix+'-'+$stage+'.stderr');$code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage=$stage;exit=$code;arguments=$arguments});if($code -ne 0){throw ('Independent run failed '+$stage)};Write-Output ('VERIFIER_REGISTRY_AUDIT stage='+$stage+' exit=0')}
try{
 Review
 [IO.Directory]::CreateDirectory($owner)|Out-Null;$owned=$true;[IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name);[IO.Directory]::CreateDirectory((Join-Path $owner 'tmp'))|Out-Null
 $env:TMP=Join-Path $owner 'tmp';$env:TEMP=$env:TMP;$env:D_CONTROL_TRACE_ROOT=$root
 Push-Location $root
 try{
  $runner=Join-Path $root ('docs/evidence/'+$inputs.original_prefix+'-node-runner.mjs')
  Run 'recheck' @($runner,'scripts/system-backup-contract-artifacts.test.mjs','scripts/system-backup-d-control-exclusion.test.mjs','scripts/system-backup-contract-check.test.mjs','scripts/system-backup-verifier-registry.test.mjs')
  Run 'dto' @('scripts/system-backup-d-dto-check.mjs')
 }finally{Pop-Location}
 Review;$post=$true;$exit=0
}catch{$errorText=$_.Exception.Message;throw}finally{
 try{
  if($owned -and (Test-Path -LiteralPath $owner)){
   $resolved=(Resolve-Path -LiteralPath $owner).Path
   if($resolved -cne $owner -or [IO.Path]::GetDirectoryName($resolved) -cne $root -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne $name){throw 'Wrong cleanup owner'}
   if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cleanup directory'}
   $children=@(Get-ChildItem -LiteralPath $owner -Recurse -Force)
   foreach($entry in $children){if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $entry.FullName.StartsWith($owner+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Redirected cleanup child'}}
   $count=@($children|Where-Object{-not $_.PSIsContainer}).Count;Remove-Item -LiteralPath $owner -Recurse -Force
   if(Test-Path -LiteralPath $owner){throw 'Incomplete cleanup'}
   $cleanup=[pscustomobject]@{owner=$owner;removed=$true;files_removed=$count;test_build_artifacts_removed=$true;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')};Write-Output ('VERIFIER_REGISTRY_AUDIT_CLEANUP files='+$count+' removed=True')
  }
 }catch{$exit=-1;$errorText=$_.Exception.Message;throw}finally{
  [ordered]@{kind='d_verifier_registry_count_independent_native';exit=$exit;inputs_before_after=$post;cleanup=$cleanup;error=$errorText;stages=$stages;dependencies_installed=$false;go_tests_run=$false;actual_mysql=$false;remote_executed=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
 }
}
& 'C:/Program Files/nodejs/node.exe' ($prefix+'-review.mjs') '--finalize'
if($LASTEXITCODE -ne 0){throw 'Independent final acceptance failed'}
Write-Output 'VERIFIER_REGISTRY_AUDIT_DONE accepted=yes cleanup=yes dependencies-installed=no'
