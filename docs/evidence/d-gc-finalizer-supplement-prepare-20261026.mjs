import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
let text=fs.readFileSync(path.join(dir,'d-gc-finalizer-validation-20261026.ps1'),'utf8');
const first=text.indexOf("        Invoke-CloseGo -GoArguments @('test','-json','-count=1','-timeout=10m'");
const resume=text.indexOf("        $closeWindowsOwner=Join-Path $closeOwner 'binary/owner-seeds.exe'",first);
assert.ok(first>0 && resume>first);
const http=text.split('\n').find(l=>l.trimStart().startsWith('$closeHTTPSources=@('));
const pattern=text.split('\n').find(l=>l.trimStart().startsWith('$closeOwnerPattern='));
assert.ok(http && pattern);
text=text.slice(0,first)+http+'\n'+pattern+"\n        Invoke-CloseGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','./internal/systembackupsecurity')\n"+text.slice(resume);
function change(a,b){assert.equal(text.split(a).length,2,`Ambiguous supplement transform: ${a.slice(0,80)}`);text=text.replace(a,()=>b);}
change('            & $closeWindowsOwner -test.run $closeOwnerPattern -test.v -test.count=1 -test.timeout=60s 2>&1|Tee-Object -FilePath $closeDetachedLog',
 `            $closeDetachedArguments=@('-test.run',$closeOwnerPattern,'-test.v','-test.count=1','-test.timeout=60s')
            & $closeWindowsOwner @closeDetachedArguments 2>&1|Tee-Object -FilePath $closeDetachedLog`);
change("'binary/admin-read.test'),'./internal/db')", "'binary/admin-read.test'),'./internal/systembackupsecurity')");
change("    foreach($closeDirectory in @('cache','tmp','binary','telemetry'))",`    $prior=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-a9b3f627a8134e5798ca12b34880d1af.json') -Raw|ConvertFrom-Json
    $checkpoint=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-finalizer-first-segment-checkpoint-20261026.json') -Raw|ConvertFrom-Json
    $currentSource=Get-Content -LiteralPath $closeManifest -Raw|ConvertFrom-Json
    if(-not $prior.owner_removed -or (Test-Path -LiteralPath $prior.owner) -or $checkpoint.native_exit -ne 0 -or $currentSource.source_sha256 -cne '41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16'){throw 'Same-source completed first segment required; no supplement test started'}
    foreach($closeDirectory in @('cache','tmp','binary','telemetry'))`);
change("runner_profile='finalizer_diagnostics_six_packages_three_seeds_owner_packaged_detached_linux_five_builds_standalone_two_predecessor_counterexamples'", "runner_profile='finalizer_same_source_supplement_after_primary_stages_0_to_10';primary_validation='docs/evidence/d-local-closeout-a9b3f627a8134e5798ca12b34880d1af.json';primary_source_checkpoint='docs/evidence/d-gc-finalizer-first-segment-checkpoint-20261026.json'");
fs.writeFileSync(path.join(dir,'d-gc-finalizer-supplement-validation-20261026.ps1'),text);
console.log('FINALIZER_SUPPLEMENT_PREPARED');
