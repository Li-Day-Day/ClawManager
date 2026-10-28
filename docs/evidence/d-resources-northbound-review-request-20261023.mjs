import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const previous='docs/evidence/d-resources-images-review-request-20261023.json',prior=json(previous);
for(const f of prior.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
const servicePath='backend/internal/services/northbound_admin_service.go',sourcePath='backend/internal/systembackupresources/restore_northbound.go';
const service=read(servicePath).toString('utf8'),source=read(sourcePath).toString('utf8');
const snake=name=>name.replace(/^WorkBuddy/,'Workbuddy').replace(/([A-Z]+)([A-Z][a-z])/g,'$1_$2').replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();
const serviceIntegers=[...service.matchAll(/\{"[^"]+", item\.(\w+), (\d+), (\d+)\}/g)];assert.equal(serviceIntegers.length,20);
const dBoundsText=source.slice(source.indexOf('func restoreNorthboundBounds'),source.indexOf('func normalizeRestoreNorthbound'));
const dBounds=Object.fromEntries([...dBoundsText.matchAll(/"([a-z_]+)":\s*\{(\d+),\s*(\d+)\}/g)].map(m=>[m[1],[Number(m[2]),Number(m[3])]]));assert.equal(Object.keys(dBounds).length,23);
for(const m of serviceIntegers)assert.deepEqual(dBounds[snake(m[1])],[Number(m[2]),Number(m[3])],m[1]);
const cpus=[...service.matchAll(/item\.(\w+CPUCores) < ([0-9.]+) \|\| item\.\1 > ([0-9.]+)/g)];assert.equal(cpus.length,3);
const migration=read('backend/internal/db/migrations/057_add_northbound_admin_settings.sql').toString('utf8');
for(const m of cpus){const field=snake(m[1]);assert.ok(migration.includes(field+' DECIMAL(4,2) NOT NULL'));assert.deepEqual(dBounds[field],[Number(m[2])*100,Math.min(Number(m[3])*100,9999)],field);}
const known=source.match(/switch value \{\s*case ([^\n]+):/);assert.ok(known);
const dTypes=[...known[1].matchAll(/"([a-z-]+)"/g)].map(m=>m[1]).sort();assert.equal(dTypes.length,5);
for(const label of ['allowedLiteRuntimeTypes','allowedProRuntimeTypes']){const block=service.match(new RegExp(`var ${label} = map\\[string\\]struct\\{\\}\\{([\\s\\S]*?)\\n\\}`));assert.ok(block);assert.deepEqual([...block[1].matchAll(/"([a-z-]+)"/g)].map(m=>m[1]).sort(),dTypes);}
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
const paths=[...new Set([...prior.source_files.map(f=>f.path),...walk('backend/internal/systembackupresources'),previous,servicePath,
  'docs/system-backup-d-resources-northbound-candidate-20261023.md','docs/evidence/d-resources-northbound-review-request-20261023.mjs'])].sort();
const source_files=paths.map(f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};});
const result={kind:'d_resources_northbound_candidate_review_request.v1',date:'2026-10-23',policy_version:prior.policy_version,previous_request:previous,
  status:'five_offline_table_candidates_northbound_pending_A_B_incremental_review_and_production_inputs',source_files,source_digest:sha(Buffer.from(JSON.stringify(source_files))),
  independent_service_alignment:{integer_ranges:20,CPU_ranges:3,CPU_SQL_intersection:'DECIMAL_4_2_max_99_99',runtime_types:5},
  tables:prior.tables.map(t=>({...t,review_status:'A_historical_component_reviews_received_new_NB_review_and_B_C_facts_pending',SQL_reader:'A_historical_candidate_and_frozen_synthetic_tests_accepted_not_production',normalized_candidate:t.table==='northbound_admin_settings'?'complete_columns_offline_candidate_pending_A_B_review_and_target_transaction_proof':(['audit_logs','northbound_settings_audit'].includes(t.table)?'A_historical_static_and_frozen_tests_accepted_B_proof_pending':t.normalized_candidate)})),
  historical_reviews_received:prior.historical_reviews_received,
  new_review_questions:['A_B_all_33_columns_target_closed_policy_and_SQL_JSON_projection','B_exact_target_absence_or_locked_version_CAS_one_row_and_port_facts','B_full_stricter_limits_types_startup_cache_environment_failure_gates'],
  review_receipts:[],new_candidate_runtime_approved:false,source_target_proof_accepted:false,full_normalization_implemented:false,
  actual_mysql_executed:false,production_wired:false,registry_approval_written:false,messages_sent:false};
const output='docs/evidence/d-resources-northbound-review-request-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result,'input bytes or file set changed; issue a new request');}
console.log(`D_RESOURCES_NORTHBOUND_REQUEST tables=9 offline_candidates=5 service_ranges=23 inputs=${source_files.length} A_B_review=pending production=no`);
if(process.argv.includes('--strict')){console.error('NOT_READY: incremental reviews, B/C proofs, four scan table candidates and production acceptance missing');process.exitCode=1;}
