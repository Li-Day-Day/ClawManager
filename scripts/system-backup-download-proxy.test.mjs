import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const shell = process.env.SYSTEM_BACKUP_TEST_SH
  || (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/sh.exe' : '/bin/sh');
assert.ok(existsSync(shell), 'Use an already installed POSIX shell; do not install dependencies');
const script = readFileSync(join(root, 'deployments/container/system-backup-download-proxy.sh'), 'utf8').replaceAll('\r\n', '\n');
const scratch = mkdtempSync(join(root, '.tmp-d-live-edge-'));
after(() => {
  const target = resolve(scratch);
  assert.equal(target.startsWith(resolve(root) + (process.platform === 'win32' ? '\\' : '/')), true);
  rmSync(target, { recursive: true });
  assert.equal(existsSync(target), false);
});
// Rendering checks file presence; nginx owns actual PEM parsing/TLS validation.
const ca = join(scratch, 'synthetic-ca.pem');
writeFileSync(ca, 'SYNTHETIC FILE PRESENCE FIXTURE\n');
const posix = path => process.platform === 'win32'
  ? path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()) : path;
function render(change = {}, syntax = false) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('SYSTEM_BACKUP_DOWNLOAD_PROXY_')) delete env[key];
  Object.assign(env, change);
  const result = spawnSync(shell, syntax ? ['-n', '-s'] : ['-s'], {
    cwd: scratch, env,
    input: (process.platform === 'win32' ? 'PATH=/usr/bin:$PATH\n' : '') + script,
    encoding: 'utf8', timeout: 15000,
  });
  assert.ifError(result.error);
  return result;
}
const enabled = () => ({
  SYSTEM_BACKUP_DOWNLOAD_PROXY_ENABLED: 'true',
  SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: 'system-backup-registration.clawmanager-zhanghui08-system.svc.cluster.local',
  SYSTEM_BACKUP_DOWNLOAD_PROXY_SERVER_NAME: 'download.synthetic.invalid',
  SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE: posix(ca),
});

test('shell syntax and default unavailable routes require no upstream or CA', () => {
  assert.equal(render({}, true).status, 0);
  const result = render();
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal((result.stdout.match(/return 503/g) || []).length, 2);
  assert.equal((result.stdout.match(/Cache-Control "no-store" always/g) || []).length, 2);
  assert.ok(result.stdout.includes('location = /api/v1/admin/system-backup-strong-auth/proof {'));
  assert.ok(result.stdout.includes('location ^~ /api/v1/admin/system-backup-evidence/ {'));
  assert.ok(!result.stdout.includes('proxy_pass'));
});

test('enabled routes preserve the request URI and require verified upstream TLS without replay', () => {
  const result = render(enabled());
  assert.equal(result.status, 0, result.stderr);
  for (const block of result.stdout.split(/^location /m).slice(1)) {
    for (const directive of [
      'proxy_ssl_verify on;', 'proxy_ssl_server_name on;',
      'proxy_ssl_name "download.synthetic.invalid";',
      'proxy_pass https://$system_backup_download_upstream$request_uri;',
      'proxy_next_upstream off;', 'proxy_redirect off;', 'proxy_intercept_errors off;',
      'proxy_buffering off;', 'proxy_request_buffering off;', 'proxy_max_temp_file_size 0;',
      'proxy_cache off;', 'proxy_store off;', 'gzip off;',
      'proxy_set_header Accept-Encoding "";', 'proxy_set_header Connection "";',
      'proxy_set_header Host $http_host;', 'add_header Cache-Control "no-store" always;',
    ]) assert.ok(block.includes(directive), directive);
    assert.ok(block.includes(':9443";'));
    assert.ok(block.includes(`proxy_ssl_trusted_certificate "${posix(ca)}";`));
    assert.ok(!/proxy_set_header (?:Authorization|Idempotency-Key|X-Strong-Auth-Proof) /i.test(block));
    assert.ok(!/proxy_hide_header (?:ETag|Content-Length|Content-Disposition|X-System-Backup-Operation-Id)/i.test(block));
    assert.ok(!block.includes('clawreef_backend'));
    assert.ok(!block.includes('return 503'));
  }
  assert.ok(!/location.*(?:system-backups|system-backup-operations|\/auth\/login)/.test(result.stdout));
});

