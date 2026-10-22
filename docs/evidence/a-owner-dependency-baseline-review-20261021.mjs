// Only accept an unchanged owner test dependency closure. The unrelated
// resources package's four known failures remain failed and are not approved.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,json,decode,sha256,manifest,changed,exact,events} from './a-frozen-validation-utils-20261021.mjs';
const prefix='docs/evidence/a-owner-dependency-freeze-20261021',source=manifest(prefix+'-source.json'),n=json(prefix+'-native.json');
assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.source_sha256,source.source_sha256);assert.equal(n.removed,true);assert.equal(n.tests_executed,false);assert.equal(n.actual_sql,false);assert.equal(n.dependencies_installed,false);assert.equal(fs.existsSync(n.owner),false);assert.equal(path.dirname(path.resolve(n.owner)).toLowerCase(),workspace.toLowerCase());
const imports=decode(raw(prefix+'-imports.txt')).trim().split('\n');for(const p of ['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'])assert.ok(imports.includes(p));assert.ok(!imports.some(p=>/^clawreef\/internal\/systembackupresources(?:\s|$)/.test(p)));assert.equal(raw(prefix+'-stderr.txt').length,0);
const previousPath='docs/evidence/a-prune-identity-baseline-accepted-20261021.json',previous=json(previousPath),previousSource=manifest(previous.source);
const resourceOwn=['completion_context_test.go','sql_counts.go','verifier.go'].map(p=>'backend/internal/systembackupresources/'+p);
exact(changed(source,previousSource).filter(p=>/^(backend|contracts)\//.test(p)),resourceOwn);assert.ok(previousSource.files.every(p=>source.files.some(q=>q.path===p.path)));
const dPath='docs/evidence/d-resources-completion-context-accepted-20261021.json',d=json(dPath);assert.equal(d.status,'completion_guards_accepted_package_has_preexisting_failures');
for(const p of resourceOwn){const pin=source.files.find(f=>f.path===p),reviewed=d.changes.find(f=>f.path===p);assert.equal(pin.sha256,reviewed.sha256);assert.equal(sha256(raw(p)),pin.sha256);}
const failed=['TestCaptureTableAllowlistFailsClosed','TestCaptureTableAllowlistFailsClosed/unreviewed_other_domain','TestControlExclusionDetectsSourceRows','TestControlExclusionEmptyTarget'];
for(const stage of ['module-target','module-full']){
  const r=d.runs[stage],es=events(r.file),native=json(r.native_file);assert.equal(sha256(raw(r.file)),r.sha256);assert.equal(sha256(raw(r.native_file)),r.native_sha256);assert.equal(sha256(raw(r.stderr)),r.stderr_sha256);assert.equal(raw(r.stderr).length,0);assert.equal(native.exit,stage==='module-target'?0:1);
  exact(es.filter(e=>e.Test&&e.Action==='fail').map(e=>e.Test),stage==='module-target'?[]:failed);assert.equal(es.filter(e=>e.Test&&e.Action==='pass').length,stage==='module-target'?13:66);assert.equal(es.some(e=>['skip','build-fail'].includes(e.Action)),false);
}
const dCleanup=json(d.cleanup_receipt);assert.equal(dCleanup.removed,true);assert.equal(fs.existsSync(dCleanup.root),false);
const baseline=json('docs/evidence/d-resources-completion-context-base-20261021.json');
for(const p of resourceOwn.filter(p=>!p.endsWith('_test.go'))){
  const text=decode(raw(p)),value=p.endsWith('/sql_counts.go')?'SourceSnapshot{}':'nil';
  const guard=`\tif err := ctx.Err(); err != nil {\n\t\treturn ${value}, err\n\t}\n`;
  const first=text.indexOf(guard),last=text.lastIndexOf(guard);assert.ok(first>=0&&last>first);const before=text.slice(0,last)+text.slice(last+guard.length);
  assert.ok([sha256(before),sha256(before.replace(/\n/g,'\r\n'))].includes(baseline.files.find(f=>f.path===p).sha256));
}
assert.equal(sha256(raw(previous.events)),previous.events_sha256);assert.equal(previous.owner_baseline.all,5019);
const record={kind:'a_owner_inventory_unchanged_dependency_closure_acceptance',status:'accepted_unchanged_owner_dependency_inputs_only',source:prefix+'-source.json',source_manifest_sha256:sha256(raw(prefix+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,events:previous.events,events_sha256:previous.events_sha256,owner_baseline:{main:620,all:5019},previous:previousPath,previous_sha256:sha256(raw(previousPath)),catalog:previous.catalog,dependency_native:prefix+'-native.json',dependency_native_sha256:sha256(raw(prefix+'-native.json')),dependency_imports_sha256:sha256(raw(prefix+'-imports.txt')),tagged_test_dependencies_resolved:true,resources_in_owner_dependency_closure:false,ordinary_owner_inputs_unchanged:true,resource_receipt:dPath,resource_receipt_sha256:sha256(raw(dPath)),resource_target_checks:13,resource_full_package_exit:1,resource_full_package_failures_retained:failed,resources_package_accepted:false,resource_cleanup:d.cleanup_receipt,resource_cleanup_sha256:sha256(raw(d.cleanup_receipt)),owned_directories_absent:[n.owner,dCleanup.root],tests_repeated:false,actual_sql:false,dependencies_installed:false,current_whole_worktree_verified:false,production_approved:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output='docs/evidence/a-owner-dependency-baseline-accepted-20261021.json';
if(process.argv[2]==='--check')assert.deepEqual(json(output),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,owner_checks:5019,resources_full_failures_retained:4,tests_repeated:false,actual_sql:false,cleanup_absent:true}));
