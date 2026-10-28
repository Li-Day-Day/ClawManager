// Close the already accepted Windows round after its exact owner is removed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const acceptedName='docs/evidence/a-cleanup-gate-windows-reviewed-20261027.json',accepted=json(acceptedName);
const cleanupName='docs/evidence/d1-joint-windows-cleaned-20261027.json',cleanup=json(cleanupName);
const manifest=json(accepted.source.path),native=json(accepted.native.path);
assert.deepEqual(pin(accepted.source.path),accepted.source);assert.deepEqual(pin(accepted.native.path),accepted.native);
for(const s of accepted.steps)assert.deepEqual(pin(s.log.path),s.log);
assert.equal(native.source_postcheck,true);assert.equal(cleanup.kind,'d1_joint_Windows_owned_cleanup.v1');
assert.equal(cleanup.source_sha256,manifest.source_sha256);assert.equal(cleanup.owner,manifest.owner);
assert.equal(path.dirname(cleanup.owner).toLowerCase(),root.toLowerCase());
assert.match(path.basename(cleanup.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(cleanup.owner_absent,true);assert.equal(cleanup.Windows_exec_exit,0);assert.equal(cleanup.source_final_postcheck,true);
assert.equal(cleanup.Root_cache_touched,false);assert.equal(fs.existsSync(cleanup.owner),false);
assert.deepEqual(accepted.packages.map(p=>[p.roots,p.pass_events]),[[14,60],[155,284]]);
const result={kind:'a_cleanup_gate_Windows_terminal_cleanup_review.v1',status:'accepted_exact_Windows_packages_and_owned_cleanup_only',
 Windows_acceptance:pin(acceptedName),cleanup:pin(cleanupName),source_sha256:manifest.source_sha256,
 package_counts:accepted.packages.map(p=>({package:p.package,roots:p.roots,pass_events:p.pass_events})),
 source_final_postcheck:true,owned_directory_absent:true,source_owner:cleanup.owner,
 Root_continuation_owner:cleanup.Root_continuation_owner,Root_continuation_accepted_by_this_review:false,
 whole_Linux_and_real_command_acceptance:false,SQL_ledger_and_grants_installed:false,
 actual_SQL:false,dependencies_installed:false,production_approved:false,whole_goal_complete:false};
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const out='docs/evidence/a-cleanup-gate-windows-terminal-reviewed-20261027.json',text=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,out),text,{flag:'wx'});else assert.equal(read(out).toString('utf8'),text);
console.log(JSON.stringify({status:result.status,roots:[14,155],owner_absent:true,Linux_accepted:false}));
