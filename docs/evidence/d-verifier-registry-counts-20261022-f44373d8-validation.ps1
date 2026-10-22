$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false;$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$prefix=$PSCommandPath.Substring(0,$PSCommandPath.Length-'-validation.ps1'.Length)
$proposal=Get-Content -LiteralPath ($prefix+'-candidate.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($proposal.owner);$source=Join-Path $owner 'source';$name=[IO.Path]::GetFileName($owner)
if([IO.Path]::GetDirectoryName($owner) -cne $root -or $name -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath ($prefix+'-native.json'))){throw 'Wrong or existing run owner'}
$expected=@('contracts/system-backup/v12/verifier-contract.schema.json','scripts/system-backup-contract-check.mjs','scripts/system-backup-d-control-exclusion.test.mjs','scripts/system-backup-verifier-registry.test.mjs')
if(($proposal.changes.path -join '|') -cne ($expected -join '|')){throw 'Unexpected publication set'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
function Hash-Bytes([byte[]]$bytes){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
$stages=[Collections.Generic.List[object]]::new();$exit=-1;$published=$false;$post=$false;$owned=$false;$cleanup=$null;$errorText=$null
function Save-Stages{$stages|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-stages.json') -Encoding utf8NoBOM}
$preload=([Uri]($prefix+'-fs-trace.mjs')).AbsoluteUri
function Invoke-Node([string]$stage,[string[]]$arguments,[int]$expectedExit=0){
 $env:D_CONTROL_TRACE_OUTPUT=$prefix+'-'+$stage+'-reads.jsonl'
 if(Test-Path -LiteralPath $env:D_CONTROL_TRACE_OUTPUT){throw 'Existing input trace'}
 & 'C:/Program Files/nodejs/node.exe' --import $preload @arguments 1> ($prefix+'-'+$stage+'.stdout') 2> ($prefix+'-'+$stage+'.stderr')
 $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage=$stage;exit=$code;arguments=$arguments});Save-Stages
 Write-Output ('VERIFIER_REGISTRY stage='+$stage+' exit='+$code)
 if($code -ne $expectedExit){throw ('Unexpected Node exit '+$stage+' '+$code)}
}
function Review([string]$mode){& 'C:/Program Files/nodejs/node.exe' ($prefix+'-review.mjs') $mode;if($LASTEXITCODE -ne 0){throw ('Review failed '+$mode)}}
$oldTests=@('scripts/system-backup-contract-artifacts.test.mjs','scripts/system-backup-d-control-exclusion.test.mjs','scripts/system-backup-contract-check.test.mjs')
$newTests=$oldTests+@('scripts/system-backup-verifier-registry.test.mjs')
try{
 [IO.Directory]::CreateDirectory($owner)|Out-Null;$owned=$true;[IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name)
 [IO.Directory]::CreateDirectory((Join-Path $owner 'tmp'))|Out-Null;$env:TMP=Join-Path $owner 'tmp';$env:TEMP=$env:TMP
 $base=New-DIndexSourceSnapshot -Root $root -Destination $source
 $base|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-base.json') -Encoding utf8NoBOM
 $suppNames=@(Get-Content -LiteralPath ($prefix+'-supplement-names.json') -Raw|ConvertFrom-Json)
 $suppBefore=Get-DIndexInputPins -Root $root -Files $suppNames
 foreach($p in $suppBefore){$dest=Join-Path $source $p.path;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null;Copy-Item -LiteralPath (Join-Path $root $p.path) -Destination $dest;(Get-Item -LiteralPath $dest).IsReadOnly=$true}
 $suppAfter=Get-DIndexInputPins -Root $root -Files $suppNames
 if((Get-DIndexPinDigest -Pins $suppBefore) -cne (Get-DIndexPinDigest -Pins $suppAfter)){throw 'Supplement changed during copy'}
 $supp=[pscustomobject]@{files=$suppBefore;source_sha256=(Get-DIndexPinDigest -Pins $suppBefore)}
 $supp|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-supplement.json') -Encoding utf8NoBOM
 foreach($p in $proposal.changes){$file=Join-Path $source $p.path;if($null -eq $p.before_sha256){if(Test-Path -LiteralPath $file){throw 'New test already exists'}}elseif((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.before_sha256){throw 'Candidate preimage changed before freeze'}}
 $env:D_CONTROL_TRACE_ROOT=$source;Push-Location $source
 try{
  Invoke-Node 'baseline-cli' @('scripts/system-backup-contract-check.mjs','--check')
  Invoke-Node 'baseline-tests' (@($prefix+'-node-runner.mjs')+$oldTests)
 }finally{Pop-Location}
 Test-DIndexSourceSnapshot -Root $source -Manifest $base
 foreach($p in $proposal.changes){$file=Join-Path $source $p.path;if(Test-Path -LiteralPath $file){(Get-Item -LiteralPath $file).IsReadOnly=$false};[IO.File]::WriteAllBytes($file,[Convert]::FromBase64String($p.candidate_bytes_base64));(Get-Item -LiteralPath $file).IsReadOnly=$true}
 $pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
 if($pins.Count -ne $base.files.Count+1){throw 'Unexpected source file delta'}
 foreach($p in $base.files){if($p.path -cnotin $expected -and (@($pins|Where-Object path -CEQ $p.path)[0].sha256 -cne $p.sha256)){throw 'Unexpected private change'}}
 $manifest=[pscustomobject]@{kind='d_verifier_registry_count_source';files=$pins;source_sha256=(Get-DIndexPinDigest -Pins $pins)}
 $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
 $env:D_CONTROL_TRACE_ROOT=$source;Push-Location $source
 try{
  Invoke-Node 'isolated-tests' (@($prefix+'-node-runner.mjs')+$newTests)
  Invoke-Node 'isolated-cli' @('scripts/system-backup-contract-check.mjs','--check')
  Invoke-Node 'isolated-strict' @('scripts/system-backup-contract-check.mjs','--check','--strict') 1
  Invoke-Node 'isolated-dto' @('scripts/system-backup-d-dto-check.mjs')
  $schemaFile=Join-Path $source $expected[0];$registryFile=Join-Path $source 'contracts/system-backup/v12/schema-registry.json';$registryHash=(Get-FileHash -LiteralPath $registryFile).Hash
  try{
   (Get-Item -LiteralPath $schemaFile).IsReadOnly=$false;[IO.File]::WriteAllBytes($schemaFile,[Convert]::FromBase64String($proposal.changes[0].before_bytes_base64));(Get-Item -LiteralPath $schemaFile).IsReadOnly=$true
   Invoke-Node 'counter-cli' @('scripts/system-backup-contract-check.mjs','--check') 1
   Invoke-Node 'counter-write' @('scripts/system-backup-contract-check.mjs','--write') 1
   Invoke-Node 'counter-tests' @($prefix+'-node-runner.mjs','scripts/system-backup-d-control-exclusion.test.mjs','scripts/system-backup-verifier-registry.test.mjs') 1
   if((Get-FileHash -LiteralPath $registryFile).Hash -cne $registryHash){throw 'Rejected counterfactual wrote registry'}
  }finally{(Get-Item -LiteralPath $schemaFile).IsReadOnly=$false;[IO.File]::WriteAllBytes($schemaFile,[Convert]::FromBase64String($proposal.changes[0].candidate_bytes_base64));(Get-Item -LiteralPath $schemaFile).IsReadOnly=$true}
 }finally{Pop-Location}
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 Review '--prepare'
 foreach($directory in @('contracts/system-backup/v12','scripts')){$cursor=Join-Path $root $directory;while($true){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected target directory'};if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)}}
 $opened=[Collections.Generic.List[object]]::new()
 try{
  foreach($p in $proposal.changes){if($null -eq $p.before_sha256){continue};$file=Join-Path $root $p.path;if((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected target'};$stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$opened.Add([pscustomobject]@{pin=$p;stream=$stream});$mem=[IO.MemoryStream]::new();try{$stream.CopyTo($mem);$bytes=$mem.ToArray()}finally{$mem.Dispose()};if((Hash-Bytes $bytes) -cne $p.before_sha256){throw 'Concurrent target change; preserve shared bytes'}}
  foreach($p in $proposal.changes){if($null -ne $p.before_sha256){continue};$stream=[IO.File]::Open((Join-Path $root $p.path),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=[Convert]::FromBase64String($p.candidate_bytes_base64);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
  foreach($entry in $opened){$bytes=[Convert]::FromBase64String($entry.pin.candidate_bytes_base64);$entry.stream.Position=0;$entry.stream.Write($bytes,0,$bytes.Length);$entry.stream.SetLength($bytes.Length);$entry.stream.Flush($true)}
 }finally{foreach($entry in $opened){$entry.stream.Dispose()}}
 $published=$true;Review '--current'
 $env:D_CONTROL_TRACE_ROOT=$root;Push-Location $root
 try{
  Invoke-Node 'published-tests' (@($prefix+'-node-runner.mjs')+$newTests)
  Invoke-Node 'published-cli' @('scripts/system-backup-contract-check.mjs','--check')
  Invoke-Node 'published-strict' @('scripts/system-backup-contract-check.mjs','--check','--strict') 1
  Invoke-Node 'published-dto' @('scripts/system-backup-d-dto-check.mjs')
 }finally{Pop-Location}
 Review '--current';Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 $suppFinal=Get-DIndexInputPins -Root $source -Files $suppNames
 if((Get-DIndexPinDigest -Pins $suppFinal) -cne $supp.source_sha256){throw 'Supplement drift'}
 Review '--validate';$post=$true;$exit=0
}catch{$errorText=$_.Exception.Message;throw}finally{
 try{
  if($owned -and (Test-Path -LiteralPath $owner)){
   $resolved=(Resolve-Path -LiteralPath $owner).Path
   if($resolved -cne $owner -or [IO.Path]::GetDirectoryName($resolved) -cne $root -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne $name){throw 'Wrong cleanup owner'}
   if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cleanup directory'}
   $children=@(Get-ChildItem -LiteralPath $owner -Recurse -Force)
   foreach($entry in $children){if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $entry.FullName.StartsWith($owner+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Redirected cleanup child'}}
   $count=@($children|Where-Object{-not $_.PSIsContainer}).Count
   Remove-Item -LiteralPath $owner -Recurse -Force
   if(Test-Path -LiteralPath $owner){throw 'Cleanup incomplete'}
   $cleanup=[pscustomobject]@{owner=$owner;removed=$true;files_removed=$count;test_build_artifacts_removed=$true;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')};Write-Output ('VERIFIER_REGISTRY_CLEANUP files='+$count+' removed=True')
  }
 }catch{$exit=-1;$errorText=$_.Exception.Message;throw}finally{
  Save-Stages
  [ordered]@{kind='d_verifier_registry_count_native';exit=$exit;published=$published;source_postcheck=$post;cleanup=$cleanup;error=$errorText;stages=$stages;dependencies_installed=$false;actual_mysql=$false;go_tests_run=$false;remote_executed=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
 }
}
Review '--finalize'
Write-Output 'VERIFIER_REGISTRY_DONE published=yes cleanup=yes dependencies-installed=no actual-mysql=not-run'
