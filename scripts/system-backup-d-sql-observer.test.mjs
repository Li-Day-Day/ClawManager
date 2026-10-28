import test from 'node:test';
import assert from 'node:assert/strict';
import { observe, observeTask, observerEnvironment } from './system-backup-d-sql-observer.mjs';

test('smoke CLI hook is the independent SQL observer', () => {
  assert.equal(observeTask, observe);
});

test('SQL child receives independent pins and DSN file path without API credentials', () => {
  const source = {
    SystemRoot: 'C:/Windows', SBK_OBSERVER_DSN_FILE: 'C:/controlled/observer.dsn',
    SBK_OBSERVER_CA_FILE: 'C:/controlled/ca.crt',
    SBK_OBSERVER_INSTALLATION_ID: 'installation_fixture', SBK_OBSERVER_USER: 'reader', SBK_OBSERVER_HOST: '10.0.0.1',
    SBK_OBSERVER_SERVER_UUID: '11111111-2222-4333-8444-555555555555', SBK_OBSERVER_DATABASE: 'fixture',
    SBK_SMOKE_ACCESS_TOKEN: 'PRIVATE_BEARER', SBK_SMOKE_PASSWORD: 'PRIVATE_PASSWORD',
    PATH: 'untrusted', MYSQL_PWD: 'PRIVATE_SQL_PASSWORD', NODE_OPTIONS: '--inspect',
  };
  const output = observerEnvironment(source);
  assert.equal(output.SBK_OBSERVER_INSTALLATION_ID, 'installation_fixture');
  assert.equal(output.SBK_OBSERVER_DSN_FILE, 'C:/controlled/observer.dsn');
  assert.equal(output.SBK_OBSERVER_CA_FILE, 'C:/controlled/ca.crt');
  assert.equal(output.SBK_OBSERVER_HOST, '10.0.0.1');
  assert.equal(Object.keys(output).length, 8);
  assert.ok(!JSON.stringify(output).includes('PRIVATE'));
});

test('observer rejects model mode and malformed task before spawning', async () => {
  for (const request of [
    { mode: 'model', kind: 'backup', publicID: 'sbk_11111111-2222-4333-8444-555555555555', configVersion: 1 },
    { mode: 'real', kind: 'backup', publicID: '--help', configVersion: 1 },
    { mode: 'real', kind: 'preflight', publicID: 'sbk_11111111-2222-4333-8444-555555555555', configVersion: 1 },
  ]) await assert.rejects(observe(request), /observation unavailable/);
});
