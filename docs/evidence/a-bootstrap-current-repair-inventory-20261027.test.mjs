import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCurrentRepairEvents,originalPackages,parityPackages,remainingPackages} from './a-bootstrap-current-repair-inventory-20261027.mjs';
const log=(packages,tests=['TestExisting','TestExisting/child'])=>packages.flatMap(Package=>[
  ...tests.map(Test=>({Action:'run',Package,Test})),...tests.map(Test=>({Action:'pass',Package,Test})),{Action:'pass',Package}
]).map(JSON.stringify).join('\n');
const fixture=()=>({parentText:log(originalPackages),parityFullText:log(parityPackages),currentFullText:log(remainingPackages),
  paritySeedText:log(['clawreef/internal/systembackupevidence'],['TestDBootstrapOriginalMaterialsMySQLSeed']),
  currentSeedsText:log(['clawreef/internal/systembackupevidence'],['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapEntryMySQLSeed'])});
test('current composition preserves every original root and nested event across exact package sets',()=>{
  const result=reviewCurrentRepairEvents(fixture());assert.equal(result.original_test_events_preserved,20);
  assert.equal(result.current_test_events,22);assert.equal(result.current_complete_packages.length,11);
  assert.equal(result.bootstrap_seeds.length,4);assert.equal(result.source_scope_accepted,false);
});
test('a missing old subtest cannot be hidden by unchanged root counts',()=>{
  const value=fixture();value.currentFullText=log(remainingPackages,['TestExisting','TestExisting/new-child']);
  assert.throws(()=>reviewCurrentRepairEvents(value),/Original native test omitted/);
});
test('partial packages, skipped events, missing seed and extra seed are rejected',()=>{
  const partial=fixture();partial.currentFullText=log(remainingPackages.slice(1));
  const skipped=fixture();skipped.parityFullText+='\n'+JSON.stringify({Action:'skip',Package:parityPackages[0],Test:'TestSkipped'});
  const missingSeed=fixture();missingSeed.currentSeedsText=log(['clawreef/internal/systembackupevidence'],['TestDBootstrapConsumerMySQLSeed']);
  const extraSeed=fixture();extraSeed.paritySeedText=log(['clawreef/internal/systembackupevidence'],['TestDBootstrapOriginalMaterialsMySQLSeed','TestExtra']);
  for(const value of [partial,skipped,missingSeed,extraSeed])assert.throws(()=>reviewCurrentRepairEvents(value));
});
