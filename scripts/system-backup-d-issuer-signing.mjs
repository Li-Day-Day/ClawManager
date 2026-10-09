import {spawnSync} from 'node:child_process';
import {createHash, createPublicKey, randomBytes, verify} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {identitySSHCommand, normalizeProbeInput} from './system-backup-a-identity-ssh.mjs';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';
import {validateIssuerResult} from './system-backup-d-provider-issuer.mjs';
import {validateStrongIssuerResult} from './system-backup-d-strong-auth-issuer.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const requireValue = v => { if (!v) throw Error('signing acceptance rejected'); };
const exact = (v, names) => requireValue(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join() === names.split(' ').sort().join());
const source = name => normalizeProbeInput(readFileSync(new URL('./' + name, import.meta.url)));
const sourceFiles = {BASE_SOURCE:'system-backup-a-evidence-spike.py', CLIENT_SOURCE:'system-backup-d-lifecycle-client.py',
  LIFECYCLE_SOURCE:'system-backup-d-lifecycle.py', SIGNING_CLIENT_SOURCE:'system-backup-d-issuer-signing-client.py', RUNNER:'system-backup-d-issuer-signing.py'};
const installation = 'installation_sbk_provider_zh_7474d6e0b052';
const pins = {
  provider: {run:'d-issuer-d7f0a14ec84d78927620d25f', prefix:'provider', hash:'c1b76a352d37cee763235c645cf82ded5e4193cb66fb12614a83c4cb950ed4a8'},
  strong: {run:'d-mfa-605b0a987c4d17bb3f642e72', prefix:'strong-auth', hash:'6b309f8cd8c48f06b131d4a5efc4003556f552436d82fc84044f723b6aec6e8f'},
};

export function readCandidates(h = readHandoff()) {
  requireValue(h.provider_wire_parameters?.signing_key_version === '1');
  const candidates = {};
  for (const [role, pin] of Object.entries(pins)) {
    const base = `../docs/evidence/system-backup-${pin.prefix}-issuer-${pin.run}`;
    const v = JSON.parse(readFileSync(new URL(base + '.json', import.meta.url)));
    const raw = readFileSync(new URL(base + '.registry.json', import.meta.url));
    const files = {...sourceFiles, RUNNER: `system-backup-d-${pin.prefix}-issuer.py`};
    delete files.SIGNING_CLIENT_SOURCE;
    const bindings = Object.fromEntries(Object.entries(files).map(([k, f]) => [k.toLowerCase() + '_sha256', sha(source(f))]));
    (role === 'provider' ? validateIssuerResult : validateStrongIssuerResult)(v, {run:pin.run, installation, h, bindings});
    requireValue(sha(raw) === pin.hash && raw.toString() === v.registry_json);
    candidates[role] = v;
  }
  requireValue(candidates.provider.key.public_key_base64 !== candidates.strong.key.public_key_base64);
  return candidates;
}

export function makeChallenges(run, h, candidates) {
  return Object.fromEntries(['provider', 'strong'].map(role => [role, Buffer.from(JSON.stringify({
    domain:'D_TRANSIT_ACCEPTANCE_V1', run_id:run, namespace_uid:h.namespace_uid, role,
    registry_sha256:candidates[role].registry_sha256,
  })).toString('base64')]));
}

export function validateSigningResult(v, {run, h, candidates, bindings, challenges}) {
  exact(v, 'kind run_id namespace_uid bindings registry_sha256 challenges signatures checks cleaned keys_retained active_config_updated http_service_ready human_mfa_verified');
  requireValue(v.kind === 'd_issuer_signing_acceptance_v1' && v.run_id === run && v.namespace_uid === h.namespace_uid);
  exact(v.bindings, Object.keys(bindings).join(' '));
  for (const [key, value] of Object.entries(bindings)) requireValue(v.bindings[key] === value);
  for (const name of ['registry_sha256', 'challenges', 'signatures', 'checks']) exact(v[name], 'provider strong');
  requireValue(v.cleaned === true && v.keys_retained === true && v.active_config_updated === false && v.http_service_ready === false && v.human_mfa_verified === false);
  for (const role of ['provider', 'strong']) {
    requireValue(v.registry_sha256[role] === candidates[role].registry_sha256 && v.challenges[role] === challenges[role]);
    exact(v.checks[role], 'cross_key omitted zero wrong wrong-string extra key_read revoked');
    requireValue(Object.values(v.checks[role]).every(status => status === 403));
    requireValue(typeof v.signatures[role] === 'string');
    const signature = Buffer.from(v.signatures[role], 'base64');
    requireValue(signature.length === 64 && signature.toString('base64') === v.signatures[role]);
    const publicKey = Buffer.from(candidates[role].key.public_key_base64, 'base64');
    const key = createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicKey]), type:'spki', format:'der'});
    requireValue(verify(null, Buffer.from(challenges[role], 'base64'), key, signature));
  }
  return v;
}

