import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createEvidenceDownloadTransport, downloadBackupEvidence, evidenceDownloadEnabled,
  EvidenceDownloadError, evidenceDownloadLimit } from '../src/pages/admin/backups/backupEvidenceDownload.ts';
import { systemBackupTranslations } from '../src/lib/systemBackupI18n.ts';

const id = 'sev_11111111-2222-4333-8444-555555555555';
const op = 'sop_11111111-2222-4333-8444-555555555555';
const installation = 'installation_test';
const bytes = new TextEncoder().encode('{"report":"redacted"}');
const digest = createHash('sha256').update(bytes).digest('hex');
const signal = () => new AbortController().signal;
const input = () => ({ evidenceId: id, installation, credentials: { password: 'TEST_PRIVATE_PASSWORD', code: '123456' } });
const rejects = code => error => error instanceof EvidenceDownloadError && error.code === code
  && !JSON.stringify(error).includes('PRIVATE');
function proof(body, change = {}) {
  const payload = { endpoint: 'getSystemBackupEvidence', idempotency_key: body.idempotency_key, audience: installation, ...change };
  return new Response(JSON.stringify({ header_name: 'X-Strong-Auth-Proof', header_value: btoa(JSON.stringify({ payload })) }),
    { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } });
}
function file(change = {}, data = bytes) {
  return new Response(data, { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="untrusted-server-name.json"', 'Content-Length': String(bytes.length),
    ETag: `"${digest}"`, 'X-System-Backup-Operation-Id': op, ...change } });
}
function fixture(override) {
  const calls = [];
  let session = 'TEST_PRIVATE_TOKEN';
  const transport = {
    session: () => session,
    request: async (path, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ path, ...init, headers: { ...init.headers }, body });
      return override ? override(path, init, body) : body ? proof(body) : file();
    },
  };
  return { transport, calls, setSession: value => { session = value; } };
}

test('MFA then one exact full GET returns a verified file and admission Operation ID', async () => {
  const f = fixture();
  const result = await downloadBackupEvidence(f.transport, input(), signal());
  assert.equal(f.calls.length, 2);
  const [first, second] = f.calls;
  assert.equal(first.path, '/api/v1/admin/system-backup-strong-auth/proof');
  assert.equal(first.method, 'POST');
  assert.deepEqual(first.body.request, { evidence_id: id });
  assert.equal(first.body.endpoint, 'getSystemBackupEvidence');
  assert.equal(first.body.password, 'TEST_PRIVATE_PASSWORD');
  assert.equal(first.body.code, '123456');
  assert.equal(second.path, `/api/v1/admin/system-backup-evidence/${id}`);
  assert.equal(second.method, 'GET');
  assert.equal(second.body, null);
  assert.equal(second.headers['Idempotency-Key'], first.body.idempotency_key);
  assert.ok(second.headers['X-Strong-Auth-Proof']);
  assert.equal(Object.hasOwn(second.headers, 'Range'), false);
  for (const call of f.calls) {
    assert.equal(call.cache, 'no-store'); assert.equal(call.redirect, 'error'); assert.equal(call.credentials, 'omit');
    assert.equal(call.headers.Authorization, 'Bearer TEST_PRIVATE_TOKEN');
  }
  assert.equal(result.evidenceId, id); assert.equal(result.operationId, op); assert.equal(result.sha256, digest);
  assert.equal(result.filename, `${id}.json`);
  assert.equal(result.blob.type, 'application/octet-stream');
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), bytes);
  assert.equal(Object.hasOwn(result, 'proof'), false);
});

test('ordinary mode sends one GET without proof and does not require a sensitive admission ID', async () => {
  const f = fixture(() => { const response = file(); response.headers.delete('X-System-Backup-Operation-Id'); return response; });
  const result = await downloadBackupEvidence(f.transport, { evidenceId: id, installation: null }, signal());
  assert.equal(f.calls.length, 1); assert.equal(result.operationId, null);
  assert.equal(f.calls[0].headers['X-Strong-Auth-Proof'], undefined);
});

