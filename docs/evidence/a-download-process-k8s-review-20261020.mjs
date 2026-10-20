import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {emptyDownloadTemplate} from '../../scripts/system-backup-a-download-deployment.mjs';

const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const read=path=>readFileSync(path,'utf8').replace(/^\uFEFF/,'');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function source(prefix){
  const manifest=JSON.parse(read(prefix+'-source.json'));
  assert.equal(manifest.stable_copy_verified,true);assert.equal(manifest.dependencies_installed,false);assert.equal(manifest.production_approved,false);
  assert.equal(hash(manifest.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),manifest.source_sha256);
  return manifest;
}
function absent(owner){assert.ok(owner);assert.equal(dirname(owner).toLowerCase(),root.toLowerCase());assert.match(basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(existsSync(owner),false);return basename(owner);}
const goPrefix=resolve(dir,'a-download-process-20261020-r1'),nodePrefix=resolve(dir,'a-download-k8s-20261020-r1');
const go=source(goPrefix),node=source(nodePrefix),goNative=read(goPrefix+'-native.txt'),nodeNative=read(nodePrefix+'-native.txt');
for(const marker of [`LOCAL_SOURCE sha256=${go.source_sha256} files=${go.files.length}`,'START download-process-main-package default-vet=yes dependencies-installed=no remote=not-run','PASS download-process-main-package','PASS linux-download-process-build sha256=','LOCAL_PASS download-process-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote=not-run','CLEANED download-process-source-cache-binary=True','PowerShell transcript end'])assert.ok(goNative.includes(marker),marker);
for(const marker of [`LOCAL_SOURCE sha256=${node.source_sha256} files=${node.files.length}`,`GO_BINDING registration-command-current=yes source_sha256=${go.source_sha256}`,'PASS download-k8s-node-tests=11 actual-cli=yes no-cluster-contact=yes','PASS base-k8s-node-tests=4','LOCAL_PASS download-k8s-frozen-postcheck=yes dependencies-installed=no cluster=not-contacted','CLEANED download-k8s-source-and-cli-products=True','PowerShell transcript end'])assert.ok(nodeNative.includes(marker),marker);
const events=read(goPrefix+'-packages.jsonl').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(events.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const pkg='clawreef/cmd/system-backup-registration';assert.equal(events.filter(e=>e.Package===pkg&&!e.Test&&e.Action==='pass').length,1);
const passed=events.filter(e=>e.Test&&e.Action==='pass'),ran=events.filter(e=>e.Test&&e.Action==='run');assert.equal(passed.length,ran.length);
for(const e of ran)assert.equal(passed.filter(p=>p.Package===e.Package&&p.Test===e.Test).length,1,e.Test);
const newRoots=['TestDownloadDatabaseIsSeparateLazyPool','TestDownloadDatabaseRejectsAliasingAndUnsafeAccounts','TestDownloadDeploymentRejectsBorrowingRegistrationPool','TestDownloadReadinessUsesRunningJournalWithoutSQL','TestDownloadLiveReadinessRequiresTLSIdentityAndExactDigest','TestDownloadModeAndLoopbackBoundary'];
for(const name of newRoots)assert.equal(passed.filter(e=>e.Test===name).length,1,name);
assert.equal(passed.filter(e=>e.Test.startsWith(newRoots[1]+'/')).length,13);assert.equal(passed.filter(e=>e.Test.startsWith(newRoots[4]+'/')).length,9);
assert.equal(passed.filter(e=>!e.Test.includes('/')).length,14);assert.equal(passed.length,49);
for(const suffix of ['-packages-stderr.txt','-linux-build-stderr.txt','-linux-build.txt'])assert.equal(read(goPrefix+suffix).trim(),'');
for(const [kind,count]of [['download',11],['base',4]]){
  const output=read(nodePrefix+'-'+kind+'.txt');
  for(const [label,n]of [['tests',count],['pass',count],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(output,new RegExp(`(?:^|\\n).*?${label} ${n}\\r?(?:\\n|$)`),kind+' '+label);
  assert.equal(read(nodePrefix+'-'+kind+'-stderr.txt').trim(),'');
}
const goMain=go.files.filter(p=>p.path.startsWith('backend/cmd/system-backup-registration/'));
const nodeMain=node.files.filter(p=>p.path.startsWith('backend/cmd/system-backup-registration/'));
assert.deepEqual(goMain,nodeMain);
const scope=[...goMain.map(p=>p.path),'scripts/system-backup-a-download-deployment.mjs','scripts/system-backup-a-download-deployment.test.mjs','scripts/system-backup-d-deployment.mjs','scripts/system-backup-d-deployment.test.mjs'];
for(const path of scope){const pin=node.files.find(p=>p.path===path);assert.ok(pin,path);assert.equal(hash(readFileSync(resolve(root,path))),pin.sha256,path);}
const extra=JSON.parse(read(nodePrefix+'-templates.json'));
assert.deepEqual(extra.map(p=>p.path).sort(),['deployments/k8s/system-backup-registration.template.json','deployments/k8s/system-backup-download.template.json','deployments/k8s/system-backup-download-sql-pins.template.json'].sort());
for(const pin of extra){const bytes=readFileSync(resolve(root,pin.path));assert.equal(bytes.length,pin.size);assert.equal(hash(bytes),pin.sha256,pin.path);}
const templatePath='deployments/k8s/system-backup-download-k8s.template.json',templateBytes=readFileSync(resolve(root,templatePath));
assert.deepEqual(JSON.parse(templateBytes),emptyDownloadTemplate());assert.equal(templateBytes.toString('utf8'),JSON.stringify(emptyDownloadTemplate(),null,2)+'\n');
const owners=[absent(goNative.match(/LOCAL_OWNER download-process=(.+?) process_id=[0-9]+/)?.[1]),absent(nodeNative.match(/LOCAL_OWNER download-k8s=(.+)/)?.[1].trim())];
assert.equal(existsSync(resolve(root,'.tmp-a-download-render-cO15G8')),false);
const drift=[];for(const pin of node.files){const path=resolve(root,pin.path);assert.ok(path.startsWith(root+sep));if(!existsSync(path)||hash(readFileSync(path))!==pin.sha256)drift.push(pin.path);}
const report={kind:'a_download_separate_sql_and_live_readiness_k8s_local_acceptance',recorded_at:new Date().toISOString(),
  go_source_sha256:go.source_sha256,go_source_count:go.files.length,node_source_sha256:node.source_sha256,node_source_count:node.files.length,
  main_package_roots:14,main_package_checks_including_subtests:49,new_roots:newRoots,new_checks_including_roots:passed.filter(e=>newRoots.some(r=>e.Test===r||e.Test.startsWith(r+'/'))).length,
  node_download_checks:11,node_base_regression_checks:4,actual_tls_client_and_server:true,separate_sql_pool_fixture:true,readiness_journal_opened_once_fixture:true,
  linux_binary_sha256:goNative.match(/PASS linux-download-process-build sha256=([a-f0-9]{64})/)[1],
  main_source_set_identical_across_go_and_node:true,scoped_current_inputs_match:true,other_snapshot_input_drift_excluded:drift,
  extra_template_inputs:extra,generated_empty_template:{path:templatePath,sha256:hash(templateBytes),matches_validated_generator:true,contains_real_material:false},
  frozen_postcheck:true,owned_products_absent:owners,unfrozen_exploratory_cli_spawn_eperm:'excluded; temporary directory independently absent',node_capture_source_only_retry:nodeNative.includes('retry 2/3'),
  dependencies_installed:false,kubernetes_contacted:false,actual_sql:'not_run',sql_roles_approved_or_applied:false,actual_ca_oidc_and_storage_verified:false,human_mfa_and_provider_e2e:false,production_approval:false};
writeFileSync(resolve(dir,'a-download-process-k8s-accepted-20261020-r1.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
