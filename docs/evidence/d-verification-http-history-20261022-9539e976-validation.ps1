$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false;$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path;$prefix=$PSCommandPath.Substring(0,$PSCommandPath.Length-'-validation.ps1'.Length)
$proposal=Get-Content -LiteralPath ($prefix+'-candidate.json') -Raw|ConvertFrom-Json;$config=Get-Content -LiteralPath ($prefix+'-config.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($proposal.owner);$source=Join-Path $owner 'source';$name=[IO.Path]::GetFileName($owner)
if([IO.Path]::GetDirectoryName($owner) -cne $root -or $name -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath ($prefix+'-native.json'))){throw 'Wrong or existing history probe run'}
$expected=@('backend/cmd/server/system_backup_read_live_mysql_test.go','backend/cmd/server/system_backup_read_verification_history_mysql_test.go')
if(($proposal.changes.path -join '|') -cne ($expected -join '|')){throw 'Wrong history probe publication set'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
function Hash-Bytes([byte[]]$bytes){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
$stages=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false;$published=$false;$owned=$false;$cleanup=$null;$errorText=$null
function Save-Stages{$stages|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-stages.json') -Encoding utf8NoBOM}
function Go([string]$stage,[string[]]$arguments){& 'C:/Program Files/Go/bin/go.exe' @arguments 1> ($prefix+'-'+$stage+'.stdout') 2> ($prefix+'-'+$stage+'.stderr');$code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage=$stage;exit=$code;arguments=$arguments});Save-Stages;Write-Output ('VERIFICATION_HTTP_HISTORY stage='+$stage+' exit='+$code);if($code -ne 0){throw ('Go stage failed '+$stage)}}
function Review([string]$mode){& 'C:/Program Files/nodejs/node.exe' ($prefix+'-review.mjs') $mode;if($LASTEXITCODE -ne 0){throw ('History probe review failed '+$mode)}}
try{
 [IO.Directory]::CreateDirectory($owner)|Out-Null;$owned=$true;[IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name)
 $base=New-DIndexSourceSnapshot -Root $root -Destination $source;$base|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-base.json') -Encoding utf8NoBOM
 foreach($p in $proposal.changes){$file=Join-Path $source $p.path;if($null -eq $p.before_sha256){if(Test-Path -LiteralPath $file){throw 'New probe already exists'}}else{if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.before_sha256){throw 'Concurrent preimage drift'};(Get-Item -LiteralPath $file).IsReadOnly=$false};[IO.File]::WriteAllBytes($file,[Convert]::FromBase64String($p.candidate_bytes_base64))}
 & 'C:/Program Files/Go/bin/gofmt.exe' -w (Join-Path $source $expected[0]) (Join-Path $source $expected[1]);if($LASTEXITCODE -ne 0){throw 'gofmt failed'}
 $tested=@(foreach($p in $proposal.changes){$file=Join-Path $source $p.path;$bytes=[IO.File]::ReadAllBytes($file);(Get-Item -LiteralPath $file).IsReadOnly=$true;[pscustomobject]@{path=$p.path;before_sha256=$p.before_sha256;before_bytes_base64=$p.before_bytes_base64;after_sha256=(Hash-Bytes $bytes);tested_bytes_base64=[Convert]::ToBase64String($bytes)}})
 $tested|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-tested-files.json') -Encoding utf8NoBOM
 $pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
 if($pins.Count -ne $base.files.Count+1){throw 'Wrong source file delta'}
 foreach($p in $base.files){if($p.path -cnotin $expected -and (@($pins|Where-Object path -CEQ $p.path)[0].sha256 -cne $p.sha256)){throw 'Unrelated private source change'}}
 $manifest=[pscustomobject]@{kind='d_verification_http_history_source';files=$pins;source_sha256=(Get-DIndexPinDigest -Pins $pins)};$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
 foreach($dir in @('cache','tmp','telemetry/local','binary')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null};[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
 $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
 Push-Location (Join-Path $source 'backend')
 try{
  $listing='{{.ImportPath}}'+[char]9+'{{.Dir}}'+[char]9+'{{join .GoFiles "|"}}'+[char]9+'{{join .CgoFiles "|"}}'+[char]9+'{{join .EmbedFiles "|"}}'
  Go 'dependencies' @('list','-mod=readonly','-tags=systembackup_mysql','-deps','-test','-f',$listing,'./cmd/server')
  Go 'isolated' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-tags=systembackup_mysql','-run',$config.run_regex,'-json','./cmd/server')
  Go 'windows-build' @('test','-mod=readonly','-p=1','-c','-trimpath','-buildvcs=false','-tags=systembackup_mysql','-o',(Join-Path $owner 'binary/server-http.test.exe'),'./cmd/server')
  & (Join-Path $owner 'binary/server-http.test.exe') -test.list '^TestDAdminReadLiveHTTPMySQL$' 1> ($prefix+'-test-list.stdout') 2> ($prefix+'-test-list.stderr');$code=$LASTEXITCODE;$stages.Add([pscustomobject]@{stage='test-list';exit=$code});Save-Stages;if($code -ne 0){throw 'Detached probe list failed'}
  $env:GOOS='linux'
  try{Go 'linux-build' @('test','-mod=readonly','-p=1','-c','-trimpath','-buildvcs=false','-tags=systembackup_mysql','-o',(Join-Path $owner 'binary/server-http.test'),'./cmd/server')}finally{$env:GOOS='windows'}
  $binaries=@(Get-DIndexInputPins -Root $owner -Files @('binary/server-http.test.exe','binary/server-http.test'));$binaries|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-binaries.json') -Encoding utf8NoBOM
  Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;Review '--prepare'
 }finally{Pop-Location}
 foreach($directory in @('backend/cmd/server')){$cursor=Join-Path $root $directory;while($true){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected publication directory'};if($cursor -ceq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)}}
 $opened=[Collections.Generic.List[object]]::new()
 try{
  foreach($p in $tested){if($null -eq $p.before_sha256){continue};$target=Join-Path $root $p.path;if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected target'};$stream=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$opened.Add([pscustomobject]@{pin=$p;stream=$stream});$mem=[IO.MemoryStream]::new();try{$stream.CopyTo($mem);$bytes=$mem.ToArray()}finally{$mem.Dispose()};if((Hash-Bytes $bytes) -cne $p.before_sha256){throw 'Concurrent target drift; preserve shared bytes'}}
  foreach($p in $tested){if($null -ne $p.before_sha256){continue};$stream=[IO.File]::Open((Join-Path $root $p.path),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=[Convert]::FromBase64String($p.tested_bytes_base64);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
  foreach($entry in $opened){$bytes=[Convert]::FromBase64String($entry.pin.tested_bytes_base64);$entry.stream.Position=0;$entry.stream.Write($bytes,0,$bytes.Length);$entry.stream.SetLength($bytes.Length);$entry.stream.Flush($true)}
 }finally{foreach($entry in $opened){$entry.stream.Dispose()}}
 $published=$true;Review '--current'
 Push-Location (Join-Path $root 'backend')
 try{Go 'published' @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-tags=systembackup_mysql','-run',$config.run_regex,'-json','./cmd/server')}finally{Pop-Location}
 Review '--current';Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;Review '--validate';$post=$true;$exit=0
}catch{$errorText=$_.Exception.Message;throw}finally{
 try{
  if($owned -and (Test-Path -LiteralPath $owner)){
   $resolved=(Resolve-Path -LiteralPath $owner).Path
   if($resolved -cne $owner -or [IO.Path]::GetDirectoryName($resolved) -cne $root -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne $name){throw 'Wrong cleanup owner'}
   if((Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cleanup directory'}
   $children=@(Get-ChildItem -LiteralPath $owner -Recurse -Force);foreach($entry in $children){if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $entry.FullName.StartsWith($owner+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Redirected cleanup child'}}
   $count=@($children|Where-Object{-not $_.PSIsContainer}).Count;Remove-Item -LiteralPath $owner -Recurse -Force;if(Test-Path -LiteralPath $owner){throw 'Cleanup incomplete'}
   $cleanup=[pscustomobject]@{owner=$owner;removed=$true;files_removed=$count;test_build_artifacts_removed=$true;cleaned_utc=(Get-Date).ToUniversalTime().ToString('o')};Write-Output ('VERIFICATION_HTTP_HISTORY_CLEANUP files='+$count+' removed=True')
  }
 }catch{$exit=-1;$errorText=$_.Exception.Message;throw}finally{
  Save-Stages;[ordered]@{kind='d_verification_http_history_native';exit=$exit;published=$published;source_postcheck=$post;cleanup=$cleanup;error=$errorText;stages=$stages;default_vet=$true;dependencies_installed=$false;actual_mysql=$false;remote_executed=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
 }
}
Review '--finalize';Write-Output 'VERIFICATION_HTTP_HISTORY_DONE prepared=yes published=yes cleanup=yes actual-mysql=not-run'
