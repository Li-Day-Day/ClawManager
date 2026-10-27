$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false;$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$prefix=$PSCommandPath.Substring(0,$PSCommandPath.Length-'-validation.ps1'.Length)
$proposal=Get-Content -LiteralPath ($prefix+'-candidate.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($proposal.owner);$source=Join-Path $owner 'source'
$name=[IO.Path]::GetFileName($owner)
if([IO.Path]::GetDirectoryName($owner) -cne $root -or $name -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath ($prefix+'-native.json'))){throw 'Wrong or existing verification-consistency run'}
$expected=@('backend/internal/systembackupresources/control_exclusion.go','backend/internal/systembackupresources/capture_scope_test.go','backend/internal/systembackupresources/control_exclusion_runtime_test.go','contracts/system-backup/v12/verifier-contract.schema.json','scripts/system-backup-d-control-exclusion.test.mjs')
if(($proposal.changes.path -join '|') -cne ($expected -join '|')){throw 'Wrong verification-consistency publication set'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
function Hash-Bytes([byte[]]$bytes){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
$stages=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false;$published=$false;$owned=$false;$cleanup=$null;$errorText=$null
function Save-BoundsStages{$stages|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-stages.json') -Encoding utf8NoBOM}
function Invoke-BoundsGo([string]$stage,[string[]]$arguments){
 & 'C:/Program Files/Go/bin/go.exe' @arguments 1> ($prefix+'-'+$stage+'.stdout') 2> ($prefix+'-'+$stage+'.stderr')
 $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage=$stage;exit=$code;arguments=$arguments});Save-BoundsStages
 Write-Output ('CONTROL_EXCLUSION_35 stage='+$stage+' exit='+$code)
 if(($stage -in @('baseline','counterfactual') -and $code -ne 1) -or ($stage -notin @('baseline','counterfactual') -and $code -ne 0)){throw ('Unexpected Go stage result '+$stage+' exit='+$code)}
}
function Invoke-BoundsReview([string]$mode){
 & 'C:/Program Files/nodejs/node.exe' ($prefix+'-review.mjs') $mode
 if($LASTEXITCODE -ne 0){throw ('Bounds review failed '+$mode)}
}

function Invoke-ControlNode([string]$mode,[string]$runRoot){
 $env:D_CONTROL_TRACE_ROOT=$runRoot;$env:D_CONTROL_TRACE_OUTPUT=$prefix+'-'+$mode+'-node-reads.jsonl'
 if(Test-Path -LiteralPath $env:D_CONTROL_TRACE_OUTPUT){throw 'Existing Node input trace'}
 Push-Location $runRoot
 try{
  & 'C:/Program Files/nodejs/node.exe' --import $proposal.preload_url ($prefix+'-node-runner.mjs') 'scripts/system-backup-contract-artifacts.test.mjs' 'scripts/system-backup-d-control-exclusion.test.mjs' 1> ($prefix+'-node-'+$mode+'.stdout') 2> ($prefix+'-node-'+$mode+'.stderr')
  $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage='node-'+$mode;exit=$code});Save-BoundsStages
  if($code -ne 0){throw ('Node contract checks failed '+$mode)}
  & 'C:/Program Files/nodejs/node.exe' --import $proposal.preload_url scripts/system-backup-d-dto-check.mjs 1> ($prefix+'-dto-'+$mode+'.stdout') 2> ($prefix+'-dto-'+$mode+'.stderr')
  $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage='dto-'+$mode;exit=$code});Save-BoundsStages
  if($code -ne 0){throw ('DTO check failed '+$mode)}
  Write-Output ('CONTROL_EXCLUSION_35 node='+$mode+' exit=0')
 }finally{Pop-Location}
}

