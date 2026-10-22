import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096/source');
const read=p=>fs.readFileSync(p);const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(read(path.join(root,'docs/evidence/d-a-cost-aggregate-v2-20261021-r2-full-source.json')));
const pins=new Map(manifest.files.map(x=>[x.path,x]));
const expected=new Map([
 ['scripts/system-backup-a-live-chain-inventory.sh','9e6ee07598c1253c159874933745058907a0d0661e9c80007f052995737a5ec0'],
 ['scripts/system-backup-a-live-chain.mjs','d0eec9a31a39aa32499dd2c72eed9cc7f99416cf2f5e75f0a03bb804f2320e0b'],
 ['scripts/system-backup-a-live-chain.ps1','4f33e6d58fc24d119b26e9f681d5b2827c4f66f9796da8e0bba9d370f4f5cf9d'],
 ['scripts/system-backup-a-live-chain.test.mjs','8190778d44f422bbbd0b59b533bc88a7e3db4beb788313a328bafc3ee797fadb'],
]);
const modules=new Set();
const visit=p=>{
 if(modules.has(p))return;modules.add(p);
 const text=read(path.join(source,p)).toString();
 for(const m of text.matchAll(/(?:from\s*|import\s*\(|import\s*)['"](\.[^'"]+)['"]/g))visit(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1])));
};
for(const p of ['scripts/system-backup-contract-check.test.mjs','scripts/system-backup-contract-artifacts.test.mjs','scripts/system-backup-a-object-fixtures.test.mjs','scripts/system-backup-schema-inventory.mjs','scripts/system-backup-contract-check.mjs'])visit(p);
for(const p of expected.keys())assert.equal(modules.has(p),false,'live tool imported by tested module');
const needle='system-backup-a-live-chain';
for(const p of modules)assert.equal(read(path.join(source,p)).toString().includes(needle),false,'live tool referenced by tested module');
const deps=read(path.join(root,'docs/evidence/d-a-cost-aggregate-v2-20261021-r2-tagged-deps.txt')).toString().split(/\r?\n/).map(x=>x.slice(x.indexOf('|')+1).replaceAll('\\','/'));
const prefix=(source+path.sep).replaceAll('\\','/').toLowerCase();
const dirs=[...new Set(deps.filter(x=>x.toLowerCase().startsWith(prefix)).map(x=>x.slice(prefix.length)))];
const goInputs=manifest.files.filter(x=>x.path.endsWith('.go')&&dirs.some(d=>x.path.startsWith(d+'/')));
for(const p of goInputs)assert.equal(read(path.join(source,p.path)).toString().includes(needle),false,'live tool referenced by compiled local Go source');
const livePattern='^scripts/system-backup-a-live-chain(?:[-.][a-z0-9.-]+)?\\.(?:mjs|ps1|sh)$';
const liveRegex=new RegExp(livePattern);
const family=fs.readdirSync(path.join(root,'scripts')).map(n=>'scripts/'+n).filter(n=>liveRegex.test(n)).sort();
const files=family.map(p=>{
 if(pins.has(p))assert.equal(sha(read(path.join(source,p))),pins.get(p).sha256);
 assert.equal(modules.has(p),false);
 return {path:p,frozen_sha256:pins.get(p)?.sha256??null,observed_sha256:sha(read(path.join(root,p))),previous_diff_review_sha256:expected.get(p)??null};
});
const report={kind:'d_a_cost_concurrent_publish_review',status:'source_assessment_preserve_unowned_not_test_acceptance',frozen_source_sha256:manifest.source_sha256,
 initial_publication_guard:'stopped_before_target_writes',files,
 assessment:['inventory shell adds public lab CA validity metadata','live HTTP audit helper adds exact receipt fields, canonical size/hash and time ordering checks','PowerShell wrapper specifies UTF-8 stdin','live-chain tests expand shell/TLS/CLI cases'],
 tested_node_module_closure:[...modules].sort(),compiled_local_go_inputs_checked:goInputs.length,
 directory_enumeration_review:'Go capacity test enumerates only its t.TempDir; Node inventory enumerates SQL migrations, repository Go files and fixed deployment YAML, not live-chain scripts',
 tested_node_closure_references_live_tools:false,compiled_go_source_references_live_tools:false,
 live_tools_executed:false,live_tools_accepted:false,publish_only_cost_owned_files:true,dependencies_installed:false,remote:false};
report.concurrent_files_may_continue_changing=true;
report.allowed_path_pattern=livePattern;
report.permission_scope='The live-chain family has no incoming edge from the verified execution/input closure; observed bytes are recorded, not accepted or copied. Keep guards for all compiled Go sources, module files, contract inputs and every other script.';
const parity=JSON.parse(read(path.join(source,'contracts/system-backup/v12/dto-parity.json')));
assert.equal(parity.typescript_snapshot,'frontend/src/types/systemBackupContract.ts');
const changedFrontend=['frontend/scripts/system-backups-i18n.test.mjs','frontend/src/lib/systemBackupI18n.ts','frontend/src/pages/admin/backups/BackupLiveActivity.tsx','frontend/src/pages/admin/backups/BackupLiveWorkspace.tsx','frontend/src/pages/admin/backups/SystemBackupsPage.tsx'];
for(const p of modules){const text=read(path.join(source,p)).toString();for(const f of changedFrontend)assert.equal(text.includes(path.posix.basename(f)),false,'changed frontend file referenced by tested Node module');}
for(const p of goInputs){const text=read(path.join(source,p.path)).toString();for(const f of changedFrontend)assert.equal(text.includes(path.posix.basename(f)),false,'changed frontend file referenced by compiled Go source');}
report.frontend_read_scope=[parity.typescript_snapshot];
report.frontend_assessment='Contract artifact tests read the DTO Typescript snapshot via dto-parity.json; no module enumerates frontend or imports UI tests/components. Other frontend files were copied as extra context, not executed or accepted by the 79 tests.';
report.changed_frontend_context_not_accepted=changedFrontend.map(p=>({path:p,observed_sha256:sha(read(path.join(root,p)))}));
const out=path.join(root,'docs/evidence/d-a-cost-aggregate-v2-concurrent-publish-review-v3-20261021.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,node_modules:modules.size,go_inputs:goInputs.length,status:report.status}));