export function validateFailure(v, run) {
  exact(v, 'error run_id stage diagnostic cleaned');
  requireValue(v.error === 'issuer_signing_failed_or_cleanup_pending' && v.run_id === run && /^[a-z_.-]{1,80}$/.test(v.stage) && typeof v.cleaned === 'boolean');
  exact(v.diagnostic, 'code http_status');
  requireValue(['orchestration_failure', 'unexpected_http_status', 'invalid_signature_format', 'client_assertion_or_transport'].includes(v.diagnostic.code));
  requireValue(v.diagnostic.http_status === null || Number.isInteger(v.diagnostic.http_status) && v.diagnostic.http_status >= 100 && v.diagnostic.http_status <= 599);
  return v;
}

function main() {
  const args = process.argv.slice(2), password = args.at(-1) === '--ssh-password';
  if (password) args.pop();
  const action = args.shift();
  requireValue(['run', 'cleanup'].includes(action) && args[0] === '--ssh-host' &&
    (action === 'run' ? args.length === 2 : args.length === 4 && args[2] === '--run-id'));
  const host = args[1], run = action === 'run' ? 'd-sig-' + randomBytes(12).toString('hex') : args[3];
  requireValue(/^d-sig-[a-f0-9]{24}$/.test(run));
  const h = readHandoff(), candidates = readCandidates(h), challenges = makeChallenges(run, h, candidates);
  const sources = Object.fromEntries(Object.entries(sourceFiles).map(([k, f]) => [k, source(f)]));
  const bindings = Object.fromEntries(Object.entries(sources).map(([k, b]) => [k.toLowerCase() + '_sha256', sha(b)]));
  const encoded = value => Buffer.from(value).toString('base64');
  let prefix = 'import json,base64\n';
  for (const [k, v] of Object.entries({HANDOFF:h, OPTIONS:{action, run_id:run, candidates, challenges}, BINDINGS:bindings})) {
    prefix += `${k}=json.loads(base64.b64decode('${encoded(JSON.stringify(v))}'))\n`;
  }
  for (const [k, v] of Object.entries(sources).filter(([k]) => k !== 'RUNNER')) prefix += `${k}=base64.b64decode('${encoded(v)}').decode('utf-8')\n`;
  const [cmd, ...sshArgs] = identitySSHCommand(host, {passwordLogin:password});
  sshArgs[sshArgs.length - 1] = 'python3 -B -';
  console.log('run_id=' + run);
  console.log(`RECOVERY: node .\\scripts\\system-backup-d-issuer-signing.mjs cleanup --ssh-host ${host} --run-id ${run}${password ? ' --ssh-password' : ''}`);
  const result = spawnSync(cmd, sshArgs, {shell:false, input:Buffer.concat([Buffer.from(prefix), sources.RUNNER]),
    timeout:600000, maxBuffer:65536, windowsHide:!password, stdio:['pipe', 'pipe', password ? 'inherit' : 'pipe']});
  if (result.error || result.signal || result.status !== 0) {
    let detail = 'stage=ssh_or_remote cleanup=unverified';
    try {
      const failed = validateFailure(JSON.parse(result.stdout), run);
      if (result.status === 1 && !result.error && !result.signal) {
        const path = new URL(`../docs/evidence/system-backup-issuer-signing-${run}.failed.json`, import.meta.url);
        writeFileSync(path, JSON.stringify(failed, null, 2) + '\n', {flag:'wx'});
        detail = `stage=${failed.stage} code=${failed.diagnostic.code} http_status=${failed.diagnostic.http_status ?? 'unavailable'} cleanup=${failed.cleaned ? 'complete' : 'unverified'}`;
        if (failed.cleaned) console.log('CLEANED signing-test-resources=yes issuer-keys-retained=yes');
      }
    } catch {}
    throw Error(`signing acceptance failed: ${detail}; retain run_id; raw output withheld`);
  }
  const v = JSON.parse(result.stdout);
  if (action === 'cleanup') {
    exact(v, 'kind run_id cleaned');
    requireValue(v.kind === 'd_issuer_signing_cleanup_v1' && v.run_id === run && v.cleaned === true);
    console.log('CLEANED signing-test-resources=yes issuer-keys-retained=yes');
    return;
  }
  validateSigningResult(v, {run, h, candidates, challenges, bindings});
  const path = new URL(`../docs/evidence/system-backup-issuer-signing-${run}.json`, import.meta.url);
  writeFileSync(path, JSON.stringify(v, null, 2) + '\n', {flag:'wx'});
  console.log('evidence=' + fileURLToPath(path));
  console.log('PASS real-issuer-signatures=2 acl-denials=16 local-ed25519-verification=yes');
  console.log('CLEANED signing-test-resources=yes issuer-keys-retained=yes');
  console.log('active_config_updated=false http_service_ready=false human_mfa_verified=false');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error.message.startsWith('signing acceptance failed:') ? error.message : 'Signing command failed or result rejected; retain run_id. Raw output withheld.');
    process.exitCode = 1;
  }
}
