import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096/source/';
const dir='backend/internal/systembackupbusinessa/';
const change=(p,fn)=>{const s=fs.readFileSync(root+p,'utf8').replaceAll('\r\n','\n'); fs.chmodSync(root+p,0o666); fs.writeFileSync(root+p,fn(s));};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
change(dir+'cost_aggregate.go',s=>s.replace('OR actual_cost<0 OR','OR (actual_cost IS NOT NULL AND actual_cost<0) OR').replace('prompt_tokens<0 OR','prompt_tokens<0 OR prompt_tokens>2147483647 OR').replace('completion_tokens<0 OR','completion_tokens<0 OR completion_tokens>2147483647 OR').replace('total_tokens IS NULL OR','total_tokens IS NULL OR total_tokens>2147483647 OR'));
change(dir+'restore_verify.go',s=>{
 s=s.replace('make([]Check, 0, 13)','make([]Check, 0, 14)');
 s=once(s,'\tfor i, table := range scope.tables {','\tactualCostRows := int64(-1)\n\tfor i, table := range scope.tables {');
 s=once(s,'\t\tcategory := tables[table].category','\t\tif table == "cost_records" { actualCostRows = rows }\n\t\tcategory := tables[table].category');
 s=s.replace('readCostAggregateHash(ctx, tx, snapshotCostRows(want))','readCostAggregateHash(ctx, tx, actualCostRows)');
 return s.replace('expected, actual int64, evidenceRef string','expected, actual any, evidenceRef string');
});
change(dir+'verifier.go',s=>s.replace('make([]Check, 0, 11)','make([]Check, 0, 12)'));
change(dir+'business_restore.go',s=>s.replace('if err != nil { return empty, err }\n\tif costHash', 'if err != nil { return empty, ErrRestoreNormalizationMismatch }\n\tif costHash'));
change(dir+'business_restore_test.go',s=>s.replace('binding.Dump.Snapshot.CostAggregateSHA256, err = costSourceAggregateHash(input.Gateway.CostSources)','costHash, err := costSourceAggregateHash(input.Gateway.CostSources)\n\tbinding.Dump.Snapshot.CostAggregateSHA256 = costHash'));
change(dir+'capture_test.go',s=>{
 s=once(s,'type countState struct {','type countState struct {\n\tcostRows func() driver.Rows\n');
 return once(s,'if query == costAggregateQuery { return fixtureCostSQLRows(tFixtureCount(c.state)), nil }','if query == costAggregateQuery {\n\t\tif c.state.failure == "cost-query" { return nil, errors.New("injected cost query failure") }\n\t\tif c.state.costRows != nil { return c.state.costRows(), nil }\n\t\treturn fixtureCostSQLRows(tFixtureCount(c.state)), nil\n\t}');
});
change(dir+'restore_rows_mysql_test.go',s=>{
 s=s.replace('twenty-four-check','twenty-five-check').replace('\tbinding.Dump.Snapshot.CostAggregateSHA256 = fixtureCostAggregateHash(t, 0)\n','');
 s=once(s,'\tinput.Gateway.CostSources[0].ActualCost = nil','\tinput.Gateway.CostSources[0].ActualCost = nil\n\tbinding.Dump.Snapshot.CostAggregateSHA256, err = costSourceAggregateHash(input.Gateway.CostSources)\n\tif err != nil { t.Fatal(err) }\n\tproof.wantBinding = cloneBusinessRestoreBinding(binding)');
 return s;
});
// Keep the original formatting and unrelated owner registries byte-for-byte.
let schema=fs.readFileSync('contracts/system-backup/v12/verifier-contract.schema.json','utf8').replaceAll('\r\n','\n');
for(const [def,id] of [['AAIGatewayBackupCheck','ai_gateway.cost_aggregates'],['AAIGatewayRestoreCheck','ai_gateway.restore_cost_aggregates']]){
 const from=schema.indexOf('    "'+def+'": {'); const end=schema.indexOf('\n    },',from);
 const part=schema.slice(from,end);
 const marker='\n        ] }';
 const changed=once(part,marker,',\n          { "properties": { "id": { "enum": ["'+id+'"] }, "expected": { "$ref": "#/$defs/ABusinessDigestValue" }, "actual": { "$ref": "#/$defs/ABusinessDigestValue" } } }'+marker);
 schema=schema.slice(0,from)+changed+schema.slice(end);
}
schema=schema.replace('"check_schema": "#/$defs/AAIGatewayBackupCheck", "required_check_count": 11','"check_schema": "#/$defs/AAIGatewayBackupCheck", "required_check_count": 12').replace('"check_schema": "#/$defs/AAIGatewayRestoreCheck", "required_check_count": 13','"check_schema": "#/$defs/AAIGatewayRestoreCheck", "required_check_count": 14');
// Existing failure-mapping keys remain stable; their documented scope grows.
schema=schema.replace('"required_proof": "B-owned capture certificate and dump content proof binding both views to the pinned registry, observed schema and one checkpoint"','"required_proof": "B-owned capture certificate and dump content proof binding both views, including exact cost aggregates, to the pinned registry, observed schema and one checkpoint"');
schema=schema.replace('"B-owned isolated target identity, completed normalization, authenticated expected counts and separate SELECT-only verifier credential with final recheck"','"B-owned isolated target identity, completed normalization, authenticated expected counts and cost aggregates, and separate SELECT-only verifier credential with final recheck"');
JSON.parse(schema); fs.writeFileSync(root+'contracts/system-backup/v12/verifier-contract.schema.json',schema);
const nodePath='scripts/system-backup-contract-artifacts.test.mjs';
change(nodePath,s=>s.replace("'AAIGatewayBackupCheck', 11","'AAIGatewayBackupCheck', 12").replace("'AAIGatewayRestoreCheck', 13","'AAIGatewayRestoreCheck', 14"));
console.log('Completed isolated draft repairs and contract counts');
