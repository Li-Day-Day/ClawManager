import test, {after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// Execute the real TS service with only the application HTTP boundary replaced.
// No endpoint, login, database, provider, or executor is contacted by these tests.
const serviceURL=new URL('../src/services/systemBackupTaskService.ts',import.meta.url).href;
const slot=Symbol.for('clawmanager.system-backup-task-submit.test');
const calls=[];let reply,transportError;
const key='task-submit-test-key-123';
function task(kind='backup'){
  return {schema_version:'system-backup-task.v1',public_id:`${kind==='backup'?'sbk':'spf'}_00000000-0000-4000-8000-000000000001`,origin_installation_id:'installation_test',task_type:kind,
    actor_type:'admin',actor_id:'7',endpoint:kind==='backup'?'createSystemBackup':'createSystemBackupPreflight',idempotency_key:key,request_hash:'a'.repeat(64),request_id:'req-task-submit',retry_of_public_id:null,
    status:'pending',pending_reason:'none',attention_reason:'none',can_cancel:false,config_version:1,retryable:false,failure_category:'none',failure_message:null,heartbeat_at:null,row_version:1,next_reconcile_at:null,
    deadline_at:'2026-10-27T02:01:00Z',started_at:null,finished_at:null,created_at:'2026-10-27T02:00:00Z',updated_at:'2026-10-27T02:00:00Z'};
}
globalThis[slot]={post:async(path,body,options)=>{
  calls.push({path,body,options});if(transportError)throw transportError;
  return reply??{status:202,data:task(path==='/admin/system-backups'?'backup':'preflight'),headers:{'x-system-backup-data-source':'live'}};
}};
const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier==='./api'&&context.parentURL===serviceURL)return{url:'data:text/javascript,export default globalThis[Symbol.for("clawmanager.system-backup-task-submit.test")]',shortCircuit:true};
  return next(specifier,context);
}});
const {createSystemBackupTask}=await import(serviceURL);
beforeEach(()=>{calls.length=0;reply=undefined;transportError=undefined;});
after(()=>{hooks.deregister();delete globalThis[slot];});

for(const kind of ['backup','preflight'])test(`${kind} uses the fixed endpoint and preserves body/key/signal arguments`,async()=>{
  const body=' { "b": 2, "a": 1 } ',signal=new AbortController().signal;
  const result=await createSystemBackupTask(kind,body,key,signal);
  assert.equal(result.task_type,kind);assert.equal(calls.length,1);
  assert.equal(calls[0].path,kind==='backup'?'/admin/system-backups':'/admin/system-backup-preflights');
  assert.equal(calls[0].body,body);assert.equal(calls[0].options.signal,signal);
  assert.deepEqual(calls[0].options.headers,{'Content-Type':'application/json','Idempotency-Key':key});
});
test('unknown runtime kind fails before a mutation',async()=>{
  await assert.rejects(createSystemBackupTask('unknown','{}',key),e=>e.message==='validation_failed');assert.equal(calls.length,0);
});
test('malformed JSON yields a closed error without its input',async()=>{
  await assert.rejects(createSystemBackupTask('backup','{"private_input":"do-not-render" trailing',key),e=>e.message==='validation_failed');assert.equal(calls.length,0);
});
test('invalid key fails before a mutation',async()=>{
  await assert.rejects(createSystemBackupTask('backup','{}','short'),e=>e.message==='validation_failed');assert.equal(calls.length,0);
});
for(const [name,change]of[
  ['missing public identity',t=>{delete t.public_id;}],['wrong identity kind',t=>{t.public_id=t.public_id.replace('sbk_','spf_');}],
  ['invalid status',t=>{t.status='invented';}],['missing row version',t=>{delete t.row_version;}],['invalid origin',t=>{t.origin_installation_id='foreign';}],
  ['invalid request hash',t=>{t.request_hash='not-a-hash';}],['missing deadline',t=>{delete t.deadline_at;}],['private extra field',t=>{t.private_authority='not-public';}],
  ['another create endpoint',t=>{t.endpoint='createSystemBackupPreflight';}],['wrong key',t=>{t.idempotency_key='other-task-key-123';}],
  ['wrong task type',t=>{t.task_type='preflight';}],
])test(`malformed live 202 refuses ${name}`,async()=>{
  const value=task();change(value);reply={status:202,data:value,headers:{'x-system-backup-data-source':'live'}};
  await assert.rejects(createSystemBackupTask('backup','{}',key),e=>e.message==='not_ready');assert.equal(calls.length,1);
});
for(const [name,status,source]of[['nonaccepted status',200,'live'],['fixture source',202,'fixture'],['missing source',202,undefined]])test(name+' cannot become an accepted task',async()=>{
  reply={status,data:task(),headers:{'x-system-backup-data-source':source}};
  await assert.rejects(createSystemBackupTask('backup','{}',key),e=>e.message==='not_ready');
});
test('an unknown transport result is propagated once without retry or key replacement',async()=>{
  transportError=new Error('synthetic unknown result');
  await assert.rejects(createSystemBackupTask('backup','{}',key),e=>e===transportError);assert.equal(calls.length,1);assert.equal(calls[0].options.headers['Idempotency-Key'],key);
});
