import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const round=process.argv[2]??'r54';assert.match(round,/^r[0-9]+$/);
const rawPath=`docs/evidence/system-backup-d-server-read-local-20261016-${round}.txt`;
const manifestPath=`docs/evidence/system-backup-d-server-read-source-20261016-${round}.json`;
const log=read(rawPath).toString('utf8'),m=JSON.parse(read(manifestPath));
const digest=sha(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
assert.equal(digest,m.source_sha256);assert.equal(m.stable_copy_verified,true);
assert.ok(log.includes(`LOCAL_SOURCE d-server-read-frozen=yes files=${m.files.length} source_sha256=${digest}`));
assert.match(log,/^d_server_read_exit=0\s*$/m);
assert.match(log,/LOCAL_PASS full-cmd-server-test-and-linux-build=yes release-deployment=no/);
assert.match(log,/LOCAL_PASS d-server-read-frozen-postcheck=yes dependency-installation=no remote=no/);
assert.match(log,/CLEANED server-read-local-source-cache=True/);
assert.match(log,/go version go1\.26\.1 linux\/amd64/);
const events=log.split(/\r?\n/).filter(l=>l.startsWith('{')).flatMap(l=>{try{return[JSON.parse(l)]}catch{return[]}});
assert.ok(events.length>0);assert.ok(events.every(e=>e.Action!=='fail'));
assert.equal(events.filter(e=>e.Action==='pass'&&!e.Test&&e.Package==='clawreef/cmd/server').length,1);
const passes=events.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test);
for(const name of ['TestLiveBackupReadRequiresPinnedAuthorityAndSessions','TestLiveBackupReadHTTPFailsClosedWithoutCurrentAuthorization'])assert.ok(passes.includes(name),name);
const focused=m.files.filter(p=>p.path==='backend/go.mod'||p.path==='backend/go.sum'||
  p.path.startsWith('backend/')&&p.path.endsWith('.go')&&(!p.path.endsWith('_test.go')||p.path.startsWith('backend/cmd/server/'))||
  ['scripts/system-backup-d-server-read-validation.ps1','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-evidence-go-step.ps1'].includes(p.path));
for(const p of focused){const b=read(p.path);assert.equal(b.length,p.size,p.path);assert.equal(sha(b),p.sha256,p.path)}
const owner=log.match(/^LOCAL_OWNER server-read-source=.+[\\/](\.tmp-d-index-cache-([a-f0-9]{32})) container=(codex-d-server-read-[a-f0-9]{32})\s*$/m);
assert.ok(owner);assert.equal(owner[3],`codex-d-server-read-${owner[2]}`);assert.equal(existsSync(new URL(owner[1],root)),false);
const report={kind:'d_full_server_package_validation_acceptance.v1',recorded_at:new Date().toISOString(),status:'full_cmd_server_tests_and_linux_build_accepted',
  raw_log:rawPath,raw_log_sha256:sha(read(rawPath)),source_manifest:manifestPath,source_manifest_sha256:sha(read(manifestPath)),source_files:m.files.length,source_sha256:digest,
  top_level:passes.filter(t=>!t.includes('/')).length,including_subtests:passes.length,tests:passes,
  skipped:events.filter(e=>e.Action==='skip'&&e.Test).map(e=>e.Test),focused_current_pins:focused.length,
  default_vet:true,buffered_original_report:true,go_version:'go1.26.1 linux/amd64',CGO_ENABLED:0,
  modules_read_only:true,dependencies_installed:false,image_pulled:false,network_enabled:false,
  owner_directory_independently_absent:owner[1],container_name:owner[3],exit_code:0,linux_server_binary_built_and_removed:true,
  actual_database_or_live_auth_verified:false,production_deployment:false,overall_goal_complete:false};
writeFileSync(new URL(`./system-backup-d-server-read-review-20261016-${round}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,tests:[report.top_level,report.including_subtests],skipped:report.skipped.length,focused:focused.length,cleanup:true}));
