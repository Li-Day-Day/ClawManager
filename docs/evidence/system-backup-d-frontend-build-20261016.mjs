import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, lstatSync, rmSync, openSync, closeSync, writeSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url)), frontend=resolve(root,'frontend');
const round=process.argv[2]??'r51';assert.match(round,/^r[0-9]+$/);
const prefix=resolve(root,`docs/evidence/system-backup-d-frontend-build-20261016-${round}`);
for(const suffix of ['.json','.txt','-source.json'])assert.equal(existsSync(prefix+suffix),false,'Evidence must be new');
const logFD=openSync(prefix+'.txt','wx');
const log=text=>{writeSync(logFD,text+'\n');console.log(text)};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const owner=join(frontend,'.tmp-d-frontend-build-'+randomUUID().replaceAll('-',''));
const pin=p=>{const b=readFileSync(resolve(root,p));return{path:p.replaceAll('\\','/'),size:b.length,sha256:sha(b)}};
function files(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(e=>{
    const p=join(directory,e.name);assert.equal(lstatSync(p).isSymbolicLink(),false,'Source link not accepted');
    return e.isDirectory()?files(p):[relative(root,p).replaceAll('\\','/')];
  });
}
const sourcePaths=()=>[...files(join(frontend,'src')),...files(join(frontend,'scripts')),
  ...readdirSync(frontend,{withFileTypes:true}).filter(e=>e.isFile()&&!e.name.startsWith('.')&&/\.(json|js|ts|mjs|cjs|html)$/.test(e.name)).map(e=>'frontend/'+e.name)].sort();
const report={kind:'d_frontend_full_build_validation.v1',recorded_at:new Date().toISOString(),status:'incomplete',
  original_build:'tsc -b && vite build',dependencies_installed_by_this_run:false,owner_directory:owner,
  browser_or_real_backend_verified:false,overall_goal_complete:false};
let failure;
try {
  const paths=sourcePaths(),pins=paths.map(pin);
  const sourceSHA=sha(pins.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
  writeFileSync(prefix+'-source.json',JSON.stringify({kind:'d_frontend_build_source_snapshot.v1',files:pins,source_sha256:sourceSHA},null,2)+'\n',{flag:'wx'});
  report.source_manifest=relative(root,prefix+'-source.json');report.source_sha256=sourceSHA;report.source_files=pins.length;
  for(const tool of ['typescript/bin/tsc','vite/bin/vite.js'])assert.ok(existsSync(join(frontend,'node_modules',tool)),'Existing dependency required: '+tool);
  report.versions=Object.fromEntries(['typescript','vite','react','react-dom'].map(name=>[name,JSON.parse(readFileSync(join(frontend,'node_modules',name,'package.json'),'utf8')).version]));
  log('SOURCE files='+pins.length+' sha256='+sourceSHA+' dependency_installation=no');
  log('VERSIONS '+JSON.stringify(report.versions));
  mkdirSync(owner);writeFileSync(join(owner,'owner.txt'),owner,{flag:'wx'});
  for(const name of ['app','node'])writeFileSync(join(owner,name+'.json'),JSON.stringify({extends:join(frontend,'tsconfig.'+name+'.json'),compilerOptions:{tsBuildInfoFile:join(owner,name+'.tsbuildinfo')}}),{flag:'wx'});
  writeFileSync(join(owner,'tsconfig.json'),JSON.stringify({files:[],references:[{path:'./app.json'},{path:'./node.json'}]}),{flag:'wx'});
  const env={...process.env,CI:'1',FORCE_COLOR:'0',JITI_CACHE:'false'};
  function run(stage,args){
    log('STAGE '+stage+' '+JSON.stringify(args));
    const result=spawnSync(process.execPath,args,{cwd:frontend,env,encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024,windowsHide:true});
    if(result.stdout)log(result.stdout.trimEnd());if(result.stderr)log(result.stderr.trimEnd());
    log('EXIT '+stage+'='+result.status+(result.error?' error='+result.error.code:''));
    if(result.error||result.status!==0)throw new Error(stage+' failed');
  }
  run('typescript-build',[join(frontend,'node_modules/typescript/bin/tsc'),'-b',join(owner,'tsconfig.json'),'--pretty','false']);
  report.typescript_build_passed=true;
  for(const name of ['app','node'])assert.ok(existsSync(join(owner,name+'.tsbuildinfo')),'Missing complete reference build result');
  run('vite-production-build',[join(frontend,'node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',join(owner,'dist'),'--emptyOutDir','--clearScreen=false']);
  report.vite_build_passed=true;
  assert.ok(existsSync(join(owner,'dist/index.html')));
  const output=files(join(owner,'dist')).map(pin);
  assert.ok(output.some(p=>p.path.endsWith('.js')));
  report.production_output={files:output.length,total_bytes:output.reduce((n,p)=>n+p.size,0),sha256:sha(output.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n'))};
  assert.deepEqual(sourcePaths(),paths,'Frontend sources changed during build');
  assert.deepEqual(paths.map(pin),pins,'Frontend source bytes changed during build');
  report.source_postcheck_passed=true;
  report.status='full_typescript_and_vite_build_passed';
} catch(error){failure=error;report.error=error.message;report.status='failed';log('FAILED '+error.message)}
finally{
  if(existsSync(owner)){
    assert.equal(dirname(resolve(owner)),frontend);
    assert.match(owner.split(/[/\\]/).at(-1),/^\.tmp-d-frontend-build-[a-f0-9]{32}$/);
    assert.equal(lstatSync(owner).isSymbolicLink(),false);
    assert.equal(readFileSync(join(owner,'owner.txt'),'utf8'),owner);
    rmSync(owner,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
  report.build_artifacts_cleaned=!existsSync(owner);
  log('CLEANED frontend-owned-build='+report.build_artifacts_cleaned);
  log('FINAL '+report.status);
  closeSync(logFD);
  report.raw_log=relative(root,prefix+'.txt');report.raw_log_sha256=sha(readFileSync(prefix+'.txt'));
  writeFileSync(prefix+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
if(failure)process.exitCode=1;
