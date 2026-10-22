import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateVerifierCheckRegistries} from './system-backup-contract-check.mjs';

const original=JSON.parse(readFileSync(new URL('../contracts/system-backup/v12/verifier-contract.schema.json',import.meta.url)));
for(const [name,change] of [
  ['outer not',d=>d.not={}],
  ['outer anyOf',d=>d.anyOf=[false]],
  ['outer ref',d=>d.$ref='#/$defs/Check'],
  ['mixed common ref',d=>d.allOf[0].not={}],
  ['extra common ref type',d=>d.allOf[0].type='null'],
  ['unhandled branch property',d=>d.allOf[1].properties.status={not:{}}],
  ['nonobject properties',d=>d.allOf[1].properties=Object.assign([],d.allOf[1].properties)],
])test('finite verifier dialect rejects '+name,()=>{
  const schema=structuredClone(original);change(schema.$defs.ControlExclusionCheck);
  assert.throws(()=>validateVerifierCheckRegistries(schema),/verifier registry D\.control_plane_restore_validate/);
});

test('supported annotations preserve all six A/D declarations without mutation',()=>{
  const schema=structuredClone(original),definition=schema.$defs.ControlExclusionCheck;
  definition.title='Control checks';definition.description='Public count annotation';definition.$comment='No validation change';
  const before=JSON.stringify(schema);
  assert.equal(validateVerifierCheckRegistries(schema).length,6);assert.equal(JSON.stringify(schema),before);
});
