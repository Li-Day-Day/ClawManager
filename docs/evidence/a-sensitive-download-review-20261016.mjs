// Independent contract/vector and archived gate review; never performs SQL/SSH.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bytes=p=>readFileSync(resolve(root,p));
const json=p=>JSON.parse(bytes(p));
const sha=v=>createHash('sha256').update(v).digest('hex');
function sorted(v){if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])]));return v;}
const canonical=v=>JSON.stringify(sorted(v));
const decisionPath='docs/evidence/system-backup-d-sensitive-download-contract-20261016.json';
const d=json(decisionPath), decisionSHA=sha(bytes(decisionPath));
const vectorsPath='backend/internal/systembackupsecurity/testdata/sensitive_download_request_vectors.json';
const manifestVectorPath='backend/internal/systembackupevidence/testdata/sensitive_download_manifest_vector.json';
const vectors=json(vectorsPath), mv=json(manifestVectorPath);
const checks={};function check(name,value){assert.ok(value,name);checks[name]=true;}
check('D_exact_decision',decisionSHA==='8b14d0804e9bfb4b5169bc585fd1aa50d38877b61b228984184c7427d73d8eac'&&vectors.contract_decision_sha256===decisionSHA&&d.decision_owner==='D'&&d.status==='d_semantics_confirmed_shared_amendments_pending_review');
check('A_original_candidate_pin',sha(bytes(d.a_candidate))===d.a_candidate_sha256);
check('no_production_or_migration_approval',d.production_approval===false&&d.runtime_adapter_enabled===false&&d.migration_catalog_modified===false);
check('five_independent_canonical_vectors',vectors.vectors.length===5&&vectors.vectors.every(v=>canonical(v.input)===v.canonical_utf8&&sha(v.canonical_utf8)===v.sha256&&JSON.stringify(Object.keys(v.input).sort())===JSON.stringify([...d.signed_request.closed_fields].sort())&&v.input.domain===d.signed_request.domain&&v.input.endpoint===d.endpoint.operation_id&&Number.isSafeInteger(v.content_size)&&Number.isSafeInteger(v.input.range_start)&&Number.isSafeInteger(v.input.range_end)));
check('full_manifest_independent_vector',canonical(mv.manifest)===mv.manifest_canonical_utf8&&sha(mv.manifest_canonical_utf8)===mv.manifest_sha256&&sha(canonical(mv.manifest.chunks))===mv.manifest.chunk_list_root);
check('manifest_request_independent_hash',JSON.parse(mv.request_canonical_utf8).manifest_sha256===mv.manifest_sha256&&sha(mv.request_canonical_utf8)===mv.request_sha256&&mv.manifest_sha256!==mv.manifest.identity.content_checksum);
if(process.argv.includes('--vectors-only')){console.log(JSON.stringify({checks:Object.keys(checks).length,decision_sha256:decisionSHA,core_vectors:5,manifest_vectors:1},null,2));process.exit(0);}
const rawPath='docs/evidence/a-sensitive-download-local-20261016-132339-d6243082.txt';
const sourcePath='docs/evidence/a-sensitive-download-source-20261016-132339-d6243082.json';
const raw=bytes(rawPath).toString('utf8').replaceAll('\r\n','\n'),m=json(sourcePath);
const digest=sha(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
check('source_manifest_digest',m.source_sha256===digest&&m.files.length===1302&&m.contract_decision_sha256===decisionSHA&&raw.includes(`LOCAL_SOURCE sensitive-download=yes source_sha256=${digest} files=1302 d_decision_sha256=${decisionSHA}`));
const es=raw.split('\n').filter(s=>s.startsWith('{"Time":')).map(s=>JSON.parse(s));
check('no_failed_go_events',es.length>0&&!es.some(e=>e.Action==='fail'));
const packagePasses=es.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package);
check('two_complete_packages',packagePasses.length===2&&packagePasses.includes('clawreef/internal/systembackupsecurity')&&packagePasses.includes('clawreef/internal/systembackupevidence'));
const passes=es.filter(e=>e.Action==='pass'&&e.Test);const fresh=passes.filter(e=>e.Test.startsWith('TestSensitiveDownload'));
check('94_new_candidate_checks',fresh.length===94&&fresh.filter(e=>!e.Test.includes('/')).length===13);
check('unique_test_results',new Set(passes.map(e=>`${e.Package}:${e.Test}`)).size===passes.length);
check('vet_offline_no_test_retry',raw.includes('LOCAL_STAGE sensitive-download-two-full-packages default-vet=yes retry=no dependency-downloads=no')&&raw.includes('SENSITIVE_DOWNLOAD_GO_EXIT=0'));
check('full_postchecks_and_scope',raw.includes('LOCAL_PASS sensitive-download-candidate=yes frozen-postcheck=yes d-decision-postcheck=yes default-vet=yes nonce-consumed=no provider-read=no production-adapter=no real-mysql=no'));
check('final_exit_zero',/^a_sensitive_download_exit=0$/m.test(raw));
const owned=[...raw.matchAll(/^LOCAL_CLEANUP sensitive-download-owned=(.+) removed=True$/gm)].map(v=>v[1]);
check('two_owned_paths_absent',owned.length===2&&owned.every(p=>dirname(p)===root&&/^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$/.test(p.split(/[/\\]/).at(-1))&&!existsSync(p)));
const compared=m.files.map(p=>({...p,current_status:!existsSync(resolve(root,p.path))?'missing':sha(bytes(p.path))===p.sha256?'matched':'changed'}));
const focused=compared.filter(p=>p.path.startsWith('backend/internal/systembackupsecurity/')||p.path.startsWith('backend/internal/systembackupevidence/')||p.path==='scripts/system-backup-a-sensitive-download-validation.ps1'||/^backend\/go\.(mod|sum)$/.test(p.path));
check('focused_candidate_sources_current',focused.length>100&&focused.every(p=>p.current_status==='matched'));
const receipt={kind:'a_sensitive_download_canonical_and_nonconsuming_proof_candidate_review',recorded_at:new Date().toISOString(),status:'accepted_exact_frozen_local_candidate_only',checks,
 decision:decisionPath,decision_sha256:decisionSHA,raw_log:rawPath,raw_sha256:sha(bytes(rawPath)),source_manifest:sourcePath,source_manifest_sha256:sha(bytes(sourcePath)),source_sha256:digest,source_files:m.files.length,
 packages:packagePasses,unique_main_tests:passes.filter(e=>!e.Test.includes('/')).length,unique_subtests:passes.filter(e=>e.Test.includes('/')).length,unique_checks:passes.length,new_candidate_checks:fresh.length,
 skipped:es.filter(e=>e.Action==='skip'&&e.Test).map(e=>({package:e.Package,test:e.Test})),focused_current_pins:focused,current_manifest_drift:compared.filter(p=>p.current_status!=='matched'),current_additions_not_enumerated_or_accepted:true,
 owned_paths_independently_absent:owned,default_vet:true,process_exit:0,test_retries:0,host_startup_recovery_before_any_Go:raw.includes('TOOL_STARTUP_RECOVERY previous-host-exit=0xc0000043'),
 initial_failure:'docs/evidence/a-sensitive-download-initial-failure-review-20261016.json',
 contract_gap:{empty_content:'D decision describes existing 0/0; actual parseRange absent/zero returns 0/-1 and current Manifest rejects zero. Pure canonical vector only; adapter stays closed.',idempotency_key:'Existing frozen proof grammar [A-Za-z0-9._:-]{16,128} retained; arbitrary ASCII is not accepted.',unsafe_range_literals:'Candidate rejects >2^53-1 even when legacy parser could clamp them; shared issuance/verification builder uses the same rule.'},
 remaining:['D sealed prelocked transaction prefix and exact live authorization/manifest binding','Actual proof-issuance HTTP preparation and MFA/current session checks using that authority','Audit INSERT ID, operation/receipt/public snapshot, metadata reservation and atomic nonce consumption','Shared policy/OpenAPI/DTO/schema amendments and required cross reviews','Real MySQL replay/rollback/unknown-commit and production materials'],
 scope:{complete_manifest_hash:true,range_normalization:true,real_ed25519:true,complete_HMAC_candidates:true,original_proof_temporal_recheck:true,SQL_begin_commit:false,nonce_consumption:false,replay_prevention_proved:false,provider_IO:false,current_session_owner_RBAC_proved:false,real_MySQL:false,human_MFA:false,production_adapter:false,formal_approval:false,overall_goal_complete:false}};
if(process.argv.includes('--record'))writeFileSync(resolve(root,'docs/evidence/a-sensitive-download-candidate-review-20261016.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks:Object.keys(checks).length,main:receipt.unique_main_tests,sub:receipt.unique_subtests,new_candidate:fresh.length,skipped:receipt.skipped,focused:focused.length,drift:receipt.current_manifest_drift.map(p=>p.path),recorded:process.argv.includes('--record')},null,2));
