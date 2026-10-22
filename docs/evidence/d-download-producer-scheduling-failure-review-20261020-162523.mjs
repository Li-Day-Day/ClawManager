import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace, decode, sha256, localStages} from './a-download-owners-actual-review-20261020.mjs';

const prefix = 'docs/evidence/d-download-producer-remote-20261020-162523';
const baseline = 'docs/evidence/d-download-gc-dependencies-20261020-r4';
const raw = p => fs.readFileSync(path.join(workspace, p));
const bytes = raw(prefix + '.txt'), text = decode(bytes);
const sourceBytes = raw(prefix + '-source.json'), source = JSON.parse(decode(sourceBytes));
const baselineBytes = raw(baseline + '-source.json'), baselineSource = JSON.parse(decode(baselineBytes));
const eventBytes = raw(baseline + '.jsonl');
assert.equal(sha256(baselineBytes), '9f7e972b22dc334208ff162d54fae4245d1e4e7ddaff098c0ba4f6f97bc9da19');
assert.equal(sha256(eventBytes), '40f3a4fb56475fb8de671fa383f813d19c2d7e7fa8cf8b5431d86ea0512d5533');
const inventory = decode(eventBytes).trim().split('\n').map(JSON.parse);
const names = (s, pattern) => [...s.matchAll(pattern)].map(m => m[1]).sort();
const runs = s => names(s, /^=== RUN\s+(\S+)\s*$/gm);
const passes = s => names(s, /^\s*--- PASS: (\S+) /gm);
function one(re, s = text) { const ms = [...s.matchAll(re)]; assert.equal(ms.length, 1, String(re)); return ms[0]; }
function digest(s) {
  assert.equal(s.stable_copy_verified, true); assert.equal(s.dependencies_installed, false); assert.equal(s.production_approved, false);
  assert.equal(new Set(s.files.map(f => f.path)).size, s.files.length);
  assert.ok(s.files.every(f => /^(backend|contracts|scripts|docs)\//.test(f.path) && !f.path.includes('\\') && !f.path.split('/').some(p => ['..', '.', ''].includes(p)) && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isSafeInteger(f.size) && f.size >= 0));
  assert.equal(sha256(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), s.source_sha256);
}
digest(source); digest(baselineSource);
assert.equal(source.source_sha256, '04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df');
assert.equal(source.files.length, 1446); assert.deepEqual(source.files, baselineSource.files);
const frozen = one(/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)$/gm);
assert.equal(frozen[1], source.source_sha256); assert.equal(Number(frozen[2]), source.files.length);
assert.doesNotMatch(text, /^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|CLEANUP_PENDING/m);
const run = one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm);
assert.equal(run[1], 'sbk-mig-261020085946-3817'); assert.equal(run[2], 'bd6cf195-a269-4ff4-bef0-d7f02de7fad0');
assert.equal(run[5], '8.4.8'); assert.ok([run[3],run[4]].every(s => /@sha256:[a-f0-9]{64}$/.test(s)));
const local = text.slice(0, run.index), remote = text.slice(run.index);
const stages = localStages(local);
const consoleNameTranscoding = [];
assert.ok(!inventory.some(e => ['fail','build-fail','skip'].includes(e.Action)));
for (const stage of stages.slice(0,2)) {
  assert.equal(inventory.filter(e => !e.Test && e.Action === 'pass' && e.Package === stage.package).length, 1);
  const expected = inventory.filter(e => e.Test && e.Action === 'pass' && e.Package === stage.package).map(e => e.Test).sort();
  assert.deepEqual(inventory.filter(e => e.Test && e.Action === 'run' && e.Package === stage.package).map(e => e.Test).sort(), expected);
  // These four exact canonical IDs have UTF-8 C2 B5 decoded as GBK in the
  // operator's console transcript. Keep the raw log; permit no other aliases.
  const observedExpected = expected.map(name => {
    if (!/^(TestGCSchedulingDueTimeEnforcedUnderClaimLock|TestRecoverySchedulingRecheckedUnderClaimLock)\/-?1µs$/.test(name)) return name;
    const observed = new TextDecoder('gbk', {fatal:true}).decode(Buffer.from(name, 'utf8'));
    assert.equal(observed, name.replace('µ', '碌'));
    consoleNameTranscoding.push({canonical:name,observed});
    return observed;
  });
  assert.equal(new Set(observedExpected).size, expected.length);
  assert.deepEqual(stage.names.slice().sort(), observedExpected.slice().sort());
}
assert.equal(consoleNameTranscoding.length, 4);
const seedBytes = raw(baseline + '-tagged-seed.txt');
const seedEvents = decode(seedBytes).trim().split('\n').map(JSON.parse);
assert.ok(!seedEvents.some(e => ['fail','build-fail','skip'].includes(e.Action)));
const seeds = seedEvents.filter(e => e.Test && e.Action === 'pass').map(e => e.Test).sort();
assert.equal(seeds.length, 22); assert.equal(seeds.filter(n => !n.includes('/')).length, 3);
assert.deepEqual(seedEvents.filter(e => e.Test && e.Action === 'run').map(e => e.Test).sort(), seeds);
assert.deepEqual(stages[2].names.slice().sort(), seeds);
const detachedAt = local.indexOf('LOCAL_PASS config-standalone-seed=yes', stages[2].end);
assert.ok(detachedAt > stages[2].end);
const detached = local.slice(stages[2].end, detachedAt);
assert.deepEqual(runs(detached), seeds); assert.deepEqual(passes(detached), seeds); assert.match(detached, /\nPASS\s*$/);
const probe = one(/^LOCAL_PASS d-download-producer-owner-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/gm);
assert.equal(probe[2], source.files.find(f => f.path.endsWith('/download_producer_probe_inputs.json'))?.sha256);
const runner = one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/gm);
assert.ok(local.includes('bundle.tar: OK'));
const diagnostic = one(/^MYSQL_STARTUP_DIAGNOSTIC namespace=(\S+) uid=(\S+) node=(\S+)$/gm, remote);
assert.equal(diagnostic[1], run[1]); assert.equal(diagnostic[2], run[2]); assert.equal(diagnostic[3], 'node1');
const diagnosticEnd = remote.indexOf('MYSQL_STARTUP_DIAGNOSTIC end;', diagnostic.index);
assert.ok(diagnosticEnd > diagnostic.index);
const observations = remote.slice(diagnostic.index, diagnosticEnd);
assert.match(remote.slice(0,diagnostic.index), /timed out waiting for the condition on pods\/mysql/);
assert.match(observations, /^POD phase=Pending node= reason=$/m);
assert.match(observations, /^CONDITION PodScheduled=False reason=Unschedulable$/m);
const event = one(/^EVENT Warning reason=FailedScheduling .*message=(.+)$/gm, observations)[1];
assert.match(event, /1 Too many pods/); assert.match(event, /1 node\(s\) didn't match Pod's node affinity\/selector/);
assert.match(observations, /^NODE_CONDITION Ready=True /m);
for (const condition of ['MemoryPressure','DiskPressure','PIDPressure']) assert.match(observations, new RegExp('^NODE_CONDITION '+condition+'=False ', 'm'));
assert.deepEqual(runs(remote), []); assert.deepEqual(passes(remote), []);
assert.doesNotMatch(remote, /PASS fresh-migration-replay|PASS pinned-migration-runner|PASS d-download-producer|"migration_count"/);
const cleaned = one(/^CLEANED namespace=(\S+) uid=(\S+)$/gm, remote);
assert.equal(cleaned[1], run[1]); assert.equal(cleaned[2], run[2]);
const owner = one(/^LOCAL_OWNER config-writer-source=(.+)$/gm)[1].trim();
assert.equal(path.dirname(path.resolve(owner)).toLowerCase(), workspace.toLowerCase());
assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`)); assert.equal(fs.existsSync(owner), false);
for (const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True']) assert.ok(remote.includes(marker));
assert.equal(one(/^download_producer_exit=(-?\d+)$/gm, remote)[1], '1');
assert.doesNotMatch(remote, /LOCAL_PASS config-writer-frozen-postcheck=yes/);
assert.match(text.trimEnd(), /download_producer_exit=1$/);
const report = {
  kind: 'd_producer_remote_scheduling_failure_review', recorded_at: new Date().toISOString(),
  log: prefix+'.txt', log_sha256: sha256(bytes), source_manifest: prefix+'-source.json', source_manifest_sha256: sha256(sourceBytes),
  source_sha256: source.source_sha256, source_files: source.files.length, exact_historical_baseline_files: true,
  baseline_events_sha256: sha256(eventBytes), seed_events_sha256: sha256(seedBytes),
  local_stages: stages.map(s => ({package:s.package,main:s.names.filter(n=>!n.includes('/')).length,all:s.names.length,elapsed:s.elapsed})),
  console_name_transcoding: {consistent_with:'UTF-8 bytes decoded as GBK in operator console',exact_aliases:consoleNameTranscoding,raw_log_modified:false},
  detached_seed_checks:22, probe_sha256:probe[1], inputs_sha256:probe[2], migration_runner_sha256:runner[1],
  remote_started:true, namespace:run[1],namespace_uid:run[2],app_image:run[3],mysql_image:run[4],mysql_version:run[5],
  failed_stage:'mysql_pod_scheduling_before_target_migrations_and_probe', node:'node1', failed_scheduling_event:event,
  actual_producer_cases:0, target_migrations_started:false, exit:1, final_frozen_postcheck:false,
  namespace_cleanup:'reported_exact_original_uid', remote_scratch_cleanup:'reported', local_build_cleanup:'reported',
  local_source_owner:owner, local_source_owner_independently_absent:true,
  live_cluster_rechecked:false, current_source_match_not_asserted:true, dependencies_installed:false, production_approved:false,
  reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
  scope:'Historical failure classification only. Local ordinary tests and packaged/detached seeds passed. Remote began, MySQL remained unscheduled, target migrations/probe did not run. Cleanup reports do not prove current remote capacity or production readiness.'
};
const output=path.join(workspace,'docs/evidence/d-download-producer-scheduling-failure-20261020-162523.json');
if(process.argv.includes('--check')){const saved=JSON.parse(fs.readFileSync(output,'utf8'));report.recorded_at=saved.recorded_at;assert.deepEqual(report,saved);}
else {assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:'reviewed_failure_preserved',local:report.local_stages,remote_started:true,actual_producer_cases:0,exit:1,owned_source_absent:true}));
