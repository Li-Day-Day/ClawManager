import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNodeSummary} from './a-task-submit-frontend-review-20261027.mjs';
const good='ℹ tests 20\nℹ pass 20\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';
test('Node receipt summary accepts complete success and explicit counterexample failure',()=>{
  assert.equal(reviewNodeSummary(good).pass,20);
  assert.equal(reviewNodeSummary(good.replace('pass 20','pass 9').replace('fail 0','fail 11'),true).fail,11);
});
test('Node receipt summary rejects omitted, duplicate, failed, skipped or inconsistent counts',()=>{
  for(const text of [good.replace('ℹ skipped 0\n',''),good+'ℹ tests 20\n',good.replace('fail 0','fail 1'),
    good.replace('skipped 0','skipped 1'),good.replace('cancelled 0','cancelled 1'),good.replace('todo 0','todo 1'),
    good.replace('tests 20','tests 21'),good.replaceAll('20','0')])assert.throws(()=>reviewNodeSummary(text));
  assert.throws(()=>reviewNodeSummary(good,true));
});
