// A reviews D1's finished current resource preparation. Unrelated GC/nonce
// work is excluded only after observing both actual platform dependency graphs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateGoEvents,validateManifest} from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const rel=p=>path.relative(root,path.resolve(root,p)).replaceAll('\\','/');
const pin=p=>({path:rel(p),size:read(p).length,sha256:sha(read(p))});
const receipt='docs/evidence/d-resources-mysql-20261023-151943-85007e0b.json';
const r=json(receipt),source=json(r.source);validateManifest(source);
assert.equal(r.kind,'d_resources_mysql_preparation.v1');assert.equal(r.suite,'writer-fk');assert.equal(r.error,null);
assert.equal(r.remote_requested,false);assert.equal(r.owner_removed,true);assert.equal(r.dependencies_installed,false);assert.equal(r.production_approved,false);
assert.equal(path.dirname(r.owner),root);assert.match(path.basename(r.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(r.owner),false);
assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);
assert.equal(r.steps.length,4);for(const [i,s] of r.steps.entries()){assert.equal(s.exit_code,0);assert.equal(s.platform,i<2?'windows':'linux');assert.equal(sha(read(s.log)),s.log_sha256);}
assert.deepEqual(r.steps[0].command,['go','test','-count=1','-timeout=180s','-json','./internal/systembackupresources']);
assert.deepEqual(r.steps[1].command,['go','test','-tags','systembackup_mysql','-run','^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$','-count=1','-json','./internal/systembackupresources']);
assert.deepEqual(r.steps[2].command,['go','test','-c','-tags','systembackup_mysql','-o',path.join(r.owner,'bundle/d-resources-readback.test'),'./internal/systembackupresources']);
assert.deepEqual(r.steps[3].command,['go','build','-o',path.join(r.owner,'bundle/system-backup-migrate'),'./cmd/system-backup-migrate']);
const names=validateGoEvents(read(r.steps[0].log).toString('utf8')),seeds=validateGoEvents(read(r.steps[1].log).toString('utf8'));
const prior='docs/evidence/a-writer-fk-20261023-134215-75d1f525-fixed.jsonl',priorText=read(prior).toString('utf8');
assert.equal(sha(read(prior)),'53900185217d620cc37a4839fcc524e685274d912f7172134298427c38585a83');
assert.deepEqual(names,validateGoEvents(priorText,JSON.parse(priorText.split(/\r?\n/)[0]).Package));assert.equal(names.length,843);
assert.deepEqual(seeds,['TestAResourcesWriteFKMySQLSeed','TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed']);
for(const k of ['binary_sha256','migration_binary_sha256','inputs_sha256'])assert.match(r[k],/^[a-f0-9]{64}$/);
const graphPath='docs/evidence/a-fk-dependency-scope-20261023.json',g=json(graphPath);
assert.equal(g.kind,'a_fk_offline_dependency_observation.v1');assert.equal(g.error,null);assert.equal(g.owner_removed,true);assert.equal(fs.existsSync(g.owner),false);
assert.equal(path.dirname(g.owner),root);assert.match(path.basename(g.owner),/^\.tmp-a-resource-deps-[a-f0-9]{32}$/);
assert.deepEqual(g.roots,['clawreef/internal/systembackupresources','clawreef/cmd/system-backup-migrate']);
assert.deepEqual(g.steps.map(s=>s.platform),['windows','linux']);
const dirs=new Set();
for(const s of g.steps){
 assert.equal(s.exit,0);assert.equal(sha(read(s.log)),s.log_sha256);assert.equal(sha(read(s.stderr)),s.stderr_sha256);assert.equal(read(s.stderr).length,0);
 const lines=read(s.log).toString('utf8').trim().split(/\r?\n/),imports=lines.map(l=>l.slice(0,l.indexOf('|')));
 for(const p of g.roots)assert.ok(imports.includes(p));
 assert.ok(!imports.some(p=>/^clawreef\/internal\/systembackupevidence(?:\s|\.|$)/.test(p)));
 assert.ok(!imports.some(p=>/^clawreef\/internal\/systembackupnoncebootstrap(?:\s|\.|$)/.test(p)));
 for(const line of lines){const sep=line.indexOf('|');assert.ok(sep>0);if(!line.startsWith('clawreef/'))continue;const d=rel(line.slice(sep+1));assert.ok(d.startsWith('backend/'));dirs.add(d);}
}
assert.deepEqual([...dirs].sort(),['backend/cmd/system-backup-migrate','backend/internal/config','backend/internal/db','backend/internal/migrationcatalog','backend/internal/migrationcoord','backend/internal/systembackupresources']);
const scripts=new Set(['scripts/system-backup-d-resources-mysql-validation.ps1','scripts/system-backup-d-resources-readback-phase.sh','scripts/system-backup-d-resources-mysql-inputs.mjs','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-config-proof-source.ps1','scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-migration-phase.sh','scripts/system-backup-a-business-history-phase.sh']);
const selected=p=>p.startsWith('contracts/')||p.startsWith('docs/')||['backend/go.mod','backend/go.sum'].includes(p)||scripts.has(p)||[...dirs].some(d=>p.startsWith(d+'/'));
const inputs=source.files.filter(p=>selected(p.path));for(const p of inputs)assert.deepEqual(pin(p.path),p,'resource/migration dependency input drift '+p.path);
const extensions=/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/;
const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{const p=dir+'/'+e.name;if(e.isDirectory())return ['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(e.name)?[]:walk(p);return e.isFile()&&extensions.test(p)&&selected(p)?[p]:[];});
const disk=[...new Set([...dirs].flatMap(walk).concat(walk('contracts')))].sort();
assert.deepEqual(disk,source.files.filter(p=>[...dirs].some(d=>p.path.startsWith(d+'/'))||p.path.startsWith('contracts/')).map(p=>p.path).sort(),'resource dependency file set changed');
const capsule='backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json';assert.equal(sha(read(capsule)),r.inputs_sha256);
const fixture='backend/internal/systembackupresources/restore_write_fk_mysql_test.go',code=read(fixture).toString('utf8');
for(const token of ['SELECT @@session.foreign_key_checks','me.Number != 1452','me.Number != 1062','FK_SCHEMA canonical_and_owned=matched','PASS a-resources-write-fk-mysql cases=10'])assert.ok(code.includes(token));
const oldFailure='docs/evidence/a-writer-fk-final-20261023-145605-7d41cb5f.json',failed=json(oldFailure);
assert.equal(failed.error,'Frozen grouped source file set drift');assert.equal(failed.owner_removed,true);assert.equal(fs.existsSync(failed.owner),false);
const report={kind:'a_current_resource_preparation_review.v1',decision:'current_resource_and_migration_dependency_scope_prepared_actual_writer_FK_pending',roots:71,ordinary_pass_events:843,prior_843_names_preserved:true,seed_names:seeds,Linux_probe_built:true,Linux_migration_runner_built:true,probe_sha256:r.binary_sha256,migration_runner_sha256:r.migration_binary_sha256,source_sha256:source.source_sha256,dependency_platforms:['windows','linux'],local_dependency_directories:[...dirs].sort(),evidence_and_nonce_packages_outside_dependency_scope:true,current_selected_inputs_and_file_sets_match:true,cleanup_owners_independently_absent:[r.owner,g.owner,failed.owner],prior_A_global_postcheck_failure_preserved:true,current_whole_worktree_approved:false,current_owner_profile_approved:false,actual_MySQL:false,B_C_rules_approved:false,generic_FK_UNIQUE_approved:false,production_approved:false,dependencies_installed:false,inputs,evidence:[receipt,r.source,...r.steps.map(s=>s.log),graphPath,...g.steps.flatMap(s=>[s.log,s.stderr]),prior,oldFailure,'docs/evidence/a-resources-current-preparation-review-20261023.mjs'].map(pin)};
const output='docs/evidence/a-resources-current-preparation-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),report);}
console.log('A_CURRENT_RESOURCE_PREPARATION roots=71 tests=843 seeds=3 platforms=2 cleanup=yes actual_MySQL=no');
