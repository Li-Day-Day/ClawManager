import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('remote read-only probe uses the observer latest-capture SQL predicates', async () => {
  const observer = await readFile(new URL('../backend/internal/systembackupobserver/observer.go', import.meta.url), 'utf8');
  const script = await readFile(new URL('./system-backup-d-observer-sql-preflight.sh', import.meta.url), 'utf8');
  const query = observer.match(/q := `(SELECT COUNT\(\*\),COALESCE\(SUM\(j\.last_accepted_sequence>0[\s\S]*?)`/);
  assert.ok(query, 'observer query missing');
  const probe = script.match(/SELECT COUNT\(\*\) AS latest_capture_jobs,[\s\S]*?;/);
  assert.ok(probe, 'probe query missing');
  const values = ["'installation_fixture'", "'backup'", "'sbk_00000000-0000-4000-8000-000000000000'", "'backup'", "'sbk_00000000-0000-4000-8000-000000000000'"];
  let i = 0;
  const sql = query[1].replace(/\?/g, () => values[i++]);
  assert.equal(i, values.length);
  const normalized = s => s.slice(s.indexOf('FROM system_backup_job_observations j')).replace(/;$/, '').replace(/\s+/g, ' ').trim();
  const projected = probe[0].replace("'$SBK_OBSERVER_INSTALLATION_ID'", "'installation_fixture'");
  assert.equal(normalized(projected), normalized(sql));
  assert.ok(observer.includes('WHERE origin_installation_id=? AND endpoint=? AND idempotency_key=?'), 'observer installation key query missing');
  assert.match(script, /SELECT COUNT\(\*\) AS installation_key_count FROM system_backups WHERE origin_installation_id='\$SBK_OBSERVER_INSTALLATION_ID' AND endpoint='createSystemBackup' AND idempotency_key='d-observer-syntax-probe-20261028';/);
  assert.match(script, /START TRANSACTION READ ONLY;/);
  assert.match(script, /ROLLBACK;/);
  assert.match(script, /READ_ONLY_SCHEMA_PROBE_ONLY_NOT_ACCEPTANCE/);
});