try{
 [IO.Directory]::CreateDirectory($owner)|Out-Null;$owned=$true
 [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name)
 $base=New-DIndexSourceSnapshot -Root $root -Destination $source
 $base|Add-Member -NotePropertyName owner -NotePropertyValue $owner
 $base|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-base.json') -Encoding utf8NoBOM
 
 $baselineReads=Get-Content -LiteralPath ($prefix+'-baseline-node-r2-reads.jsonl')|ForEach-Object{$_|ConvertFrom-Json}
 $suppNames=@($baselineReads|Where-Object{$_.op -eq 'read' -and $_.exists -and $_.path -cnotin $base.files.path}|ForEach-Object{$_.path}|Sort-Object -CaseSensitive -Unique)
 $suppBefore=Get-DIndexInputPins -Root $root -Files $suppNames
 foreach($p in $suppBefore){$dest=Join-Path $source $p.path;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null;Copy-Item -LiteralPath (Join-Path $root $p.path) -Destination $dest;(Get-Item -LiteralPath $dest).IsReadOnly=$true}
 $suppAfter=Get-DIndexInputPins -Root $root -Files $suppNames
 if((Get-DIndexPinDigest -Pins $suppBefore) -cne (Get-DIndexPinDigest -Pins $suppAfter)){throw 'Supplemental Node source changed during copy'}
 $supp=[pscustomobject]@{kind='d_control_exclusion_node_supplement';files=$suppBefore;source_sha256=(Get-DIndexPinDigest -Pins $suppBefore)}
 $supp|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-supplement.json') -Encoding utf8NoBOM
 function Test-ControlPrivateSource {
  Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
  $currentSupplement=Get-DIndexInputPins -Root $source -Files $supp.files.path
  if((Get-DIndexPinDigest -Pins $currentSupplement) -cne $supp.source_sha256){throw 'Frozen Node supplement drift'}
 }
 foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
 [IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
 $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
 $env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
 Push-Location (Join-Path $source 'backend')
 try{Invoke-BoundsGo 'baseline' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupresources')}finally{Pop-Location}
 Test-DIndexSourceSnapshot -Root $source -Manifest $base

 foreach($change in $proposal.changes){
  $file=Join-Path $source $change.path
  if($null -ne $change.before_sha256){
   if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $change.before_sha256){throw 'Runtime changed before source freeze'}
   (Get-Item -LiteralPath $file).IsReadOnly=$false
  }elseif(Test-Path -LiteralPath $file){throw 'Test file already exists'}
  [IO.File]::WriteAllBytes($file,[Convert]::FromBase64String($change.candidate_bytes_base64))
 }
 & 'C:/Program Files/Go/bin/gofmt.exe' -w (Join-Path $source $expected[0]) (Join-Path $source $expected[1]) (Join-Path $source $expected[2])
 if($LASTEXITCODE -ne 0){throw 'Bounds gofmt failed'}
 $tested=@(foreach($change in $proposal.changes){$file=Join-Path $source $change.path;$bytes=[IO.File]::ReadAllBytes($file);(Get-Item -LiteralPath $file).IsReadOnly=$true;[pscustomobject]@{path=$change.path;before_sha256=$change.before_sha256;before_bytes_base64=$change.before_bytes_base64;after_sha256=(Hash-Bytes $bytes);tested_bytes_base64=[Convert]::ToBase64String($bytes)}})
 $tested|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-tested-files.json') -Encoding utf8NoBOM
 $pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
 if($pins.Count -ne $base.files.Count+2){throw 'Unexpected verification-consistency file delta'}
 foreach($p in $base.files){if($p.path -cnotin $expected -and (@($pins|Where-Object path -CEQ $p.path)[0].sha256 -cne $p.sha256)){throw ('Unrelated private source change '+$p.path)}}
 $manifest=[pscustomobject]@{kind='d_control_exclusion_35_source';files=$pins;source_sha256=(Get-DIndexPinDigest -Pins $pins);dependencies_installed=$false}
 $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
 Test-ControlPrivateSource
 Push-Location (Join-Path $source 'backend')
 try{
  $listing='{{.ImportPath}}'+[char]9+'{{.Dir}}'+[char]9+'{{join .GoFiles "|"}}'+[char]9+'{{join .CgoFiles "|"}}'+[char]9+'{{join .EmbedFiles "|"}}'
  Invoke-BoundsGo 'dependencies' @('list','-mod=readonly','-deps','-test','-f',$listing,'./internal/systembackupresources')
  Invoke-BoundsReview '--baseline'
  $runtime=Join-Path $source $expected[0]
  $positiveText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($tested[0].tested_bytes_base64))
  $removedGuard="`tif err := ctx.Err(); err != nil {`n`t`treturn nil, err`n`t}`n`treturn checks, nil"
  if(([regex]::Matches($positiveText,[regex]::Escape($removedGuard))).Count -ne 1){throw 'Completion counterfactual guard not unique'}
  $mutant=[Text.Encoding]::UTF8.GetBytes($positiveText.Replace($removedGuard,"`treturn checks, nil"))
  [ordered]@{positive_sha256=$tested[0].after_sha256;mutant_sha256=(Hash-Bytes $mutant);removed_guard=$removedGuard;mutant_bytes_base64=[Convert]::ToBase64String($mutant)}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath ($prefix+'-completion-counterfactual.json') -Encoding utf8NoBOM
  try{
   (Get-Item -LiteralPath $runtime).IsReadOnly=$false;[IO.File]::WriteAllBytes($runtime,$mutant);(Get-Item -LiteralPath $runtime).IsReadOnly=$true
   Invoke-BoundsGo 'counterfactual' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-run','^TestControlExclusionCompletionContext$','-json','./internal/systembackupresources')
  }finally{(Get-Item -LiteralPath $runtime).IsReadOnly=$false;[IO.File]::WriteAllBytes($runtime,[Convert]::FromBase64String($tested[0].tested_bytes_base64));(Get-Item -LiteralPath $runtime).IsReadOnly=$true}
  Invoke-BoundsReview '--counter'
  Invoke-BoundsGo 'isolated' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupresources')
  Invoke-ControlNode 'isolated' $source
  Test-ControlPrivateSource
  Invoke-BoundsReview '--prepare'
 }finally{Pop-Location}
 foreach($directory in @('backend/internal/systembackupresources','contracts/system-backup/v12','scripts')){
  $cursor=Join-Path $root $directory
  while($true){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication directory'};if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)}
 }
 $opened=[Collections.Generic.List[object]]::new()
 try{
  foreach($p in $tested){if($null -eq $p.before_sha256){continue};$target=Join-Path $root $p.path;if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected target'};$stream=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$opened.Add([pscustomobject]@{pin=$p;stream=$stream});$mem=[IO.MemoryStream]::new();try{$stream.CopyTo($mem);$before=$mem.ToArray()}finally{$mem.Dispose()};if((Hash-Bytes $before) -cne $p.before_sha256){throw 'Concurrent target change; preserve shared bytes'}}
  foreach($p in $tested){if($null -ne $p.before_sha256){continue};$newFile=[IO.File]::Open((Join-Path $root $p.path),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=[Convert]::FromBase64String($p.tested_bytes_base64);$newFile.Write($bytes,0,$bytes.Length);$newFile.Flush($true)}finally{$newFile.Dispose()}}
  foreach($entry in $opened){$bytes=[Convert]::FromBase64String($entry.pin.tested_bytes_base64);$entry.stream.Position=0;$entry.stream.SetLength(0);$entry.stream.Write($bytes,0,$bytes.Length);$entry.stream.Flush($true)}
 }finally{foreach($entry in $opened){$entry.stream.Dispose()}}
 $published=$true;Invoke-BoundsReview '--published'
 Push-Location (Join-Path $root 'backend')
 try{Invoke-BoundsReview '--current';Invoke-BoundsGo 'published' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupresources');Invoke-ControlNode 'published' $root;Invoke-BoundsReview '--current'}finally{Pop-Location}
 Test-ControlPrivateSource;$post=$true
 Invoke-BoundsReview '--validate';$exit=0
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
   if(Test-Path -LiteralPath $owner){throw 'Bounds cleanup incomplete'}
   $cleanup=[pscustomobject]@{owner=$owner;removed=$true;files_removed=$count;test_build_artifacts_removed=$true;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')}
   Write-Output ('CONTROL_EXCLUSION_35_CLEANUP files='+$count+' removed=True')
  }
 }catch{$exit=-1;$errorText=$_.Exception.Message;throw}finally{
  Save-BoundsStages
  [ordered]@{kind='d_control_exclusion_35_native';exit=$exit;source_postcheck=$post;published=$published;cleanup=$cleanup;error=$errorText;stages=$stages;default_vet=$true;dependencies_installed=$false;actual_mysql=$false;remote_executed=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
 }
}
Invoke-BoundsReview '--finalize'
Write-Output 'CONTROL_EXCLUSION_35_DONE published=yes cleanup=yes default-vet=yes dependencies-installed=no actual-mysql=not-run'
