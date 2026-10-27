import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Treat historical tool inputs strictly as patch data. Never execute their code.
// --stage writes only the exact private candidate owner. Run gofmt on its four
// .go files, then --write verifies all 1741 parent pins before preserving .txt
// sources and a report. Remove that exact staging owner after verification.
const root=fs.realpathSync('.');
const parentPath='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json';
const parent=JSON.parse(fs.readFileSync(parentPath,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const staging=path.join(root,'.tmp-d2-entry-recovery-093d8d2c76784d4a8fb1f9349bbafc3d');
const stage=process.argv.includes('--stage');
if(stage){fs.mkdirSync(staging);fs.writeFileSync(path.join(staging,'owner.json'),JSON.stringify({kind:'d2_entry_parent_recovery_staging.v1',root}),{flag:'wx'});}
else if(JSON.parse(fs.readFileSync(path.join(staging,'owner.json'),'utf8')).root!==root)throw Error('Wrong recovery owner');
const sessions='C:/Users/zhanghui08/.codex/sessions/2026/10/26/';
const plans=[
  ['backend/cmd/server/main.go','rollout-2026-10-26T16-43-48-01a17761-41b6-75b1-94ff-27dc6e1839e0.jsonl',[138,509]],
  ['backend/cmd/server/system_backup_read_live.go','rollout-2026-10-26T16-43-48-01a17761-41b6-75b1-94ff-27dc6e1839e0.jsonl',[138]],
  ['backend/internal/systembackupsecurity/read_scope.go','rollout-2026-10-26T16-42-28-01a17760-0338-7f51-8334-21abfe091be1.jsonl',[129]],
  ['backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go','rollout-2026-10-26T10-42-35-01a17616-6c55-7870-a876-6ad8d729e5c6.jsonl',[3129,3146]],
];
function tokens(s){
  const re=/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|`[^`]*`|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[^\s]/g;
  return [...s.matchAll(re)].map(m=>({v:m[0],start:m.index,end:m.index+m[0].length}));
}
function reverseHunk(source,lines){
  const oldText=lines.filter(l=>l[0]===' '||l[0]==='-').map(l=>l.slice(1)).join('\n');
  const newText=lines.filter(l=>l[0]===' '||l[0]==='+').map(l=>l.slice(1)).join('\n');
  const hay=tokens(source),needle=tokens(newText);if(!needle.length)throw Error('Empty reverse match');
  const matches=[];
  for(let i=0;i<=hay.length-needle.length;i++)if(needle.every((t,j)=>t.v===hay[i+j].v))matches.push(i);
  if(matches.length!==1)throw Error(`Reverse hunk must match uniquely, got ${matches.length}: ${newText.slice(0,100)}`);
  const i=matches[0];return source.slice(0,hay[i].start)+oldText+source.slice(hay[i+needle.length-1].end);
}
const recovered=[];
for(const [file,sessionName,lineNumbers] of plans){
  const original=parent.files.find(x=>x.path===file);if(!original)throw Error('Unmanifested source');
  const live=fs.readFileSync(file);let candidate=live.toString('utf8');const records=fs.readFileSync(sessions+sessionName,'utf8').split(/\r?\n/);const used=[];
  for(const lineNumber of [...lineNumbers].reverse()){
    const row=JSON.parse(records[lineNumber-1]),input=row.payload?.input;if(typeof input!=='string')throw Error('Missing exact patch record');
    const selected=[];
    for(const m of input.matchAll(/tools\.apply_patch\(\s*("(?:[^"\\]|\\[\s\S])*")\s*\)/g)){
      const patch=JSON.parse(m[1]);
      for(const section of patch.split(/(?=^\*\*\* (?:Update|Add|Delete) File: )/m)){
        const header=section.split('\n')[0].replaceAll('\\','/');
        if(header!==`*** Update File: ${root.replaceAll('\\','/')}/${file}`)continue;
        const hunks=section.split(/^@@[^\n]*\n/gm).slice(1).map(h=>h.split('\n').filter(l=>/^[ +\-]/.test(l)&&!l.startsWith('***')));
        for(const hunk of hunks.reverse())candidate=reverseHunk(candidate,hunk);
        selected.push(sha(Buffer.from(patch)));
      }
    }
    if(selected.length!==1)throw Error('Expected exactly one original file section');
    used.push({session:sessionName,line:lineNumber,patch_sha256:selected[0]});
  }
  const candidatePath=path.join(staging,`${file.replaceAll('/','__')}.go`);
  if(stage)fs.writeFileSync(candidatePath,candidate,{flag:'wx'});
  const result=stage?Buffer.from(candidate):fs.readFileSync(candidatePath);
  if(!stage&&(result.length!==original.size||sha(result)!==original.sha256))throw Error(`Recovered bytes do not match frozen parent: ${file}; got ${result.length}/${sha(result)}`);
  recovered.push({path:file,size:result.length,sha256:sha(result),live_size:live.length,live_sha256:sha(live),patches:used,bytes:result});
}
const all=parent.files.map(f=>{
  const replacement=recovered.find(r=>r.path===f.path);const b=replacement?.bytes??fs.readFileSync(f.path);
  if((!stage||!replacement)&&(b.length!==f.size||sha(b)!==f.sha256))throw Error(`Unrecovered parent input: ${f.path}`);
  return f;
});
const report={kind:'d2_entry_parent_source_recovery.v1',status:'all_frozen_parent_input_bytes_recoverable',parent_receipt:parentPath,parent_receipt_sha256:sha(fs.readFileSync(parentPath)),parent_status:parent.status,parent_input_count:all.length,unchanged_live_inputs:all.length-recovered.length,recovered:recovered.map(({bytes,...r})=>({...r,artifact:`docs/evidence/d2-entry-parent-recovery-20261027/${r.path.replaceAll('/','__')}.txt`})),live_source_modified:false,go_tests_started:false,linux_builds_started:false,dependencies_installed:false,parent_postcheck_retroactively_claimed:false,native_acceptance:false};
if(stage){console.log(JSON.stringify({status:'candidates_staged_unverified',owner:staging,files:recovered.length}));process.exit(0);}
if(process.argv.includes('--write')){
  const dir=path.join(root,'docs/evidence/d2-entry-parent-recovery-20261027');fs.mkdirSync(dir,{recursive:false});
  for(const r of recovered)fs.writeFileSync(path.join(dir,`${r.path.replaceAll('/','__')}.txt`),r.bytes,{flag:'wx'});
  fs.writeFileSync('docs/evidence/d2-entry-parent-recovery-20261027.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify(report,null,2));