test('explicit disable keeps upstream settings staged without contacting them', () => {
  const result = render({ ...enabled(), SYSTEM_BACKUP_DOWNLOAD_PROXY_ENABLED: 'false' });
  assert.equal(result.status, 0);
  assert.ok(!result.stdout.includes('proxy_pass'));
});

test('explicit port is rendered without modifying the public URI', () => {
  const result = render({ ...enabled(), SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT: '19443' });
  assert.equal(result.status, 0);
  assert.equal((result.stdout.match(/:19443";/g) || []).length, 2);
});

for (const [name, change] of [
  ['unknown switch', { SYSTEM_BACKUP_DOWNLOAD_PROXY_ENABLED: '1' }],
  ['missing host', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: '' }],
  ['URL host', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: 'https://private.invalid' }],
  ['host config injection', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: 'bad"; return 200; #' }],
  ['host newline', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: 'bad\nname' }],
  ['empty label', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: 'a..invalid' }],
  ['long label', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: 'a'.repeat(64) + '.invalid' }],
  ['leading hyphen', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: '-bad.invalid' }],
  ['trailing hyphen', { SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST: 'bad-.invalid' }],
  ['missing TLS name', { SYSTEM_BACKUP_DOWNLOAD_PROXY_SERVER_NAME: '' }],
  ['TLS name injection', { SYSTEM_BACKUP_DOWNLOAD_PROXY_SERVER_NAME: 'name;ssl_verify off' }],
  ['zero port', { SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT: '0' }],
  ['large port', { SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT: '65536' }],
  ['unbounded port', { SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT: '9'.repeat(100) }],
  ['port injection', { SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT: '9443; return 200' }],
  ['missing CA', { SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE: '' }],
  ['nonexistent CA', { SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE: posix(join(scratch, 'absent.pem')) }],
  ['relative CA', { SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE: 'ca.pem' }],
  ['CA injection', { SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE: '/run/ca";ssl_verify off;' }],
]) test(`rejects ${name} before emitting any proxy configuration`, () => {
  const result = render({ ...enabled(), ...change });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'Invalid system backup download proxy configuration');
});

test('empty CA is rejected before either route can be forwarded', () => {
  const empty = join(scratch, 'empty.pem');
  writeFileSync(empty, '');
  assert.equal(render({ ...enabled(), SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE: posix(empty) }).status, 1);
});

test('container composes and validates proxy configuration before starting the API', () => {
  const start = readFileSync(join(root, 'deployments/container/start.sh'), 'utf8');
  const renderAt = start.indexOf('sh /app/system-backup-download-proxy.sh > /etc/nginx/system-backup-download.locations.conf');
  const validateAt = start.indexOf('nginx -t');
  const serverAt = start.indexOf('/usr/local/bin/clawreef-server &');
  assert.ok(renderAt > 0 && validateAt > renderAt && serverAt > validateAt);
  const nginx = readFileSync(join(root, 'deployments/nginx/nginx.conf'), 'utf8');
  assert.equal((nginx.match(/include \/etc\/nginx\/system-backup-download\.locations\.conf;/g) || []).length, 1);
  const docker = readFileSync(join(root, 'Dockerfile'), 'utf8');
  for (const [flag, value] of [['VITE_SYSTEM_BACKUP_LIVE_READ', 1], ['VITE_SYSTEM_BACKUP_EVIDENCE_DOWNLOAD', 0]]) {
    assert.ok(docker.includes(`ARG ${flag}=${value}`));
    assert.ok(docker.indexOf(`ARG ${flag}=${value}`) < docker.indexOf('&& npm run build'));
  }
  assert.ok(docker.includes('0:0|0:1|1:0|1:1)'));
  assert.ok(docker.includes('COPY deployments/container/system-backup-download-proxy.sh /app/system-backup-download-proxy.sh'));
});
