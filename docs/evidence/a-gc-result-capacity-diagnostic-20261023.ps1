# Isolated, deterministic stale/fresh result-report experiment. Repository Go
# source is unchanged; overlays and an owned copy of existing build cache are
# removed in finally. This is not an owner baseline or actual SQL acceptance.
[CmdletBinding()]
param([string]$CacheSource='')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$gcDiagRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gcDiagToken=[guid]::NewGuid().ToString('N')
$gcDiagOwner=Join-Path $gcDiagRoot ('.tmp-d-index-cache-'+$gcDiagToken)
$gcDiagStem=Join-Path $PSScriptRoot ('a-gc-result-capacity-'+$gcDiagToken)
$gcDiagVars=@('GO111MODULE','GOWORK','GOENV','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$gcDiagSaved=@{};foreach($name in $gcDiagVars){$gcDiagSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$gcDiagError=$null;$gcDiagExit=$null;$gcDiagPost=$false;$gcDiagCopied=0
try {
 if(Test-Path -LiteralPath $gcDiagOwner){throw 'Diagnostic owner exists'}
 [IO.Directory]::CreateDirectory($gcDiagOwner)|Out-Null
 [IO.File]::WriteAllText((Join-Path $gcDiagOwner 'owner.txt'),[IO.Path]::GetFileName($gcDiagOwner))
 & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') create $gcDiagOwner ($gcDiagStem+'-source.json')
 if($LASTEXITCODE -ne 0){throw 'Diagnostic source snapshot failed'}
 foreach($dir in @('cache','tmp','telemetry','overlay')){[IO.Directory]::CreateDirectory((Join-Path $gcDiagOwner $dir))|Out-Null}
 if($CacheSource){
  $gcDiagOldCache=[IO.Path]::GetFullPath($CacheSource);$gcDiagCacheOwner=[IO.Path]::GetDirectoryName($gcDiagOldCache)
  if([IO.Path]::GetDirectoryName($gcDiagCacheOwner) -cne $gcDiagRoot -or [IO.Path]::GetFileName($gcDiagCacheOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($gcDiagOldCache) -cne 'cache' -or $gcDiagCacheOwner -ceq $gcDiagOwner -or ((Get-Item -Force -LiteralPath $gcDiagCacheOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $gcDiagCacheOwner 'owner.txt')) -cne [IO.Path]::GetFileName($gcDiagCacheOwner)){throw 'Explicit cache source is not an existing workspace-owned Go cache'}
 }else{
  $gcDiagOldRoot=Join-Path $gcDiagRoot '.tmp-d-index-cache-9657c9180fec4a6bb5659c7c8437a605/source'
  $gcDiagOldChildren=@(Get-ChildItem -LiteralPath $gcDiagOldRoot -Directory -Filter '.tmp-a-evidence-*')
  if($gcDiagOldChildren.Count -ne 1){throw 'Original owned build cache unavailable; no cold or duplicate full gate started'}
  $gcDiagOldCache=Join-Path $gcDiagOldChildren[0].FullName 'cache'
 }
 if(-not(Test-Path -LiteralPath $gcDiagOldCache -PathType Container) -or ((Get-Item -LiteralPath $gcDiagOldCache -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Original owned cache identity differs'}
 foreach($cacheDir in Get-ChildItem -LiteralPath $gcDiagOldCache -Directory){
  if($cacheDir.Name -notmatch '^[a-f0-9]{2}$'){continue}
  if($cacheDir.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache refused'}
  $targetDir=Join-Path $gcDiagOwner ('cache/'+$cacheDir.Name);[IO.Directory]::CreateDirectory($targetDir)|Out-Null
  foreach($cacheFile in Get-ChildItem -LiteralPath $cacheDir.FullName -File){
   if($cacheFile.Name -notmatch '^[a-f0-9]{64}-[ad]$'){continue}
   if($cacheFile.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache file refused'}
   [IO.File]::Copy($cacheFile.FullName,(Join-Path $targetDir $cacheFile.Name));$gcDiagCopied++
  }
 }
 $gcDiagTarget=Join-Path $gcDiagOwner 'source/backend/internal/systembackupevidence/download_retention_gc_producer_test.go'
 $gcDiagOriginal=[IO.File]::ReadAllText($gcDiagTarget).Replace("`r`n","`n")
 $gcDiagPatched=$gcDiagOriginal
 # Each replacement below must match exactly once; no production file is edited.
 $gcDiagOld="`tbaseQuery := f.db.ownerQuery`n`tf.db.ownerQuery = func(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, bool, error) {"
 $gcDiagNew="`tvar sampleResultCapacity func(time.Time) error`n"+$gcDiagOld
 if([regex]::Matches($gcDiagPatched,[regex]::Escape($gcDiagOld)).Count -ne 1){throw 'Diagnostic query hook pin differs'}
 $gcDiagPatched=$gcDiagPatched.Replace($gcDiagOld,$gcDiagNew)
 $gcDiagOld="`t`t`tf.db.now = at`n`t`t}"
 $gcDiagNew="`t`t`tf.db.now = at`n`t`t`tif aGCDiagnosticFresh && sampleResultCapacity != nil {`n`t`t`t`tif e := sampleResultCapacity(at); e != nil { t.Fatal(e) }`n`t`t`t}`n`t`t}"
 if([regex]::Matches($gcDiagPatched,[regex]::Escape($gcDiagOld)).Count -ne 1){throw 'Diagnostic clock pin differs'}
 $gcDiagPatched=$gcDiagPatched.Replace($gcDiagOld,$gcDiagNew)
 $gcDiagOld="`tresults := resultFixture(t, f)"
 $gcDiagNew="`tresults, sampleResultCapacity := resultFixtureWithReportSampler(t, f)`n`tif e := sampleResultCapacity(f.db.now.Add(-time.Minute)); e != nil { t.Fatal(e) }"
 if([regex]::Matches($gcDiagPatched,[regex]::Escape($gcDiagOld)).Count -ne 1){throw 'Diagnostic result fixture pin differs'}
 $gcDiagPatched=$gcDiagPatched.Replace($gcDiagOld,$gcDiagNew)
 $gcDiagOld="`tif err = results.Finish(context.Background(), committed, DownloadResultObservation{Outcome: `"interrupted`"}); err != nil {`n`t`tt.Fatal(`"paired independent producer result`", err)`n`t}"
 $gcDiagNew=@'
	beforeDeadline := committed.localDeadline
	beforeOp := append([]driver.Value(nil), f.db.m.op...)
	beforeReceipt := append([]driver.Value(nil), f.db.m.receipt...)
	if aGCDiagnosticFresh {
		if e := sampleResultCapacity(time.Now().UTC().Truncate(time.Microsecond)); e != nil { t.Fatal(e) }
	}
	err = results.Finish(context.Background(), committed, DownloadResultObservation{Outcome: "interrupted"})
	if !beforeDeadline.Equal(committed.localDeadline) || !reflect.DeepEqual(beforeOp, f.db.m.op) || !reflect.DeepEqual(beforeReceipt, f.db.m.receipt) {
		t.Fatal("result capacity sampling changed original admission authority or rows")
	}
	if err != nil {
		aGCDiagnosticError = err
		if !aGCDiagnosticFresh { return nil, producer }
		t.Fatal("fresh independent result report failed", err)
	}
	sampleResultCapacity = nil
'@
 if([regex]::Matches($gcDiagPatched,[regex]::Escape($gcDiagOld)).Count -ne 1){throw 'Diagnostic finish pin differs'}
 $gcDiagPatched=$gcDiagPatched.Replace($gcDiagOld,$gcDiagNew)
 $gcDiagExtra=@'
package systembackupevidence
import ("strings"; "testing")
var aGCDiagnosticFresh bool
var aGCDiagnosticError error
func TestAGCProducerResultCapacitySampling(t *testing.T) {
 for _, fresh := range []bool{false,true} {
  name := "stale_report"; if fresh { name="fresh_report" }
  t.Run(name,func(t *testing.T) {
   aGCDiagnosticFresh=fresh; aGCDiagnosticError=nil
   gc,producer := newGCProducerCollectorFixture(t)
   if fresh {
    if gc==nil || producer==nil || aGCDiagnosticError!=nil {t.Fatal("fresh sampling did not finish original result")}
   } else if gc!=nil || producer==nil || aGCDiagnosticError==nil || !strings.Contains(aGCDiagnosticError.Error(),"capacity_exceeded") {
    t.Fatal("stale physical result observation was not rejected by original guard")
   }
  })
 }
}
'@
 $gcDiagOverlayFile=Join-Path $gcDiagOwner 'overlay/producer_test.go'
 $gcDiagExtraFile=Join-Path $gcDiagOwner 'overlay/diagnostic_test.go'
 [IO.File]::WriteAllText($gcDiagOverlayFile,$gcDiagPatched,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText($gcDiagExtraFile,$gcDiagExtra,[Text.UTF8Encoding]::new($false))
 $gcDiagMap=@{};$gcDiagMap[$gcDiagTarget]=$gcDiagOverlayFile;$gcDiagMap[(Join-Path $gcDiagOwner 'source/backend/internal/systembackupevidence/a_gc_capacity_diagnostic_test.go')]=$gcDiagExtraFile
 $gcDiagOverlay=Join-Path $gcDiagOwner 'overlay.json'
 [IO.File]::WriteAllText($gcDiagOverlay,(@{Replace=$gcDiagMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
 $gcDiagCapsule=@{original_sha256=(Get-FileHash -LiteralPath $gcDiagTarget -Algorithm SHA256).Hash.ToLowerInvariant();overlays=@(@{target='download_retention_gc_producer_test.go';bytes_base64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($gcDiagPatched))},@{target='a_gc_capacity_diagnostic_test.go';bytes_base64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($gcDiagExtra))})}
 [IO.File]::WriteAllText(($gcDiagStem+'-overlay-source.json'),($gcDiagCapsule|ConvertTo-Json -Depth 7))
 $env:GO111MODULE='on';$env:GOWORK='off';$env:GOENV='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
 $env:GOCACHE=Join-Path $gcDiagOwner 'cache';$env:GOTMPDIR=Join-Path $gcDiagOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $gcDiagOwner 'telemetry'
 [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
 Push-Location (Join-Path $gcDiagOwner 'source/backend')
 try{& go test -overlay $gcDiagOverlay -count=1 -timeout=180s -json -run '^TestAGCProducerResultCapacitySampling$' ./internal/systembackupevidence 2>&1|Tee-Object -FilePath ($gcDiagStem+'.jsonl');$gcDiagExit=$LASTEXITCODE}finally{Pop-Location}
 & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $gcDiagOwner ($gcDiagStem+'-source.json')
 if($LASTEXITCODE -ne 0){throw 'Diagnostic frozen source postcheck failed'}
 $gcDiagPost=$true
 if($gcDiagExit -ne 0){throw 'Capacity diagnostic native test failed'}
 $gcDiagNames=@(Get-Content -LiteralPath ($gcDiagStem+'.jsonl')|ForEach-Object {$_|ConvertFrom-Json}|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Test}|Sort-Object)
 if(($gcDiagNames -join ',') -ne 'TestAGCProducerResultCapacitySampling,TestAGCProducerResultCapacitySampling/fresh_report,TestAGCProducerResultCapacitySampling/stale_report'){throw 'Diagnostic exact cases not executed'}
} catch {$gcDiagError=$_.Exception.Message} finally {
 foreach($name in $gcDiagVars){[Environment]::SetEnvironmentVariable($name,$gcDiagSaved[$name],'Process')}
 if(Test-Path -LiteralPath $gcDiagOwner){
  $resolved=(Resolve-Path -LiteralPath $gcDiagOwner).Path
  if([IO.Path]::GetDirectoryName($resolved) -cne $gcDiagRoot -or [IO.Path]::GetFileName($resolved) -cne ('.tmp-d-index-cache-'+$gcDiagToken) -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved)){throw 'Diagnostic cleanup outside exact owner refused'}
  foreach($entry in Get-ChildItem -LiteralPath $resolved -Recurse -Force){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Diagnostic redirected child cleanup refused'}}
  Remove-Item -LiteralPath $resolved -Recurse -Force
 }
 $record=[ordered]@{kind='a_gc_result_capacity_diagnostic.v1';error=$gcDiagError;test_exit=$gcDiagExit;source=($gcDiagStem+'-source.json');overlay_source=($gcDiagStem+'-overlay-source.json');log=($gcDiagStem+'.jsonl');frozen_postcheck=$gcDiagPost;copied_existing_cache_files=$gcDiagCopied;existing_cache_source=$gcDiagOldCache;owner=$gcDiagOwner;owner_removed=(-not(Test-Path -LiteralPath $gcDiagOwner));repository_Go_edited=$false;production_deadlines_changed=$false;dependencies_installed=$false;actual_mysql=$false}
 [IO.File]::WriteAllText(($gcDiagStem+'.json'),($record|ConvertTo-Json -Depth 6))
 Write-Output ('GC_CAPACITY_DIAGNOSTIC='+$gcDiagStem+'.json')
}
if($gcDiagError){throw $gcDiagError}
