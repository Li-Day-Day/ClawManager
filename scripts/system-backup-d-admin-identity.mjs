import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {identitySSHCommand, normalizeProbeInput} from './system-backup-a-identity-ssh.mjs';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';

const installation = 'installation_sbk_provider_zh_7474d6e0b052';
const appNamespace = 'clawmanager-zhanghui08-system';
const appUID = '337cfe30-2c17-4b8e-b32a-760778b8098e';
const sha = b => createHash('sha256').update(b).digest('hex');
const requireValue = v => { if (!v) throw Error('admin identity result rejected'); };
const exact = (v, names) => requireValue(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join() === names.split(' ').sort().join());
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

export function validateAdminResult(v, {run, username, h, runnerHash, now = Date.now()}) {
  exact(v, 'kind run_id runner_sha256 namespace namespace_uid target_installation_id provider_namespace_uid mysql_pod snapshot remote_mutations credentials_exported active_config_updated');
  requireValue(v.kind === 'd_admin_identity_readonly_v1' && v.run_id === run && /^d-admin-[a-f0-9]{24}$/.test(run));
  requireValue(v.runner_sha256 === runnerHash && v.namespace === appNamespace && v.namespace_uid === appUID &&
    v.target_installation_id === installation && v.provider_namespace_uid === h.namespace_uid);
  requireValue(v.remote_mutations === false && v.credentials_exported === false && v.active_config_updated === false);
  exact(v.mysql_pod, 'name uid container deployment_uid');
  requireValue(uuid(v.mysql_pod.uid) && uuid(v.mysql_pod.deployment_uid));
  for (const key of ['name', 'container']) requireValue(typeof v.mysql_pod[key] === 'string' && /^[a-z0-9][a-z0-9.-]{0,252}$/.test(v.mysql_pod[key]));
  const s = v.snapshot;
  exact(s, 'database server_uuid observed_at users config_rows active_installations target_installations target_active_config_version runtime_table_count');
  requireValue(s.database === 'clawmanager' && uuid(s.server_uuid) && typeof s.observed_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(s.observed_at));
  requireValue(Number.isFinite(Date.parse(s.observed_at)) && Math.abs(now - Date.parse(s.observed_at)) <= 300000);
  requireValue(Array.isArray(s.users) && s.users.length === 1);
  const u = s.users[0];
  exact(u, 'id username role is_active auth_provider');
  requireValue(Number.isInteger(u.id) && u.id > 0 && u.id <= 2147483647 && u.username === username &&
    u.role === 'admin' && u.is_active === 1 && u.auth_provider === 'local');
  for (const k of ['config_rows', 'active_installations', 'target_installations', 'runtime_table_count']) requireValue(Number.isSafeInteger(s[k]) && s[k] >= 0);
  requireValue(s.runtime_table_count <= 4 && [0, 1].includes(s.target_installations) && s.target_installations <= s.active_installations);
  requireValue(s.target_installations === 0 ? s.target_active_config_version === null : Number.isSafeInteger(s.target_active_config_version) && s.target_active_config_version >= 1);
  return v;
}

export function candidateRBAC(v) {
  // Call only with a validated fresh database result. This is a local candidate,
  // never an activation or authorization that overrides current DB checks.
  const id = String(v.snapshot.users[0].id);
  return {schema_version:'system-backup-registration-rbac.draft.v1', version:v.run_id,
    installation_id:v.target_installation_id, bindings:[{actor_id:id, subject:'user:' + id, role:'security_admin'}]};
}

function main() {
  const args = process.argv.slice(2), password = args.at(-1) === '--ssh-password';
  if (password) args.pop();
  requireValue(args.length === 4 && args[0] === '--ssh-host' && args[2] === '--username' && /^[A-Za-z0-9_.@-]{1,64}$/.test(args[3]));
  const host = args[1], username = args[3], run = 'd-admin-' + randomBytes(12).toString('hex'), h = readHandoff();
  const runner = normalizeProbeInput(readFileSync(new URL('./system-backup-d-admin-identity.py', import.meta.url))), runnerHash = sha(runner);
  const encode = v => Buffer.from(JSON.stringify(v)).toString('base64');
  const prefix = `import json,base64\nHANDOFF=json.loads(base64.b64decode('${encode(h)}'))\nOPTIONS=json.loads(base64.b64decode('${encode({run_id:run, username, installation_id:installation})}'))\nRUNNER_SHA256='${runnerHash}'\n`;
  const [cmd, ...sshArgs] = identitySSHCommand(host, {passwordLogin:password});
  sshArgs[sshArgs.length - 1] = 'python3 -B -';
  console.log('run_id=' + run);
  const result = spawnSync(cmd, sshArgs, {shell:false, input:Buffer.concat([Buffer.from(prefix), runner]), timeout:180000,
    maxBuffer:16384, windowsHide:!password, stdio:['pipe', 'pipe', password ? 'inherit' : 'pipe']});
  if (result.error || result.signal || result.status !== 0) {
    let stage = 'ssh_or_remote';
    try {
      const failed = JSON.parse(result.stdout);
      if (failed.error === 'admin_identity_preflight_failed' && ['context_guard', 'mysql_identity', 'readonly_query', 'admin_validation', 'final_identity_check'].includes(failed.stage)) stage = failed.stage;
    } catch {}
    throw Error('admin identity failed: stage=' + stage + '; no RBAC generated; raw output withheld');
  }
  const v = validateAdminResult(JSON.parse(result.stdout), {run, username, h, runnerHash});
  const rbac = JSON.stringify(candidateRBAC(v)) + '\n', hash = sha(rbac);
  const evidencePath = new URL(`../docs/evidence/system-backup-admin-identity-${run}.json`, import.meta.url);
  const rbacPath = new URL(`../docs/evidence/system-backup-registration-rbac-${run}.candidate.json`, import.meta.url);
  const receipt = {...v, candidate_rbac_sha256:hash, candidate_rbac_file:fileURLToPath(rbacPath), candidate_only:true,
    binding_database_note:'User ID is valid only in this reported database/server identity. Do not copy to another acceptance database without re-resolving the account.'};
  writeFileSync(evidencePath, JSON.stringify(receipt, null, 2) + '\n', {flag:'wx'});
  writeFileSync(rbacPath, rbac, {flag:'wx'});
  console.log(`PASS admin-identity username=${username} user_id=${v.snapshot.users[0].id} role=admin active=yes auth_provider=local`);
  console.log(`config_rows=${v.snapshot.config_rows} active_installations=${v.snapshot.active_installations} target_installations=${v.snapshot.target_installations} runtime_tables=${v.snapshot.runtime_table_count}/4`);
  console.log('evidence=' + fileURLToPath(evidencePath));
  console.log('rbac_candidate=' + fileURLToPath(rbacPath));
  console.log('rbac_sha256=' + hash);
  console.log('candidate_only=true remote_mutations=false active_config_updated=false http_service_ready=false');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error.message.startsWith('admin identity failed:') ? error.message : 'Admin identity result rejected; no activation performed; raw output withheld');
    process.exitCode = 1;
  }
}
