import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const admission=fs.readFileSync('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json','utf8');
if(sha(admission)!=='d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0')throw Error('Original admission capsule changed; review the new scope separately');
const ddl=fs.readFileSync('contracts/system-backup/v12/producer-authority-candidate.sql','utf8').replaceAll('\r\n','\n');
const vectors=JSON.parse(fs.readFileSync('contracts/system-backup/v12/producer-authority-vectors.json','utf8'));
const records={};
for(const name of ['DomainRecord','GrantRecord','HistoricalBindingRecord','ReceiptRecord']){
  const matches=vectors.records.filter(r=>r.definition===name);
  if(matches.length!==1)throw Error('Ambiguous producer record '+name);
  records[name]=matches[0].value;
}
const capability=JSON.parse(fs.readFileSync('contracts/system-backup/v12/a-owned-redacted-examples.json','utf8')).capability_evidence;
if(!capability||typeof capability!=='object')throw Error('Exact A capability example is unavailable');
const input={kind:'d_download_producer_probe_inputs.v2',admission_inputs:admission,admission_sha256:sha(admission),producer_ddl:ddl,producer_ddl_sha256:sha(ddl),records,capability_evidence:capability};
const output='backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json';
const raw=JSON.stringify(input,null,2)+'\n';
if(process.argv.includes('--refresh'))fs.writeFileSync(output,raw);
else if(fs.readFileSync(output,'utf8')!==raw)throw Error('Producer download capsule differs from its original admission, C1 DDL or record vectors');
console.log(JSON.stringify({output,sha256:sha(raw),bytes:Buffer.byteLength(raw),admission_sha256:input.admission_sha256,producer_ddl_sha256:input.producer_ddl_sha256,records:Object.keys(records),sql_executed:false}));
