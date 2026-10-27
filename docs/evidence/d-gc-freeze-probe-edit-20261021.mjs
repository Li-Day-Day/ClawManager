import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const owner=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e');
if(fs.readFileSync(path.join(owner,'owner.txt'),'utf8')!==path.basename(owner)) throw Error('owner');
const source=path.join(owner,'source');
function edit(file,fn){const p=path.join(source,file);let before=fs.readFileSync(p,'utf8');let after=fn(before);if(before===after)throw Error('no edit '+file);fs.chmodSync(p,0o666);fs.writeFileSync(p,after);}
function replaceOne(s,a,b){if(s.split(a).length!==2)throw Error('ambiguous replacement '+a);return s.replace(a,()=>b);}
if(!fs.readFileSync(path.join(source,'scripts/system-backup-d-config-writer-validation.ps1'),'utf8').includes('[switch]$DownloadGCFreezeOnly')) edit('scripts/system-backup-d-config-writer-validation.ps1',s=>{
 s=replaceOne(s,'    [switch]$DownloadGCTaskOnly,','    [switch]$DownloadGCTaskOnly,\n    [switch]$DownloadGCFreezeOnly,');
 const old=s.split(/\r?\n/).find(x=>x.startsWith('if($DownloadGCTaskOnly -and'));
 const gate=old.replaceAll('DownloadGCTaskOnly','DownloadGCFreezeOnly').replace('($DownloadGCRoleOnly','($DownloadGCTaskOnly -or $DownloadGCRoleOnly');
 s=replaceOne(s,old,gate+'\n'+old);
 s=replaceOne(s,'        if($DownloadGCTaskOnly){',"        if($DownloadGCFreezeOnly){\n            & (Join-Path $writerFrozen 'scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1')\n        } elseif($DownloadGCTaskOnly){");
 return replaceOne(s,'-ConfigDownloadGCTaskOnly:$DownloadGCTaskOnly','-ConfigDownloadGCTaskOnly:$DownloadGCTaskOnly -ConfigDownloadGCFreezeOnly:$DownloadGCFreezeOnly');
});
edit('scripts/system-backup-a-evidence-validation.ps1',s=>{
 s=replaceOne(s,'    [switch]$ConfigDownloadGCTaskOnly,','    [switch]$ConfigDownloadGCTaskOnly,\n    [switch]$ConfigDownloadGCFreezeOnly,');
 const old=s.split(/\r?\n/).find(x=>x.startsWith('if($ConfigDownloadGCTaskOnly -and'));
 const gate=old.replaceAll('ConfigDownloadGCTaskOnly','ConfigDownloadGCFreezeOnly').replace('-or $ConfigDownloadGCRoleOnly','-or $ConfigDownloadGCTaskOnly -or $ConfigDownloadGCRoleOnly');
 s=replaceOne(s,old,gate+'\nif($ConfigDownloadGCFreezeOnly){$ConfigDownloadMFAOnly=$true}\n'+old);
 s=replaceOne(s,"                    if($ConfigDownloadGCTaskOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-d-download-gc-task-dispatch.test.ps1') }","                    if($ConfigDownloadGCFreezeOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1') }\n                    if($ConfigDownloadGCTaskOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-d-download-gc-task-dispatch.test.ps1') }");
 s=replaceOne(s,"if($ConfigDownloadGCTaskOnly){Write-Output 'VALIDATION_SCOPE download-gc-task-only", "if($ConfigDownloadGCFreezeOnly){Write-Output 'VALIDATION_SCOPE download-gc-freeze-only=yes component=backup-lock-prerequisites scope=synthetic full-gc=not-run freeze-adapter=not-wired role-approval=no production-approval=no real_mysql=not_run'}elseif($ConfigDownloadGCTaskOnly){Write-Output 'VALIDATION_SCOPE download-gc-task-only");
 for(const [assignment,value] of [
  ['configProofSeedPattern',"'^Test(DDownloadGCFreezeMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'"],
  ['evidenceProbeName',"'d-download-gc-freeze.test'"],
  ['evidenceProfile',"'d-download-gc-freeze'"],
  ['evidencePhaseSource',"'scripts/system-backup-d-download-gc-freeze-phase.sh'"]
 ])s=replaceOne(s,'$'+assignment+'=if($ConfigDownloadGCTaskOnly)', '$'+assignment+'=if($ConfigDownloadGCFreezeOnly){'+value+'}elseif($ConfigDownloadGCTaskOnly)');
 return s;
});
const phase=fs.readFileSync(path.join(source,'scripts/system-backup-d-download-gc-task-phase.sh'),'utf8')
 .replace('# GC task-eligibility component only; keep earlier accepted suites separate.','# Backup-lock prerequisite experiment only; isolated synthetic accounts, no Collect.')
 .replaceAll('d-download-gc-task','d-download-gc-freeze')
 .replaceAll('TestDDownloadGCTaskMySQL','TestDDownloadGCFreezeMySQL')
 .replaceAll('new_cases=18','new_cases=34')
 .replaceAll('component=SQLDownloadGCTaskEligibility','component=backup-lock-prerequisites freeze_adapter=not_wired');
const phasePath=path.join(source,'scripts/system-backup-d-download-gc-freeze-phase.sh');
if(fs.existsSync(phasePath))throw Error('phase occupied');fs.writeFileSync(phasePath,phase.replaceAll('\r\n','\n'));
let dispatch=fs.readFileSync(path.join(source,'scripts/system-backup-d-download-gc-task-dispatch.test.ps1'),'utf8')
 .replaceAll('GCTask','GCFreeze').replaceAll('gcTask','gcFreeze').replaceAll('GC task','GC freeze')
 .replaceAll('d-download-gc-task','d-download-gc-freeze').replaceAll('new_cases=18','new_cases=34')
 .replaceAll('component=SQLDownloadGCFreezeEligibility', 'component=backup-lock-prerequisites')
 .replaceAll('PASS download-gc-task-dispatch:','PASS download-gc-freeze-dispatch:')
 .replace('eighteen component cases','thirty-four prerequisite cases');
dispatch=replaceOne(dispatch,'$ConfigDownloadGCFreezeOnly=$true;','$ConfigDownloadGCFreezeOnly=$true;$ConfigDownloadGCTaskOnly=$false;');
dispatch=replaceOne(dispatch,"@('ConfigDownloadGCRoleOnly'","@('ConfigDownloadGCTaskOnly','ConfigDownloadGCRoleOnly'");
dispatch=replaceOne(dispatch,"@('DownloadGCRoleOnly'","@('DownloadGCTaskOnly','DownloadGCRoleOnly'");
dispatch=replaceOne(dispatch,"'TestADownloadGCRoleMySQL'","'TestDDownloadGCTaskMySQL','TestADownloadGCRoleMySQL'");
dispatch=replaceOne(dispatch,"'full_gc=not_run','role_approval=no'","'full_gc=not_run','freeze_adapter=not_wired','role_approval=no'");
const dp=path.join(source,'scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1');
if(fs.existsSync(dp))throw Error('dispatcher occupied');fs.writeFileSync(dp,dispatch);
console.log('FREEZE_PROFILE_EDIT scripts=4 remote=not_run production_approval=no');