for (const [status, code] of [[400, 'validation'], [401, 'authentication'], [403, 'permission'], [404, 'notFound'],
  [409, 'conflict'], [410, 'conflict'], [416, 'tooLarge'], [429, 'rateLimited'], [500, 'network'], [503, 'notReady']]) {
  test(`HTTP ${status} cannot retry, leak server error text or proceed to download`, async () => {
    const f = fixture(() => new Response('TEST_PRIVATE_SERVER_ERROR', { status }));
    await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects(code));
    assert.equal(f.calls.length, 1);
  });
}

for (const [name, change] of [['wrong audience', { audience: 'installation_other' }], ['wrong endpoint', { endpoint: 'updateSystemBackupConfig' }],
  ['wrong key', { idempotency_key: 'other_request' }]]) test(`proof ${name} prevents GET`, async () => {
  const f = fixture((path, init, body) => proof(body, change));
  await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('integrity'));
  assert.equal(f.calls.length, 1);
});

for (const body of ['null', '[]', '{}', '{"header_name":"Authorization","header_value":"cHJpdmF0ZQ=="}',
  '{"header_name":"X-Strong-Auth-Proof","header_value":"cHJpdmF0ZQ=="}']) {
  test(`malformed proof envelope ${body.slice(0, 12)} cannot become a request header`, async () => {
    const f = fixture(() => new Response(body, { headers: { 'Cache-Control': 'no-store' } }));
    await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('integrity'));
    assert.equal(f.calls.length, 1);
  });
}

for (const [name, headers] of [['wrong checksum', { ETag: `"${'a'.repeat(64)}"` }], ['short file', { 'Content-Length': String(bytes.length + 1) }],
  ['weak checksum', { ETag: `W/"${digest}"` }], ['HTML', { 'Content-Type': 'text/html' }],
  ['wrong operation ID', { 'X-System-Backup-Operation-Id': 'sop_bad' }], ['cacheable', { 'Cache-Control': 'public' }],
  ['inline', { 'Content-Disposition': 'inline' }], ['unexpected range', { 'Content-Range': `bytes 0-1/${bytes.length}` }]]) {
  test(`download rejects ${name} without releasing a file`, async () => {
    const f = fixture((path, init, body) => body ? proof(body) : file(headers));
    await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('integrity'));
    assert.equal(f.calls.length, 2);
  });
}

test('sensitive download requires a valid Operation header and never accepts partial transport success', async () => {
  for (const partial of [false, true]) {
    const f = fixture((path, init, body) => {
      if (body) return proof(body);
      if (partial) return new Response(bytes, { status: 206 });
      const response = file(); response.headers.delete('X-System-Backup-Operation-Id'); return response;
    });
    await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('integrity'));
  }
});

test('response headers and streaming body both enforce the original 8 MiB bound', async () => {
  let canceled = false;
  for (const oversizeHeader of [true, false]) {
    const f = fixture((path, init, body) => {
      if (body) return proof(body);
      if (oversizeHeader) return file({ 'Content-Length': String(evidenceDownloadLimit + 1) });
      const response = file();
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(evidenceDownloadLimit + 1)); },
        cancel() { canceled = true; } }), { headers: response.headers });
    });
    await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('tooLarge'));
  }
  assert.equal(canceled, true);
});

test('session changes at either await boundary discard the response', async () => {
  for (const stage of ['proof', 'download']) {
    let f;
    f = fixture((path, init, body) => {
      if (stage === 'proof' || !body) f.setSession('ANOTHER_SESSION');
      return body ? proof(body) : file();
    });
    await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('sessionChanged'));
    assert.equal(f.calls.length, stage === 'proof' ? 1 : 2);
  }
});

test('a session change while streaming the file prevents release of a completed body', async () => {
  let f;
  f = fixture((path, init, body) => {
    if (body) return proof(body);
    return new Response(new ReadableStream({ pull(controller) {
      controller.enqueue(bytes); controller.close(); f.setSession('ANOTHER_SESSION');
    } }, { highWaterMark: 0 }), { headers: file().headers });
  });
  await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('sessionChanged'));
  assert.equal(f.calls.length, 2);
});

