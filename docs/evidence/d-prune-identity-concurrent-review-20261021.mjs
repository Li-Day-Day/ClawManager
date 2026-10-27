import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const owner=path.join(root,'.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61/source');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const frozen=json('docs/evidence/d-prune-identity-20261021-r1-controller-source.json'),published=json('docs/evidence/d-prune-identity-published-context-20261021.json');
const changed=frozen.files.filter(p=>p.sha256!==published.files.find(q=>q.path===p.path)?.sha256).map(p=>p.path).sort();
const task='backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go',role='backend/internal/systembackupevidence/download_gc_role_a_mysql_test.go';
assert.deepEqual(changed,[role,task].sort());
// Locate only known top-level test functions. Count braces while ignoring Go
// quoted/raw strings and comments, so embedded SQL is never treated as code.
function span(s,name){
 const re=new RegExp('^func '+name+'\\(t \\*testing\\.T\\) \\{','m'),m=re.exec(s);assert.ok(m,name);
 const open=m.index+m[0].length-1;let depth=1,state='normal';
 for(let i=open+1;i<s.length;i++){
  const c=s[i],n=s[i+1];
  if(state==='line'){if(c==='\n')state='normal';continue;}
  if(state==='block'){if(c==='*'&&n==='/'){state='normal';i++;}continue;}
  if(state==='raw'){if(c==='`')state='normal';continue;}
  if(state==='string'||state==='rune'){if(c==='\\'){i++;continue;}if(c===(state==='string'?'"':"'"))state='normal';continue;}
  if(c==='/'&&n==='/'){state='line';i++;continue;}if(c==='/'&&n==='*'){state='block';i++;continue;}
  if(c==='`'){state='raw';continue;}if(c==='"'){state='string';continue;}if(c==="'"){state='rune';continue;}
  if(c==='{')depth++;if(c==='}')depth--;
  if(c==='}'&&depth===0)return [m.index,i+1];
 }
 throw Error('unclosed function '+name);
}
const remove=(s,name)=>{const [a,b]=span(s,name);return s.slice(0,a)+s.slice(b);};
const allowed=new Map([[task,['TestASQLTaskDownloadOwnersMySQL']],[role,['TestADownloadGCRoleMySQLSeed','TestADownloadGCRoleMySQL']]]);
const records=[];
for(const [p,names]of allowed){
 const old=fs.readFileSync(path.join(owner,p)),current=fs.readFileSync(path.join(root,p));
 assert.equal(sha(old),frozen.files.find(q=>q.path===p).sha256);assert.equal(sha(current),published.files.find(q=>q.path===p).sha256);
 let a=old.toString('utf8').replaceAll('\r\n','\n'),b=current.toString('utf8').replaceAll('\r\n','\n');
 assert.ok(a.startsWith('//go:build systembackup_mysql\n'));assert.ok(b.startsWith('//go:build systembackup_mysql\n'));
 for(const name of names){a=remove(a,name);b=remove(b,name);}
 if(p===role){const addition='// This table is created by the formal capsule in every isolated role database.\n// The role fixture does not create the MFA owner\'s separate synthetic table.\nconst aGCRoleMetadataDriftSQL = "ALTER TABLE system_backup_configs ADD COLUMN gc_role_probe INT NULL"\n\n';assert.equal(b.split(addition).length,2);b=b.replace(addition,'');}
 assert.equal(b,a,'Unexpected shared helper/import/init change: '+p);
 records.push({path:p,frozen_sha256:sha(old),published_sha256:sha(current),changed_test_roots:names,shared_helpers_imports_and_initializers_unchanged:true});
}
const gc='backend/internal/systembackupevidence/download_gc_task_mysql_test.go',gcText=fs.readFileSync(path.join(root,gc),'utf8');
assert.equal(sha(Buffer.from(gcText)),frozen.files.find(q=>q.path===gc).sha256);
for(const names of allowed.values())for(const name of names)assert.ok(!gcText.includes(name));
assert.ok(!gcText.includes('aGCRoleMetadataDriftSQL'));
const output='docs/evidence/d-prune-identity-concurrent-review-20261021.json';
const report={kind:'d_prune_identity_concurrent_tagged_test_scope_assessment',frozen_source_sha256:frozen.source_sha256,published_source_sha256:published.source_sha256,changes:records,selected_gc_root_and_shared_task_seeds_unchanged:true,ordinary_go_sources_unchanged:true,A_test_roots_not_executed_by_D:true,A_changes_not_accepted_as_actual_MySQL_proof:true,dependencies_installed:false,remote:false};
fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('PASS concurrent changes: other A test roots and one role-only constant; selected GC root/shared helpers unchanged; no broader acceptance');
