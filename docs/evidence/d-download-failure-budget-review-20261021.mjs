import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const raw = p => fs.readFileSync(path.join(root, p));
const decode = b => b.toString('utf8').replace(/^\uFEFF/, '');
const read = p => JSON.parse(decode(raw(p)));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const digest = pins => sha(pins.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
const basePath = 'docs/evidence/d-download-failure-budget-base-20261021.json';
const base = read(basePath);
assert.equal(base.stable_copy_verified, true);
assert.equal(digest(base.files), base.source_sha256);
const own = ['backend/internal/systembackupevidence/http.go', 'backend/internal/systembackupevidence/download_http_failure_budget_test.go'];
const records = {};
for (const stage of ['counterfactual', 'target', 'full']) {
  const prefix = `docs/evidence/d-download-failure-budget-20261021-${stage}`;
  const source = read(prefix+'-source.json'), native = read(prefix+'-native.json');
  const events = decode(raw(prefix+'.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(digest(source.files), source.source_sha256);
  assert.equal(source.base_source_sha256, base.source_sha256);
  assert.equal(source.files.length, base.files.length+1);
  assert.equal(new Set(source.files.map(p=>p.path)).size, source.files.length);
  for (const p of base.files) {
    if (stage !== 'counterfactual' && p.path === own[0]) continue;
    assert.deepEqual(source.files.find(q=>q.path===p.path), p, p.path);
  }
  assert.equal(native.source_sha256, source.source_sha256);
  assert.equal(native.source_postcheck, true);
  assert.equal(native.default_vet, true);
  assert.equal(native.dependencies_installed, false);
  assert.equal(native.remote, false);
  assert.equal(native.exit, stage === 'counterfactual' ? 1 : 0);
  assert.equal(decode(raw(prefix+'-stderr.txt')).trim(), '');
  const ran = events.filter(e=>e.Test && e.Action==='run');
  const pass = events.filter(e=>e.Test && e.Action==='pass');
  const failed = events.filter(e=>e.Test && e.Action==='fail').map(e=>e.Test).sort();
  assert.equal(events.filter(e=>['skip','build-fail'].includes(e.Action)).length, 0);
  assert.equal(new Set(ran.map(e=>e.Package+'\0'+e.Test)).size, ran.length);
  assert.equal(pass.length+failed.length, ran.length);
  assert.equal(events.filter(e=>e.Action==='output' && /^panic:/.test(e.Output||'')).length, 0);
  if (stage === 'counterfactual') {
    assert.deepEqual(failed, [
      'TestDownloadHTTPFailureIndependentBudget',
      'TestDownloadHTTPFailureIndependentBudget/live_request',
      'TestDownloadHTTPFailureIndependentBudget/canceled_provider_request',
      'TestDownloadHTTPFailureJournalQueueDeadline',
      'TestDownloadResultFailureIndependentBudget',
      'TestDownloadResultFailureIndependentBudget/expired_result_transaction',
    ].sort());
  } else {
    assert.deepEqual(failed, []);
    assert.equal(events.filter(e=>e.Action==='fail').length, 0);
    for (const n of ['TestDownloadHTTPFailureIndependentBudget', 'TestDownloadHTTPFailureJournalQueueDeadline', 'TestDownloadResultFailureIndependentBudget']) {
      assert.equal(pass.filter(e=>e.Test===n).length, 1);
    }
  }
  const packagePass = events.filter(e=>!e.Test && e.Action==='pass');
  if (stage === 'full') {
    assert.deepEqual(packagePass.map(e=>e.Package).sort(), ['systembackupsecurity','systembackupevidence','systembackupread','systembackupproducer','systembackupgcmetadata'].map(p=>'clawreef/internal/'+p).sort());
  }
  records[stage] = {source, native, summary:{stage,source_sha256:source.source_sha256,files:source.files.length,main:ran.filter(e=>!e.Test.includes('/')).length,checks:ran.length,passed:pass.length,failed,exit:native.exit,default_vet:true,source_postcheck:true,packages:packagePass.map(e=>({package:e.Package,elapsed_seconds:e.Elapsed})),source_manifest:prefix+'-source.json',source_manifest_sha256:sha(raw(prefix+'-source.json')),events_sha256:sha(raw(prefix+'.jsonl')),native_sha256:sha(raw(prefix+'-native.json'))}};
}
assert.equal(records.target.source.source_sha256, records.full.source.source_sha256);
const before = records.counterfactual.source.files, after = records.full.source.files;
assert.equal(before.find(p=>p.path===own[1]).sha256, after.find(p=>p.path===own[1]).sha256);
assert.deepEqual(before.filter(p=>p.sha256!==after.find(q=>q.path===p.path)?.sha256).map(p=>p.path), [own[0]]);
for (const p of [...own, 'backend/go.mod','backend/go.sum']) {
  assert.equal(sha(raw(p)), after.find(q=>q.path===p).sha256, 'published byte mismatch: '+p);
}
const contextPath='docs/evidence/d-download-failure-budget-published-context-20261021.json';
const context=read(contextPath);
assert.equal(context.stable_copy_verified,true);
assert.equal(digest(context.files),context.source_sha256);
const changes=after.filter(p=>!context.files.some(q=>p.path===q.path&&p.sha256===q.sha256&&p.size===q.size)).map(p=>p.path);
const additions=context.files.filter(p=>!after.some(q=>q.path===p.path)).map(p=>p.path);
const cleanupPath='docs/evidence/d-download-failure-budget-cleanup-20261021.json';
const cleanup=read(cleanupPath);
assert.equal(cleanup.removed,true);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_postcheck,true);
assert.equal(cleanup.source_sha256,records.full.source.source_sha256);
assert.equal(path.dirname(path.resolve(cleanup.absolute_owner)).toLowerCase(),root.toLowerCase());
assert.equal(path.basename(cleanup.absolute_owner),'.tmp-d-index-cache-712d347ca75740f2b13657daa867ca88');
assert.equal(fs.existsSync(cleanup.absolute_owner),false);
const output='docs/evidence/d-download-failure-budget-preparation-20261021.json';
const report={kind:'d_download_failure_independent_budget_preparation',status:'local_download_failure_budget_only',base_source_sha256:base.source_sha256,base_manifest_sha256:sha(raw(basePath)),changes:own,runs:Object.values(records).map(r=>r.summary),published:{source_context_sha256:context.source_sha256,source_context_manifest_sha256:sha(raw(contextPath)),matches_frozen_full:changes.length===0&&additions.length===0,concurrent_changes:changes,concurrent_additions:additions,own_two_files_and_module_match:true},cleanup:{receipt:cleanupPath,sha256:sha(raw(cleanupPath)),removed:true},dependencies_installed:false,remote:false,boundaries:{independent_seconds_per_failure_callback:5,request_values_preserved:true,provider_authorization_budget_unchanged:true,queued_journal_expiry_fail_closed:true,physical_write_sync_timeout_proven:false,actual_sql_or_deployment_proven:false,production_approval:false,original_six_scopes_complete:false}};
if(process.argv.includes('--check')){assert.deepEqual(read(output),report);console.log(`PASS download failure budgets: counterfactual failures preserved; target ${report.runs[1].main}/${report.runs[1].checks}; full ${report.runs[2].main}/${report.runs[2].checks}; exact published bytes and cleanup`);}
else{assert.equal(fs.existsSync(path.join(root,output)),false);fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n');console.log(output);}
