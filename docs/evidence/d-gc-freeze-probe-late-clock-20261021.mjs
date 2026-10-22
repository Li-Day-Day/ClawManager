import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),owner=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e');
const rel='backend/internal/systembackupevidence/download_output_deadline_a_test.go',file=path.join(owner,'source',rel);
const native=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-gc-freeze-probe-20261021-r5-native.json'),'utf8'));
assert.equal(native.stages.find(x=>x.stage==='deadline-focused')?.exit,1);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-gc-freeze-probe-20261021-r5-source.json'),'utf8'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),manifest.files.find(x=>x.path===rel).sha256);
let text=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function one(a,b){assert.equal(text.split(a).length,2,'ambiguous late-clock edit');text=text.replace(a,()=>b);}
one('"database/sql"','"database/sql/driver"');
const typeStart=text.indexOf('type aDownloadResultDelayOwners struct {'),typeEnd=text.indexOf('type aDownloadDeadlineStore struct {',typeStart);
assert.ok(typeStart>=0&&typeEnd>typeStart);text=text.slice(0,typeStart)+text.slice(typeEnd);
const methodStart=text.indexOf('func (o aDownloadResultDelayOwners) LockOwnerReferences('),methodEnd=text.indexOf('func TestADownloadNativeBufferedOutputKeepsOriginalDeadline(',methodStart);
assert.ok(methodStart>=0&&methodEnd>methodStart);text=text.slice(0,methodStart)+text.slice(methodEnd);
const setupStart=text.indexOf('\t\t\t\towners := x.h.results.c.Owners'),setupEnd=text.indexOf('\t\t\t\tdone := make(chan struct{})',setupStart);
assert.ok(setupStart>=0&&setupEnd>setupStart);
const setup=`				lateChecks := 0
				query := x.f.db.ownerQuery
				x.f.db.ownerQuery = func(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, bool, error) {
					if q == downloadIntentClockSQL && x.f.db.resultInserts == 1 && x.f.db.record.Claim == "" {
						// All result audit/release writes are staged. Delay the final
						// clock read, then execute its original model handler unchanged.
						// Waiting at the first owner lock consumed the independent
						// result budget before its remaining verification work.
						observedResultContext = ctx
						lateChecks++
						if mode == "result_crosses_deadline" {
							if deadline.IsZero() { t.Error("result did not follow the native write deadline"); return nil, true, ErrAudit }
							timer := time.NewTimer(time.Until(deadline.Add(75 * time.Millisecond)))
							defer timer.Stop()
							select {
							case <-timer.C: waited = true
							case <-ctx.Done(): return nil, true, ctx.Err()
							}
						}
					}
					if query != nil { return query(ctx, q, args) }
					return nil, false, nil
				}
`;
text=text.slice(0,setupStart)+setup+text.slice(setupEnd);
one('// Keep the original download limit shorter than the separate\n\t\t\t\t\t\t// five-second result budget, leaving time for audit/release\n\t\t\t\t\t\t// checks after the deliberate wait. Never extend it after Admit.\n\t\t\t\t\t\tx.f.env.reservationUntil = x.f.db.now.Add(2 * time.Second)', '// Allow the original native admission/provider/write path its\n\t\t\t\t\t\t// four-second budget. Delay only at the final result clock, after\n\t\t\t\t\t\t// audit/release work; never refresh the limit after Admit.\n\t\t\t\t\t\tx.f.env.reservationUntil = x.f.db.now.Add(4 * time.Second)');
one('failures=%d waited=%t", protocol, mode, resultContextErr, x.f.db.resultInserts, x.failures, waited)', 'failures=%d waited=%t late_checks=%d", protocol, mode, resultContextErr, x.f.db.resultInserts, x.failures, waited, lateChecks)');
one('\t\t\t\t// Admission translates the final SQL sample', '\t\t\t\tif lateChecks != 1 { t.Fatal("expected exactly one final result clock after audit/release", lateChecks) }\n\t\t\t\t// Admission translates the final SQL sample');
fs.chmodSync(file,0o666);fs.writeFileSync(file,text);
console.log('DEADLINE_LATE_CLOCK original-reservation=4s result-budget=5s original-query-delegated=yes production-code-changed=no');
