import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validateGCStages,validateCurrentSupplementInventory,gcSeedRoots,gcSeedPattern} from './d2-owner-current-supplement-inventory-20261027.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pkg='clawreef/internal/systembackupevidence';
function fixture(names=gcSeedRoots) {
  const rows=[{Action:'start',Package:pkg}];
  for(const Test of names)rows.push({Action:'run',Package:pkg,Test},{Action:'pass',Package:pkg,Test,Elapsed:0.001});
  rows.push({Action:'pass',Package:pkg,Elapsed:0.01});
  const logs={'seeds.log':Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),'compile.log':Buffer.alloc(0)};
  const binary=Buffer.alloc(192);Buffer.from('7f454c46020101','hex').copy(binary);binary.writeUInt16LE(2,16);binary.writeUInt16LE(62,18);binary.writeUInt32LE(1,20);
  binary.writeBigUInt64LE(0x400080n,24);binary.writeBigUInt64LE(64n,32);binary.writeUInt16LE(64,52);binary.writeUInt16LE(56,54);binary.writeUInt16LE(1,56);
  binary.writeUInt32LE(1,64);binary.writeUInt32LE(5,68);binary.writeBigUInt64LE(0x400000n,80);binary.writeBigUInt64LE(192n,96);binary.writeBigUInt64LE(192n,104);
  const evidenceBinary='/private/binary/current-evidence.test';
  const steps=[{platform:'windows',exit_code:0,log:'seeds.log',sha256:sha(logs['seeds.log']),command:['go','test','-json','-tags','systembackup_mysql','-run',gcSeedPattern,'-count=1','-timeout=2700s','./internal/systembackupevidence']},
    {platform:'linux',exit_code:0,log:'compile.log',sha256:sha(logs['compile.log']),command:['go','test','-vet=off','-c','-tags','systembackup_mysql','-o',evidenceBinary,'./internal/systembackupevidence'],binary:evidenceBinary,binary_sha256:sha(binary)}];
  return {steps,logs,binary,evidenceBinary,read:n=>logs[n],readBinary:n=>{assert.equal(n,evidenceBinary);return binary;}};
}
test('synthetic inventory only: three local roots and retained ELF',()=>assert.deepEqual(validateGCStages(fixture()).gc_seed_names,gcSeedRoots));
test('missing seed rejected',()=>assert.throws(()=>validateGCStages(fixture(gcSeedRoots.slice(1)))));
test('actual SQL root in seed stream rejected',()=>assert.throws(()=>validateGCStages(fixture([...gcSeedRoots,'TestDDownloadGCFullLifecycleMySQL']))));
for(const [name,mutate] of [
  ['zero tests',f=>{f.logs['seeds.log']=Buffer.from(JSON.stringify({Action:'pass',Package:pkg})+'\n');f.steps[0].sha256=sha(f.logs['seeds.log']);}],
  ['broader run pattern',f=>{f.steps[0].command[6]='.*';}],
  ['non-single test invocation',f=>{f.steps[0].command[7]='-count=2';}],
  ['wrong compile target',f=>{f.steps[1].command[f.steps[1].command.length-1]='./cmd/server';}],
  ['wrong platform',f=>{f.steps[1].platform='windows';}],
  ['compile failed',f=>{f.steps[1].exit_code=1;}],
  ['binary absent',f=>{f.readBinary=()=>Buffer.alloc(0);}],
  ['non ELF',f=>{f.binary[0]=0;f.steps[1].binary_sha256=sha(f.binary);}],
  ['wrong architecture',f=>{f.binary.writeUInt16LE(183,18);f.steps[1].binary_sha256=sha(f.binary);}],
  ['truncated ELF segment',f=>{f.binary.writeBigUInt64LE(9999n,96);f.steps[1].binary_sha256=sha(f.binary);}],
  ['non executable entry',f=>{f.binary.writeUInt32LE(4,68);f.steps[1].binary_sha256=sha(f.binary);}],
  ['binary changed',f=>{f.binary[63]=1;}],
  ['log changed',f=>{f.logs['seeds.log']=Buffer.from('replaced');}],
])test(`${name} rejected`,()=>{const f=fixture();mutate(f);assert.throws(()=>validateGCStages(f));});
test('fifteen stage wrapper refuses fourteen',()=>assert.throws(()=>validateCurrentSupplementInventory({...fixture(),steps:Array(14).fill({})})));
