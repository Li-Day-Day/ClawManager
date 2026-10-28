import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output='docs/evidence/a2-cleanup-alert-authority-source-reviewed-20261027.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pin=p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,size:b.length,sha256:sha(b)};};
const sources={
  operations:'backend/internal/db/migrations/066_add_system_backup_config_and_operations.sql',
  tasks:'backend/internal/db/migrations/067_add_system_backup_task_execution_core.sql',
  staging:'backend/internal/db/migrations/073_add_system_backup_staging_resources.sql',
  restore:'backend/internal/db/migrations/077_add_system_restore_drill_resources.sql',
  controller:'backend/internal/systembackupcontroller/controller_state_alerts.go',
  configRules:'backend/internal/systembackupsecurity/config_bootstrap_rules.go',
  schema:'contracts/system-backup/v12/metrics-alert-registry.schema.json',
  plan:'docs/system-backup-restore-division-plan.md',
};
function table(file,name){
  const source=read(file),marker='CREATE TABLE IF NOT EXISTS '+name+' (';
  const start=source.indexOf(marker);assert.ok(start>=0);
  const end=source.indexOf(') ENGINE=',start);assert.ok(end>start);
  const text=source.slice(start,end);
  const columns=text.split(/\r?\n/).flatMap(l=>{
    const m=l.match(/^  ([a-z][a-z0-9_]*) (?:BIGINT|INT|SMALLINT|VARCHAR|CHAR|ENUM|DATETIME|BOOLEAN|BLOB|MEDIUMBLOB|TEXT)\b/);
    return m?[m[1]]:[];
  });
  return {file,table:name,columns,text};
}
const operations=table(sources.operations,'system_backup_operations');
const drill=table(sources.tasks,'system_restore_drills');
const staging=table(sources.staging,'system_backup_staging_resources');
const restore=table(sources.restore,'system_restore_drill_resources');
for(const n of ['operation_type','target_type','target_public_id','origin_installation_id','created_at','deadline_at','status'])assert.ok(operations.columns.includes(n));
for(const n of ['config_version','config_snapshot_json','config_snapshot_size_bytes','config_snapshot_sha256','finished_at','cleanup_policy','cleanup_status'])assert.ok(drill.columns.includes(n));
assert.equal(drill.columns.includes('cleanup_started_at'),false);
assert.equal(drill.columns.includes('cleanup_deadline_at'),false);
for(const t of [staging,restore]){
  assert.ok(t.columns.includes('cleanup_operation_id'));
  assert.match(t.text,/cleanup_operation_id BIGINT UNSIGNED NULL/);
  assert.match(t.text,/FOREIGN KEY \(cleanup_operation_id\) REFERENCES system_backup_operations\(id\)/);
}
const plan=read(sources.plan).split(/\r?\n/);
const planFacts=[
  ['operation_absolute_deadline','异步operation的deadline从operation `created_at`起算'],
  ['automatic_cleanup_linearization','drill 终态 CAS 写入 `succeeded` 时必须同时把 cleanup'],
  ['manual_cleanup_operation','并以新operation驱动到pending'],
  ['owner_frozen_threshold','任务级阈值来自 immutable config snapshot'],
  ['cleanup_critical','cleanup age超过cleanup deadline'],
].map(([fact,needle])=>{const index=plan.findIndex(l=>l.includes(needle));assert.ok(index>=0,needle);return {fact,path:sources.plan,line:index+1,excerpt:plan[index]};});
const schema=JSON.parse(read(sources.schema));
assert.ok(schema.$defs.Alert.properties.expression_language.enum.includes('controller_state'));
assert.match(read(sources.configRules),/"cleanup_deadline_seconds":\s*\{Min: 60, Max: 21600, Default: 3600, Scale: 1\}/);
const migrationRoot='backend/internal/db/migrations';
const linkSources=fs.readdirSync(path.join(root,migrationRoot)).filter(n=>n.endsWith('.sql'))
  .filter(n=>read(migrationRoot+'/'+n).includes('cleanup_operation_id')).map(n=>migrationRoot+'/'+n).sort();
assert.deepEqual(linkSources,[sources.staging,sources.restore].sort());
const report={
  kind:'a2_cleanup_alert_existing_authority_source_audit.v1',
  status:'controller_state_predicate_direction_source_compatible_collector_authority_and_automatic_origin_unproven',
  sources:Object.values(sources).map(pin),plan_facts:planFacts,
  existing_tables:[operations,drill,staging,restore].map(({text,...t})=>t),
  all_migration_sources_mentioning_cleanup_operation_id:linkSources,
  findings:{
    controller_state_is_existing_expression_language:true,
    explicit_cleanup_operation_absolute_times_exist:true,
    cleanup_operation_result_config_version_is_not_a_frozen_config_reference:'Plan and operation CHECK reserve result_config_version for successful config_update.',
    task_snapshot_frozen_config_identity_exists:true,
    drill_has_dedicated_cleanup_start_or_deadline_columns:false,
    resource_cleanup_operation_links_nullable:true,
    link_FK_alone_proves_installation_operation_type_and_target:false,
    all_automatic_cleanup_owners_have_operation_rows_proven:false,
    task_finished_at_is_approved_universal_cleanup_start:false,
  },
  required_collector_invariants:[
    'Use one authoritative database observation time and a consistent complete owner/resource set.',
    'Validate installation, cleanup operation type, target kind and target identity for every linked operation; an id-only FK is insufficient.',
    'For explicit cleanup, preserve the recorded created_at/deadline_at envelope across queueing and takeover; validate that envelope is the correct cleanup budget authority.',
    'Cover automatic cleanup without assuming every owner has a cleanup operation row; settle its durable start and frozen budget mapping.',
    'Do not substitute resource created_at, mutable updated_at, worker claim time, result_config_version or current config for an unproven cleanup start/budget.',
    'Distinguish a fully read empty set from absent, failed, truncated, stale or incomplete collection; unknown collection must not become healthy.',
    'Evaluate strict Age > ImmutableDeadline per owner with valid nonnegative age and positive deadline, then any; preserve immediate critical in both profiles.',
  ],
  approved_new_metric_names:[],approved_new_SQL_columns:[],approved_automatic_cleanup_time_projection:null,
  proposed_controller_state_count_is_not_implemented:true,
  collector_or_SQL_executed:false,Go_executed:false,PromQL_executed:false,
  live_sources_modified:false,dependencies_installed:false,whole_baseline_accepted:false,production_approved:false,
};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,output),rendered);
else{assert.equal(process.argv[2],'--check');assert.equal(read(output),rendered);}
console.log(JSON.stringify({output,existing_tables:4,plan_facts:planFacts.length,controller_state_language_allowed:true,collector_authority_ready:false}));
