import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),owner=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e');
const rel='backend/internal/systembackupevidence/download_output_deadline_a_test.go',file=path.join(owner,'source',rel);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
const mode=process.argv.at(-1);
let text=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function one(a,b){assert.equal(text.split(a).length,2,'ambiguous deadline fixture edit');text=text.replace(a,()=>b);}
if(mode==='diagnostic'){
 const native=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-gc-freeze-probe-20261021-r4-native.json'),'utf8'));
 assert.equal(native.stages.find(x=>x.stage==='full')?.exit,1);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-gc-freeze-probe-20261021-r4-source.json'),'utf8'));
 assert.equal(sha(fs.readFileSync(file)),manifest.files.find(x=>x.path===rel).sha256);
 fs.writeFileSync(path.join(owner,'deadline-before.bytes'),fs.readFileSync(file),{flag:'wx'});
 one('\t\t\t\twaited := false','\t\t\t\twaited := false\n\t\t\t\tvar observedResultContext context.Context');
 one('x.h.results.c.Owners = aDownloadResultDelayOwners{owners, func(ctx context.Context) error {','x.h.results.c.Owners = aDownloadResultDelayOwners{owners, func(ctx context.Context) error {\n\t\t\t\t\tobservedResultContext = ctx');
 one('\t\t\t\t// Admission translates the final SQL sample', '\t\t\t\tvar resultContextErr error\n\t\t\t\tif observedResultContext != nil { resultContextErr = observedResultContext.Err() }\n\t\t\t\tt.Logf("NATIVE_RESULT_BUDGET protocol=%s mode=%s result_context=%v result_rows=%d failures=%d waited=%t", protocol, mode, resultContextErr, x.f.db.resultInserts, x.failures, waited)\n\t\t\t\t// Admission translates the final SQL sample');
}else if(mode==='repair'){
 assert.ok(text.includes('NATIVE_RESULT_BUDGET'));
 one('// Leave one second inside the result transaction\'s separate\n\t\t\t\t\t\t// five-second budget, while allowing the native TLS/provider\n\t\t\t\t\t\t// checks to reach the buffered write on a loaded host.\n\t\t\t\t\t\tx.f.env.reservationUntil = x.f.db.now.Add(4 * time.Second)', '// Keep the original download limit shorter than the separate\n\t\t\t\t\t\t// five-second result budget, leaving time for audit/release\n\t\t\t\t\t\t// checks after the deliberate wait. Never extend it after Admit.\n\t\t\t\t\t\tx.f.env.reservationUntil = x.f.db.now.Add(2 * time.Second)');
}else if(mode==='counterfactual'){
 assert.ok(text.includes('x.f.db.now.Add(4 * time.Second)')&&text.includes('lateChecks'));
 fs.writeFileSync(path.join(owner,'deadline-candidate.bytes'),fs.readFileSync(file),{flag:'wx'});
 one('return http.NewResponseController(w.ResponseWriter).SetWriteDeadline(at)','return http.NewResponseController(w.ResponseWriter).SetWriteDeadline(time.Time{})');
}else if(mode==='restore'){
 const bytes=fs.readFileSync(path.join(owner,'deadline-candidate.bytes'));
 assert.ok(bytes.toString('utf8').includes('SetWriteDeadline(at)'));
 fs.chmodSync(file,0o666);fs.writeFileSync(file,bytes);console.log('DEADLINE_FIXTURE counterfactual restored');process.exit(0);
}else throw Error('unknown fixture mode');
fs.chmodSync(file,0o666);fs.writeFileSync(file,text);console.log('DEADLINE_FIXTURE mode='+mode+' only_test_file_changed=yes production_budget_changed=no');
