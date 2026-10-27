import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const at=p=>path.isAbsolute(p)?p:path.join(root,p);
const bytes=p=>fs.readFileSync(at(p));
const read=p=>bytes(p).toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(read(p));
const hash=p=>crypto.createHash('sha256').update(bytes(p)).digest('hex');
const e='docs/evidence/',prefix=e+'d-gc-freeze-session-20261021-r1';
const model=e+'d-gc-freeze-session-model-20261021.go';
const source=json(prefix+'-source.json'),native=json(prefix+'-native.json');
assert.equal(source.model_sha256,hash(model));
assert.equal(native.exit,0);assert.equal(native.source_postcheck,true);assert.equal(native.default_vet,true);
assert.equal(native.dependencies_installed,false);assert.equal(native.mysql_executed,false);assert.equal(native.runtime_changed,false);
assert.equal(source.mysql_executed,false);assert.equal(source.runtime_changed,false);
assert.equal(bytes(prefix+'-stderr.txt').length,0);
for(const pin of source.audit_inputs)assert.equal(hash(pin.path),pin.sha256,'audited source changed '+pin.path);
const goVersion=read('C:/Program Files/Go/VERSION').split(/\r?\n/)[0];assert.equal(goVersion,'go1.26.1');
assert.match(read('backend/go.mod'),/github.com\/go-sql-driver\/mysql v1\.9\.0\b/);
const registry=read('backend/internal/systembackupevidence/sql.go'),collector=read('backend/internal/systembackupevidence/download_retention_gc.go');
assert.ok(registry.includes('s.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})'));
assert.ok(collector.includes('r.begin(ctx)'));assert.ok(collector.includes('tx.Commit()'));
assert.ok(!collector.includes('LOCK INSTANCE FOR BACKUP'));
assert.match(read('backend/internal/systembackupevidence/download_retention_gc_early.go'),/case "\*\.\*":\s*if privilege != "REFERENCES"/);
const sqlRuntime=read('C:/Program Files/Go/src/database/sql/sql.go');
assert.match(sqlRuntime,/func \(tx \*Tx\) close\(err error\)\s*{\s*tx.releaseConn\(err\)/);
assert.match(sqlRuntime,/func \(c \*Conn\) Close\(\) error\s*{\s*return c.close\(nil\)/);
assert.ok(sqlRuntime.includes('err = driver.ErrBadConn'));
const mysqlDriver=read('C:/Users/zhanghui08/go/pkg/mod/github.com/go-sql-driver/mysql@v1.9.0/connection.go');
const reset=mysqlDriver.slice(mysqlDriver.indexOf('func (mc *mysqlConn) ResetSession('),mysqlDriver.indexOf('// IsValid implements'));
assert.ok(reset.includes('connCheck(conn)'));assert.ok(!reset.includes('writeCommand'));assert.ok(!reset.includes('UNLOCK'));
const expected={
  TestTxOnlyCommitReturnsLockedSessionToPool:'tx_only_pool_reused_locked_session=yes post_commit_tx_unlock=ErrTxDone',
  TestDedicatedConnSpansCommitAndUnlock:'owned_conn_reserved_through_commit=yes unlock_before_pool_return=yes',
  TestRollbackDoesNotReleaseSessionLock:'rollback_retains_explicit_session_lock=yes',
  TestConnCloseAloneReturnsLockedSession:'conn_close_is_pool_return=yes raw_ErrBadConn_discards_session=yes',
  TestUnknownCommitDiscardsWithoutClaimingRollback:'unknown_commit_may_have_committed=yes no_rollback_claim=yes physical_discard=yes',
  TestCanceledTxCanRetainSessionUntilDiscard:'canceled_tx_rollback_does_not_unlock_session=yes physical_discard=yes'
};
const log=read(prefix+'.jsonl');assert.ok(log.endsWith('\n'));
const ev=log.trim().split(/\r?\n/).map(s=>JSON.parse(s));
assert.ok(!ev.some(x=>['fail','skip','build-fail'].includes(x.Action)));
const passed=ev.filter(x=>x.Action==='pass'&&x.Test).map(x=>x.Test);
assert.deepEqual(passed.sort(),Object.keys(expected).sort());
for(const [test,marker]of Object.entries(expected)){
  assert.equal(ev.filter(x=>x.Action==='run'&&x.Test===test).length,1);
  assert.ok(ev.some(x=>x.Action==='output'&&x.Test===test&&x.Output.includes('MODEL '+marker)),test+' missing observed state');
}
const packagePass=ev.find(x=>x.Action==='pass'&&!x.Test&&x.Package==='freeze-session-experiment');assert.ok(packagePass);
const specPath=e+'d-gc-backup-lock-protocol-requirements-20261021.json',spec=json(specPath);
assert.equal(spec.runtime_changed,false);assert.equal(spec.mysql_executed,false);assert.equal(spec.production_approved,false);
assert.equal(spec.actual_acceptance_groups.length,12);assert.ok(spec.actual_acceptance_groups.every(x=>x.executed===false));
const cleanupPath=e+'d-gc-freeze-session-cleanup-20261021.json',cleanup=json(cleanupPath);
assert.equal(cleanup.owner,source.owner);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_postcheck,true);assert.equal(cleanup.removed,true);assert.equal(fs.existsSync(at(source.owner)),false);
const receipt={kind:'d_gc_freeze_session_connection_ownership_review',status:'go_lifecycle_experiment_and_protocol_requirements_only',go_version:goVersion,mysql_driver:'v1.9.0',model:{path:model,sha256:hash(model),sql_transport:source.sql_transport,main:passed.length,checks:passed.length,tests:passed,observations:expected,elapsed_seconds:packagePass.Elapsed,default_vet:true,exit:0,source_postcheck:true},inputs:{source_manifest:prefix+'-source.json',source_manifest_sha256:hash(prefix+'-source.json'),events_sha256:hash(prefix+'.jsonl'),native_sha256:hash(prefix+'-native.json'),audited_files:source.audit_inputs},protocol:{path:specPath,sha256:hash(specPath),mysql_tag:spec.upstream.mysql_tag,release_commit:spec.upstream.release_commit,actual_groups_required:spec.actual_acceptance_groups.length,actual_groups_executed:0},cleanup:{path:cleanupPath,sha256:hash(cleanupPath),owner_absent:true},decision:{reject_tx_only_freeze_hook:true,reject_pool_return_as_unlock:true,require_collector_connection_ownership:true,require_new_privilege_review:true},boundaries:{runtime_changed:false,dependencies_installed:false,mysql_executed:false,ddl_blocking_proved:false,freeze_implemented:false,production_approved:false,complete_policy:false,original_six_scopes_complete:false}};
const out=e+'d-gc-freeze-session-accepted-20261021.json';
if(process.argv.includes('--write')){assert.equal(fs.existsSync(at(out)),false);fs.writeFileSync(at(out),JSON.stringify(receipt,null,2)+'\n');}else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(out),receipt);}
console.log('PASS Go session ownership: six lifecycle cases, default vet, pinned runtime/driver/current collector, cleanup; no MySQL lock or full GC acceptance');