test('cancellation prevents initial work and discards uncooperative late proof/file responses', async () => {
  const early = new AbortController(); early.abort();
  const untouched = fixture();
  await assert.rejects(downloadBackupEvidence(untouched.transport, input(), early.signal), { name: 'AbortError' });
  assert.equal(untouched.calls.length, 0);
  for (const stage of ['proof', 'download']) {
    const controller = new AbortController();
    const f = fixture((path, init, body) => {
      if (stage === 'proof' || !body) controller.abort();
      return body ? proof(body) : file();
    });
    await assert.rejects(downloadBackupEvidence(f.transport, input(), controller.signal), { name: 'AbortError' });
  }
});

test('input selectors and credentials are fixed before asynchronous proof completion', async () => {
  const selected = input();
  const f = fixture((path, init, body) => {
    if (body) { selected.evidenceId = 'sev_changed'; selected.installation = 'installation_other'; selected.credentials.code = '999999'; return proof(body); }
    return file();
  });
  assert.equal((await downloadBackupEvidence(f.transport, selected, signal())).evidenceId, id);
  assert.equal(f.calls[0].body.code, '123456');
  assert.equal(f.calls[1].path, `/api/v1/admin/system-backup-evidence/${id}`);
});

test('missing login or malformed selectors stop before transport', async () => {
  for (const bad of [{ ...input(), evidenceId: '../other' }, { ...input(), credentials: { password: 'p', code: '12345' } },
    { ...input(), credentials: { password: '密'.repeat(342), code: '123456' } }]) {
    const f = fixture(); await assert.rejects(downloadBackupEvidence(f.transport, bad, signal()), rejects('validation'));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.setSession(null);
  await assert.rejects(downloadBackupEvidence(f.transport, input(), signal()), rejects('authentication'));
  assert.equal(f.calls.length, 0);
});

test('browser transport confines password/token requests to configured same-origin HTTPS without redirect following', async () => {
  const calls = [];
  const options = { origin: 'https://control.example', baseURL: '/api/v1/', session: () => 'session',
    fetch: async (url, init) => { calls.push({ url: url.href, init }); return file(); } };
  const valid = createEvidenceDownloadTransport(options);
  await valid.request(`/api/v1/admin/system-backup-evidence/${id}`, { method: 'GET' });
  assert.equal(calls[0].url, `https://control.example/api/v1/admin/system-backup-evidence/${id}`);
  for (const change of [{ origin: 'http://control.example' }, { baseURL: 'https://another.example/api/v1' },
    { baseURL: '/api/v1?token=private' }, { baseURL: 'https://user:private@control.example/api/v1' }]) {
    await assert.rejects(createEvidenceDownloadTransport({ ...options, ...change }).request('/api/v1/admin/system-backup-strong-auth/proof', {}), rejects('secureOrigin'));
  }
  await assert.rejects(valid.request('/api/v1/admin/system-backup-evidence/../../other', {}), rejects('secureOrigin'));
  assert.equal(calls.length, 1);
});

test('download UI remains gated, explicit, localized and absent from sample workspace', () => {
  assert.equal(evidenceDownloadEnabled('1'), true);
  for (const value of [undefined, '', '0', 'true']) assert.equal(evidenceDownloadEnabled(value), false);
  const code = readFileSync(new URL('../src/pages/admin/backups/BackupEvidenceDownload.tsx', import.meta.url), 'utf8');
  const keys = [...code.matchAll(/\bb\('([^']+)'/g)].map(match => match[1]);
  for (const locale of Object.keys(systemBackupTranslations)) {
    for (const key of keys) assert.ok(systemBackupTranslations[locale][key], `${locale}.${key}`);
    for (const error of ['validation', 'authentication', 'permission', 'notFound', 'notReady', 'tooLarge', 'conflict', 'rateLimited',
      'integrity', 'network', 'sessionChanged', 'secureOrigin']) assert.ok(systemBackupTranslations[locale][`evidenceDownloadError_${error}`]);
  }
  assert.doesNotMatch(code, /console\.|localStorage\.setItem|sessionStorage|window\.open|dangerouslySetInnerHTML/);
  assert.match(code, /URL\.revokeObjectURL/);
  assert.match(code, /type="password"/);
  assert.match(code, /active\.current !== null/);
});
