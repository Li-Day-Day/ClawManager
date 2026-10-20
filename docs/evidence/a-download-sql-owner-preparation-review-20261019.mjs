import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const evidence=path.join(root,'docs/evidence');
const base='a-download-owners-local-20261019-165059-856f9b88';
const repair='a-download-owners-seed-repair-20261019-170506-331926c5';
const read=n=>fs.readFileSync(path.join(evidence,n));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const parse=b=>JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
const checks=[];function check(n,v){assert(v,n);checks.push(n);}
const baseLog=read(base+'.txt').toString('utf8').replaceAll('\r\n','\n');
const baseSourceBytes=read('a-download-owners-source-20261019-165059-856f9b88.json');
const sourceBytes=read(repair+'-source.json');
const old=parse(baseSourceBytes),source=parse(sourceBytes);
for(const [label,s] of [['ordinary',old],['corrected tagged',source]]){
  check(label+' source stable/offline/unapproved',s.stable_copy_verified===true&&s.dependencies_installed===false&&s.production_approved===false);
  check(label+' source SHA recomputed',sha(s.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===s.source_sha256);
}
check('base frozen source bound to full-package log',baseLog.includes(`source_sha256=${old.source_sha256} files=${old.files.length}`));
check('base has no failed/skipped tests',!/^\s*--- (FAIL|SKIP):|^FAIL(?:\s|$)|^panic:/m.test(baseLog));
const summaries=[...baseLog.matchAll(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm)];
check('base completed two full packages and seed package',JSON.stringify(summaries.map(m=>m[1]))===JSON.stringify(['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupevidence']));
let offset=0;
const ordinary=summaries.slice(0,2).map(m=>{
  const part=baseLog.slice(offset,m.index);offset=m.index+m[0].length;
  const ran=[...part.matchAll(/^=== RUN\s+(\S+)$/gm)].map(m=>m[1]).sort();
  const passed=[...part.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]).sort();
  check(m[1]+' all RUN/PASS paired uniquely',new Set(ran).size===ran.length&&JSON.stringify(ran)===JSON.stringify(passed));
  return {package:m[1],main_pass:passed.filter(p=>!p.includes('/')).length,all_pass:passed.length};
});
const oldPins=new Map(old.files.map(p=>[p.path,p]));
const pins=new Map(source.files.map(p=>[p.path,p]));
check('ordinary snapshot inputs remain present', [...oldPins.keys()].every(p=>pins.has(p)));
const additions=source.files.filter(p=>!oldPins.has(p.path)).map(p=>p.path).sort();
check('three declared concurrent task-chain inputs only',JSON.stringify(additions)===JSON.stringify(['backend/internal/systembackupevidence/download_task_owner_chain_mysql_test.go','scripts/system-backup-d-download-task-chain-dispatch.test.ps1','scripts/system-backup-d-download-task-chain-phase.sh'].sort()));
const differences=source.files.filter(p=>p.sha256!==oldPins.get(p.path)?.sha256||p.size!==oldPins.get(p.path)?.size).map(p=>p.path).sort();
const allowed=['backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-download-admission-native-validation.ps1',...additions].sort();
check('differences limited to tagged fixtures, declared concurrent profile and local helper',JSON.stringify(differences)===JSON.stringify(allowed));
check('all ordinary Go/module/embedded inputs byte-identical',source.files.filter(p=>!p.path.startsWith('scripts/')&&p.path!=='backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go'&&!additions.includes(p.path)).every(p=>oldPins.get(p.path)?.sha256===p.sha256));
const fixturePath=allowed.find(p=>p.endsWith('.go'));
const fixture=fs.readFileSync(path.join(root,fixturePath));
check('corrected fixture matches repair frozen bytes',sha(fixture)===pins.get(fixturePath).sha256);
check('changed Go file excluded from ordinary build',fixture.toString('utf8').startsWith('//go:build systembackup_mysql\n'));
const concurrentPath='backend/internal/systembackupevidence/download_task_owner_chain_mysql_test.go';
const concurrent=fs.readFileSync(path.join(root,concurrentPath));
check('new concurrent Go input is also excluded from ordinary build',sha(concurrent)===pins.get(concurrentPath).sha256&&concurrent.toString('utf8').replaceAll('\r\n','\n').startsWith('//go:build systembackup_mysql\n'));
check('corrected seed checks published key length',fixture.toString('utf8').includes('"owner-sql-probe-" + r.kind')&&fixture.toString('utf8').includes('len(row.args[2].(string)) < 16'));
const native=read(repair+'-native.txt').toString('utf8').replaceAll('\r\n','\n');
check('repair log bound to its source',native.includes(`FROZEN files=${source.files.length} sha256=${source.source_sha256}`));
function verifyEvents(bytes,label){
  const es=bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  check(label+' no failures/skips',!es.some(e=>e.Action==='fail'||e.Action==='skip'));
  const ran=es.filter(e=>e.Action==='run'&&e.Test).map(e=>e.Test).sort(),passed=es.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test).sort();
  check(label+' thirteen unique checks paired',ran.length===13&&new Set(ran).size===13&&JSON.stringify(ran)===JSON.stringify(passed));
  check(label+' new SQL owner seed passed',passed.includes('TestASQLTaskDownloadOwnersMySQLSeed'));
}
verifyEvents(read(repair+'.jsonl'),'corrected seed gate');
verifyEvents(read(repair+'-tagged-seed.txt'),'corrected packaged probe seed');
const detached=read(repair+'-detached-seed.txt').toString('utf8');
check('detached corrected seeds thirteen checks',!/^\s*--- (FAIL|SKIP):|^FAIL(?:\s|$)/m.test(detached)&&(detached.match(/^\s*--- PASS: /gm)||[]).length===13&&detached.includes('PASS SQL task owner seed; actual_mysql=not_run'));
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
  check(stage+' exit zero',native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));
  check(stage+' stderr empty',read(repair+'-'+stage+'-stderr.txt').length===0);
}
check('corrected gate default vet/frozen postcheck/exit zero',native.includes('NATIVE_EXIT focused_packages=0')&&native.includes('default_vet=yes')&&native.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no')&&native.includes('d_admission_native_exit=0'));
const binaries=[...native.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]}));
check('three corrected Windows/Linux payloads pinned',binaries.length===3&&new Set(binaries.map(b=>b.name)).size===3);
const baseOwner=baseLog.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)?.[1].trim();
const repairOwner=native.match(/ owner=(.+)$/m)?.[1].trim();
const cacheOwner=parse(read(repair+'-owner.json')).path;
for(const [label,p] of [['base',baseOwner],['repair',repairOwner],['cache',cacheOwner]])check(label+' exact workspace owner absent',!!p&&path.dirname(path.resolve(p))===root&&!fs.existsSync(p));
check('both wrappers reported cleanup',baseLog.includes(`LOCAL_CLEANUP config-writer-source-owned=${baseOwner} removed=True`)&&native.includes('CLEANED snapshot=True'));
check('base outer exit zero and no remote requested',baseLog.includes('a_download_owners_local_exit=0')&&baseLog.includes('remote-requested=False'));
check('all corrected source paths stay within workspace',source.files.every(p=>path.resolve(root,p.path).startsWith(root+path.sep)));
const drift=[];for(const p of source.files){const target=path.resolve(root,p.path);if(!fs.existsSync(target))drift.push(p.path);else{const b=fs.readFileSync(target);if(b.length!==p.size||sha(b)!==p.sha256)drift.push(p.path);}}
const transportDrift=['scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-download-admission-native-validation.ps1'];
check('current Go/data/owner phase still match; exactly two declared transport changes',JSON.stringify([...drift].sort())===JSON.stringify([...transportDrift].sort()));
const transport=read('a-download-owners-current-transport-20261019.txt').toString('utf8').replaceAll('\r\n','\n');
for(const p of transportDrift)check('current transport bytes independently checked '+p,transport.includes(`CURRENT_TRANSPORT path=${p} sha256=${sha(fs.readFileSync(path.join(root,p)))}`));
check('current WinPS owner/admission/MFA/general and Bash checks passed',transport.includes('CURRENT_TRANSPORT_PASS windows_powershell=5.1 profile_regressions=4 bash_parse=yes source_postcheck=yes remote=no build=no'));
const report={kind:'a_sql_task_download_owner_local_preparation_review',recorded_at:new Date().toISOString(),checks_passed:checks.length,checks,ordinary,ordinary_main:ordinary.reduce((n,p)=>n+p.main_pass,0),ordinary_all:ordinary.reduce((n,p)=>n+p.all_pass,0),ordinary_source_sha256:old.source_sha256,ordinary_source_manifest_sha256:sha(baseSourceBytes),corrected_source_sha256:source.source_sha256,corrected_source_manifest_sha256:sha(sourceBytes),source_files:source.files.length,explicit_snapshot_differences:differences,concurrent_inputs_not_accepted:additions,current_transport_drift:drift,current_transport_log_sha256:sha(read('a-download-owners-current-transport-20261019.txt')),current_transport_scope:'Current profile bindings, exclusive guards and shell syntax only; these later script bytes are not retroactively part of the earlier Go build snapshot.',corrected_seed_checks:13,detached_seed_checks:13,binaries,cleanup:{baseOwner,repairOwner,cacheOwner,all_absent:true},actual_mysql:false,actual_task_owner_cases_pending:11,production_tasks:false,provider_read:false,dependencies_installed:false,production_approved:false,new_inputs_not_covered:true,scope:'Full ordinary package results bind to byte-identical ordinary Go/module/embedded inputs. Changes/new Go inputs are build-tagged; the corrected owner fixture was separately seed-tested/compiled. Concurrent D task-chain logic is type-checked only and excluded from functional acceptance. Earlier SQL fixture bytes are excluded. No actual owner SQL, producer history, production grants or deployment acceptance.'};
fs.writeFileSync(path.join(evidence,'a-download-sql-owner-preparation-review-20261019.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({ordinary,source_files:report.source_files,differences,binaries,actual_mysql:false,all_owned_products_removed:true}));
