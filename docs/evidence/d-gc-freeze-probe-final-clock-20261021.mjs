import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),owner=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e');
const rel='backend/internal/systembackupevidence/download_output_deadline_a_test.go',file=path.join(owner,'source',rel);
const native=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-gc-freeze-probe-20261021-r6-native.json'),'utf8'));
assert.equal(native.stages.find(x=>x.stage==='deadline-focused')?.exit,1);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-gc-freeze-probe-20261021-r6-source.json'),'utf8'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),manifest.files.find(x=>x.path===rel).sha256);
let text=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const before='if q == downloadIntentClockSQL && x.f.db.resultInserts == 1 && x.f.db.record.Claim == "" {';
assert.equal(text.split(before).length,2);
text=text.replace(before,()=>`// QueryContext records the current query before this interceptor.
					// The last group audit read immediately precedes the final
					// clock; earlier config clocks do not meet this boundary.
					if q == downloadIntentClockSQL && x.f.db.resultInserts == 1 && x.f.db.record.Claim == "" && len(x.f.db.queries) >= 2 && x.f.db.queries[len(x.f.db.queries)-2] == downloadRetentionAuditSQL {`);
fs.chmodSync(file,0o666);fs.writeFileSync(file,text);
console.log('DEADLINE_FINAL_CLOCK chosen by actual preceding audit query; original limits and delegated query retained');
