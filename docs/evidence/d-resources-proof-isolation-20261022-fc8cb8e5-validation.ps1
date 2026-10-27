$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false;$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$prefix=$PSCommandPath.Substring(0,$PSCommandPath.Length-'-validation.ps1'.Length)
$proposal=Get-Content -LiteralPath ($prefix+'-candidate.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($proposal.owner);$source=Join-Path $owner 'source'
$name=[IO.Path]::GetFileName($owner)
if([IO.Path]::GetDirectoryName($owner) -cne $root -or $name -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath ($prefix+'-native.json'))){throw 'Wrong or existing resources-proof-isolation run'}
$expected=@('backend/internal/systembackupresources/verifier.go','backend/internal/systembackupresources/verifier_input_isolation_test.go')
if(($proposal.changes.path -join '|') -cne ($expected -join '|')){throw 'Wrong resources-proof-isolation publication set'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
function Hash-Bytes([byte[]]$bytes){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
$stages=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false;$published=$false;$owned=$false;$cleanup=$null;$errorText=$null
function Save-BoundsStages{$stages|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-stages.json') -Encoding utf8NoBOM}
function Invoke-BoundsGo([string]$stage,[string[]]$arguments){
 & 'C:/Program Files/Go/bin/go.exe' @arguments 1> ($prefix+'-'+$stage+'.stdout') 2> ($prefix+'-'+$stage+'.stderr')
 $code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage=$stage;exit=$code;arguments=$arguments});Save-BoundsStages
 Write-Output ('RESOURCES_PROOF_ISOLATION stage='+$stage+' exit='+$code)
 if(($stage -eq 'counterfactual' -and $code -ne 1) -or ($stage -ne 'counterfactual' -and $code -ne 0)){throw ('Unexpected Go stage result '+$stage+' exit='+$code)}
}
function Invoke-BoundsReview([string]$mode){
 & 'C:/Program Files/nodejs/node.exe' ($prefix+'-review.mjs') $mode
 if($LASTEXITCODE -ne 0){throw ('Bounds review failed '+$mode)}
}
try{
 [IO.Directory]::CreateDirectory($owner)|Out-Null;$owned=$true
 [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name)
 $base=New-DIndexSourceSnapshot -Root $root -Destination $source
 $base|Add-Member -NotePropertyName owner -NotePropertyValue $owner
 $base|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-base.json') -Encoding utf8NoBOM
 foreach($change in $proposal.changes){
  $file=Join-Path $source $change.path
  if($null -ne $change.before_sha256){
   if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $change.before_sha256){throw 'Runtime changed before source freeze'}
   (Get-Item -LiteralPath $file).IsReadOnly=$false
  }elseif(Test-Path -LiteralPath $file){throw 'Test file already exists'}
  [IO.File]::WriteAllBytes($file,[Convert]::FromBase64String($change.candidate_bytes_base64))
 }
 & 'C:/Program Files/Go/bin/gofmt.exe' -w (Join-Path $source $expected[0]) (Join-Path $source $expected[1])
 if($LASTEXITCODE -ne 0){throw 'Bounds gofmt failed'}
 $tested=@(foreach($change in $proposal.changes){$file=Join-Path $source $change.path;$bytes=[IO.File]::ReadAllBytes($file);(Get-Item -LiteralPath $file).IsReadOnly=$true;[pscustomobject]@{path=$change.path;before_sha256=$change.before_sha256;before_bytes_base64=$change.before_bytes_base64;after_sha256=(Hash-Bytes $bytes);tested_bytes_base64=[Convert]::ToBase64String($bytes)}})
 $tested|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-tested-files.json') -Encoding utf8NoBOM
 $pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
 if($pins.Count -ne $base.files.Count+1){throw 'Unexpected resources-proof-isolation file delta'}
 foreach($p in $base.files){if($p.path -cnotin $expected -and (@($pins|Where-Object path -CEQ $p.path)[0].sha256 -cne $p.sha256)){throw ('Unrelated private source change '+$p.path)}}
 $manifest=[pscustomobject]@{kind='d_resources_proof_isolation_source';files=$pins;source_sha256=(Get-DIndexPinDigest -Pins $pins);dependencies_installed=$false}
 $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
 foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
 [IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
 $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
 $env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 Push-Location (Join-Path $source 'backend')
 try{
  $listing='{{.ImportPath}}'+[char]9+'{{.Dir}}'+[char]9+'{{join .GoFiles "|"}}'+[char]9+'{{join .CgoFiles "|"}}'+[char]9+'{{join .EmbedFiles "|"}}'
  Invoke-BoundsGo 'dependencies' @('list','-mod=readonly','-deps','-test','-f',$listing,'./internal/systembackupresources')
  $runtime=Join-Path $source $expected[0]
  try{
   (Get-Item -LiteralPath $runtime).IsReadOnly=$false;[IO.File]::WriteAllBytes($runtime,[Convert]::FromBase64String($tested[0].before_bytes_base64));(Get-Item -LiteralPath $runtime).IsReadOnly=$true
   Invoke-BoundsGo 'counterfactual' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-run','^TestResourcesCaptureProof(CannotChangeValidatedInputs|InputsStaySeparate|CannotHideOriginalMismatches|EmptyAuditPreservesNull)$','-json','./internal/systembackupresources')
  }finally{(Get-Item -LiteralPath $runtime).IsReadOnly=$false;[IO.File]::WriteAllBytes($runtime,[Convert]::FromBase64String($tested[0].tested_bytes_base64));(Get-Item -LiteralPath $runtime).IsReadOnly=$true}
  Invoke-BoundsReview '--counter'
  Invoke-BoundsGo 'isolated' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupresources')
  Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
  Invoke-BoundsReview '--prepare'
 }finally{Pop-Location}
 $cursor=Join-Path $root 'backend/internal/systembackupresources'
 while($true){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication directory'};if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)}
 $target=Join-Path $root $expected[0]
 if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected runtime target'}
 $locked=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 try{
  $mem=[IO.MemoryStream]::new();try{$locked.CopyTo($mem);$before=$mem.ToArray()}finally{$mem.Dispose()}
  if((Hash-Bytes $before) -cne $tested[0].before_sha256){throw 'Concurrent runtime change; preserve shared source'}
  $newFile=[IO.File]::Open((Join-Path $root $expected[1]),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$bytes=[Convert]::FromBase64String($tested[1].tested_bytes_base64);$newFile.Write($bytes,0,$bytes.Length);$newFile.Flush($true)}finally{$newFile.Dispose()}
  $bytes=[Convert]::FromBase64String($tested[0].tested_bytes_base64);$locked.Position=0;$locked.SetLength(0);$locked.Write($bytes,0,$bytes.Length);$locked.Flush($true)
 }finally{$locked.Dispose()}
 $published=$true;Invoke-BoundsReview '--published'
 Push-Location (Join-Path $root 'backend')
 try{Invoke-BoundsReview '--current';Invoke-BoundsGo 'published' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','./internal/systembackupresources');Invoke-BoundsReview '--current'}finally{Pop-Location}
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;$post=$true
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
   Write-Output ('RESOURCES_PROOF_ISOLATION_CLEANUP files='+$count+' removed=True')
  }
 }catch{$exit=-1;$errorText=$_.Exception.Message;throw}finally{
  Save-BoundsStages
  [ordered]@{kind='d_resources_proof_isolation_native';exit=$exit;source_postcheck=$post;published=$published;cleanup=$cleanup;error=$errorText;stages=$stages;default_vet=$true;dependencies_installed=$false;actual_mysql=$false;remote_executed=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
 }
}
Invoke-BoundsReview '--finalize'
Write-Output 'RESOURCES_PROOF_ISOLATION_DONE published=yes cleanup=yes default-vet=yes dependencies-installed=no actual-mysql=not-run'
