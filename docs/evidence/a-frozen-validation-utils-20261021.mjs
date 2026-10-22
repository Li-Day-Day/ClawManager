// Read-only helpers for scoped frozen Go evidence, never test/build runners.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
export {workspace, decode, sha256};
export const raw = p => fs.readFileSync(path.join(workspace, p));
export const json = p => JSON.parse(decode(raw(p)));
export const events = p => decode(raw(p)).trim().split('\n').filter(Boolean).map(JSON.parse);
export function exact(a, b) {assert.equal(new Set(a).size, a.length); assert.deepEqual(a.slice().sort(), b.slice().sort());}
export function manifest(p) {
  const s = json(p); assert.equal(s.stable_copy_verified, true); assert.equal(s.dependencies_installed, false); assert.equal(s.production_approved, false);
  assert.ok(s.files.length > 0); assert.equal(new Set(s.files.map(f => f.path)).size, s.files.length);
  for (const f of s.files) {assert.match(f.path, /^(backend|contracts|scripts|docs)\//); assert.ok(!f.path.includes('\\') && !f.path.split('/').some(p => ['', '.', '..'].includes(p))); assert.match(f.sha256, /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(f.size) && f.size >= 0);}
  assert.equal(sha256(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), s.source_sha256); return s;
}
export function inventory(p, packages) {
  const es = events(p); assert.ok(!es.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)));
  exact(es.filter(e => e.Test && e.Action === 'run').map(e => `${e.Package}\0${e.Test}`), es.filter(e => e.Test && e.Action === 'pass').map(e => `${e.Package}\0${e.Test}`));
  exact(es.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package), packages); return es.filter(e => e.Test && e.Action === 'pass');
}
export function native(p, s, cleanupMarker, requireExit = true) {
  const text = decode(raw(p));
  for (const marker of ['default_vet=yes', 'FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no', cleanupMarker]) assert.ok(text.includes(marker), marker);
  assert.match(text, /(?:PowerShell transcript end|Windows PowerShell 脚本结束)/); assert.match(text, /(?:End time:|结束时间:)/);
  if (requireExit) exact([...text.matchAll(/^d_admission_native_exit=(-?\d+)$/gm)].map(m => m[1]), ['0']);
  assert.ok(!/^RUN namespace=/m.test(text));
  const owners = [...text.matchAll(/^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$/gm)]; assert.equal(owners.length, 1); assert.equal(Number(owners[0][1]), s.files.length); assert.equal(owners[0][2], s.source_sha256);
  const owner = owners[0][3].trim(); assert.equal(path.dirname(path.resolve(owner)).toLowerCase(), workspace.toLowerCase()); assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/); assert.equal(fs.existsSync(owner), false);
  return {text, owner, sha256: sha256(raw(p))};
}
export function changed(current, original) {const old = new Map(original.files.map(f => [f.path, f])); return current.files.filter(f => old.get(f.path)?.sha256 !== f.sha256 || old.get(f.path)?.size !== f.size).map(f => f.path);}
