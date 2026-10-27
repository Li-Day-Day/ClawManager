import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewGoEvents} from './a-bootstrap-entry-phase-review-20261027.mjs';
const rows=()=>[{Action:'run',Package:'p',Test:'TestOne'},{Action:'pass',Package:'p',Test:'TestOne'},{Action:'pass',Package:'p'}];
const log=r=>r.map(JSON.stringify).join('\n');
test('actual run and pass inventory closes',()=>assert.equal(reviewGoEvents(log(rows()),['p'],['TestOne']).roots,1));
test('test pass without run rejected',()=>assert.throws(()=>reviewGoEvents(log(rows().slice(1)),['p'])));
test('unterminated run rejected',()=>assert.throws(()=>reviewGoEvents(log(rows().filter(r=>r.Test!=='TestOne'||r.Action==='run')),['p'])));
test('duplicate pass, skip or foreign package rejected',()=>{
  for(const row of [{Action:'pass',Package:'p',Test:'TestOne'},{Action:'skip',Package:'p',Test:'TestTwo'},{Action:'pass',Package:'foreign'}])
    assert.throws(()=>reviewGoEvents(log([...rows(),row]),['p']));
});
test('missing root and missing package rejected',()=>{
  assert.throws(()=>reviewGoEvents(log(rows()),['p'],['TestAbsent']));
  assert.throws(()=>reviewGoEvents(log(rows()),['p','q']));
});
test('zero tests and mixed diagnostic output rejected',()=>{
  assert.throws(()=>reviewGoEvents(log([{Action:'pass',Package:'p'}]),['p']));
  assert.throws(()=>reviewGoEvents(log(rows())+'\ncompiler error',['p']));
});
