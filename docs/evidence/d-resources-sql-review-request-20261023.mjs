import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const previous='docs/evidence/d-resources-field-review-request-20261023.json';
const p=json(previous);
// Every old input is still pinned. New package files are an explicit delta,
// never silently inherited under the old security review.
for(const f of p.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
const a=json('docs/evidence/d-a-resources-v2-intake-20261023.json');
assert.equal(a.runtime_approved,false);assert.equal(a.new_SQL_reader_reviewed,false);
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
const additions=[...walk('backend/internal/systembackupresources'),previous,
  'docs/evidence/d-a-resources-v2-intake-20261023.json','docs/evidence/d-a-resources-v2-intake-20261023.mjs','docs/evidence/d-a-resources-v2-capsule-20261023.json',
  'docs/evidence/a-resources-v2-reviewed-20261023.json','docs/evidence/a-resources-v2-review-20261023.mjs','docs/system-backup-a-resources-v2-review-20261023.md',
  'docs/system-backup-d-resources-sql-reader-20261023.md','docs/evidence/d-resources-sql-review-request-20261023.mjs'];
const paths=[...new Set([...p.source_files.map(f=>f.path),...additions])].sort();
const sources=paths.map(file=>{const b=read(file);return {path:file,size:b.length,sha256:sha(b)};});
const result={kind:'d_resources_sql_reader_review_request.v1',date:'2026-10-23',policy_version:p.policy_version,previous_request:previous,
  status:'transaction_scoped_reader_candidate_pending_incremental_review_and_B_C_production_inputs',
  source_files:sources,source_digest:sha(Buffer.from(JSON.stringify(sources))),
  tables:p.tables.map(t=>({...t,review_status:'A_original_constraints_received_reader_increment_pending_B_C_facts_missing',review_receipts:t.required_reviewers.includes('A')?[{reviewer:'A',receipt:'docs/evidence/d-a-resources-v2-intake-20261023.json',scope:'historical_security_constraints_only',reader_approved:false}]:[],SQL_reader:'private_transaction_scoped_candidate_pending_review'})),
  review_receipts:[],reader_runtime_approved:false,source_target_proof_accepted:false,full_normalization_implemented:false,actual_mysql_executed:false,production_wired:false,registry_approval_written:false,messages_sent:false};
const output='docs/evidence/d-resources-sql-review-request-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result,'source bytes or package set changed; issue a new request');}
console.log(`D_RESOURCES_SQL_REQUEST tables=9 inputs=${sources.length} A_constraints=received reader_review=pending production=no`);
if(process.argv.includes('--strict')){console.error('NOT_READY: reader review, B/C proofs, complete candidates and production acceptance missing');process.exitCode=1;}
