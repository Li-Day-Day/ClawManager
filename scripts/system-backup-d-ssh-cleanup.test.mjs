import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const bash=process.env.BASH_EXECUTABLE || (process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash');
const wrapper=readFileSync(join(root,'scripts/system-backup-d-invariants.ps1'),'utf8');
const template=wrapper.match(/\$cleanup=Invoke-ProbeSshCommand "([^"\r\n]+)"/)[1];

test('remote scratch shell removes only an owned directory and confirms absence',()=>{
  const scratch=mkdtempSync(join(root,'.tmp-d-ssh-shell-'));
  try {
    const id='a'.repeat(32);
    const marker=`D_PROBE_SCRATCH_CLEAN_${id}`;
    const posix=scratch.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase());
    for(const mode of ['absent','owned','foreign-owner','missing-owner','extra-owner-line','file']){
      const local=join(scratch,mode);
      if(mode==='file')writeFileSync(local,'foreign file');
      else if(mode!=='absent'){
        mkdirSync(local);
        writeFileSync(join(local,'payload'),'fixture');
        if(mode!=='missing-owner')writeFileSync(join(local,'.owner'),mode==='foreign-owner'?'other\n':id+'\n'+(mode==='extra-owner-line'?'extra\n':''));
      }
      const remote=posix+'/'+mode;
      // Both the target and hardcoded random-path guard are confined to this fixture.
      const command=template.replaceAll('/tmp/clawmanager-d-invariants-$probeID',remote)
        .replaceAll('$probeRemote',remote).replaceAll('$probeID',id).replaceAll('$cleanedMarker',marker);
      assert.equal(command.includes('/tmp/clawmanager'),false);
      const result=spawnSync(bash,['-c',command],{encoding:'utf8',windowsHide:true});
      if(result.error)throw result.error;
      const clean=mode==='absent'||mode==='owned';
      if(clean){assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),marker);assert.equal(existsSync(local),false);}
      else {assert.notEqual(result.status,0);assert.equal(result.stdout.includes(marker),false);assert.equal(existsSync(local),true);}
    }
  } finally {
    assert.ok(resolve(scratch).startsWith(resolve(root)+sep));
    assert.ok(scratch.includes('.tmp-d-ssh-shell-'));
    rmSync(scratch,{recursive:true,force:true});
  }
});

test('scratch creation can resume only the same owner without overwriting existing state',()=>{
  const createTemplate=wrapper.match(/\$createCommand="([^"\r\n]+)"/)[1];
  const scratch=mkdtempSync(join(root,'.tmp-d-ssh-shell-'));
  try {
    const id='b'.repeat(32);
    const marker=`D_PROBE_SCRATCH_READY_${id}`;
    const posix=scratch.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase());
    for(const mode of ['absent','owned','foreign-owner','missing-owner','extra-owner-line','file']){
      const local=join(scratch,mode);
      const owner=mode==='foreign-owner'?'other\n':id+'\n'+(mode==='extra-owner-line'?'extra\n':'');
      if(mode==='file')writeFileSync(local,'foreign file');
      else if(mode!=='absent'){
        mkdirSync(local);
        writeFileSync(join(local,'payload'),'fixture');
        if(mode!=='missing-owner')writeFileSync(join(local,'.owner'),owner);
      }
      const remote=posix+'/'+mode;
      const command=createTemplate.replaceAll('/tmp/clawmanager-d-invariants-$probeID',remote)
        .replaceAll('$probeRemote',remote).replaceAll('$probeID',id).replaceAll('$createdMarker',marker);
      assert.equal(command.includes('/tmp/clawmanager'),false);
      // A lost acknowledgement must be safe to repeat with the same command.
      for(let attempt=0;attempt<2;attempt++){
        const result=spawnSync(bash,['-c',command],{encoding:'utf8',windowsHide:true});
        if(result.error)throw result.error;
        if(mode==='absent'||mode==='owned'){
          assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),marker);
          assert.equal(readFileSync(join(local,'.owner'),'utf8'),id+'\n');
        } else {
          assert.equal(result.status,73,result.stderr);assert.equal(result.stdout.includes(marker),false);
          if(mode==='file')assert.equal(readFileSync(local,'utf8'),'foreign file');
          else if(mode==='missing-owner')assert.equal(existsSync(join(local,'.owner')),false);
          else assert.equal(readFileSync(join(local,'.owner'),'utf8'),owner);
        }
        if(mode!=='absent'&&mode!=='file')assert.equal(readFileSync(join(local,'payload'),'utf8'),'fixture');
      }
    }
  } finally {
    assert.ok(resolve(scratch).startsWith(resolve(root)+sep));
    assert.ok(scratch.includes('.tmp-d-ssh-shell-'));
    rmSync(scratch,{recursive:true,force:true});
  }
});
