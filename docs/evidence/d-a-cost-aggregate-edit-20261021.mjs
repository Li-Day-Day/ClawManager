import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='.tmp-d-index-cache-fcbe917bab97480c984627d1268b3d9d/source/';
const dir='backend/internal/systembackupbusinessa/';
const change=(p,fn)=>{const s=fs.readFileSync(root+p,'utf8').replaceAll('\r\n','\n');fs.writeFileSync(root+p,fn(s));};
const replace=(s,from,to)=>{assert.equal(s.split(from).length,2,from);return s.replace(from,to);};
change(dir+'capture.go',s=>{
 s=replace(s,'Tables []TableCount `json:"tables"`','Tables []TableCount `json:"tables"`\n\tCostAggregateSHA256 string `json:"cost_aggregate_sha256"`');
 return replace(s,'\tif err := tx.Commit(); err != nil {','\tsnapshot.CostAggregateSHA256, err = readCostAggregateHash(ctx, tx, snapshotCostRows(snapshot))\n\tif err != nil { return SourceSnapshot{}, err }\n\tif err := tx.Commit(); err != nil {');
});
change(dir+'verifier.go',s=>{
 s=replace(s,'\tvar total int64\n\tfor i, table := range allowlist {','\tif !hashPattern.MatchString(snapshot.CostAggregateSHA256) { return fmt.Errorf("%w: missing cost aggregate", ErrInvalidSnapshot) }\n\tvar total int64\n\tfor i, table := range allowlist {');
 const marker='\tfor _, check := range append(checks.Users, checks.AIGateway...) {';
 return replace(s,marker,'\tchecks.AIGateway = append(checks.AIGateway, compare("ai_gateway.cost_aggregates", "hash", source.Snapshot.CostAggregateSHA256, dump.Snapshot.CostAggregateSHA256, dump.EvidenceRef))\n'+marker);
});
change(dir+'restore_verify.go',s=>{
 s=replace(s,'want := SourceSnapshot{Tables: append([]TableCount(nil), expected.Tables...)}','want := cloneSourceSnapshot(expected)');
 s=replace(s,'proofSnapshot := SourceSnapshot{Tables: append([]TableCount(nil), want.Tables...)}','proofSnapshot := cloneSourceSnapshot(want)');
 s=replace(s,'\tif err := v.Proof.RecheckReadOnlyTarget','\tactualCostHash, err := readCostAggregateHash(ctx, tx, snapshotCostRows(want))\n\tif err != nil { return CategoryChecks{}, err }\n\tappendRestoreCheck(&checks, "ai_gateway", restoreCheck("ai_gateway.restore_cost_aggregates", "hash", want.CostAggregateSHA256, actualCostHash, evidenceRef))\n\tif err := v.Proof.RecheckReadOnlyTarget');
 return s;
});
change(dir+'business_restore.go',s=>{
 const marker='\tif err := proofs.Batch.RecheckBusinessRestoreSources(ctx,';
 s=replace(s,marker,'\tcostHash, err := normalizedCostAggregateHash(rows.Gateway.Costs)\n\tif err != nil { return empty, err }\n\tif costHash != binding.Dump.Snapshot.CostAggregateSHA256 { return empty, ErrRestoreNormalizationMismatch }\n'+marker);
 return replace(s,'binding.Dump.Snapshot.Tables = append([]TableCount(nil), binding.Dump.Snapshot.Tables...)','binding.Dump.Snapshot = cloneSourceSnapshot(binding.Dump.Snapshot)');
});
// Close the existing check registry around two digest-only checks. No currency,
// amount, identifier, or business row enters the public check payload.
change('contracts/system-backup/v12/verifier-contract.schema.json',s=>{
 const doc=JSON.parse(s);
 for(const [def,id] of [['AAIGatewayBackupCheck','ai_gateway.cost_aggregates'],['AAIGatewayRestoreCheck','ai_gateway.restore_cost_aggregates']])doc.$defs[def].allOf[1].oneOf.push({properties:{id:{enum:[id]},expected:{$ref:'#/$defs/ABusinessDigestValue'},actual:{$ref:'#/$defs/ABusinessDigestValue'}}});
 return JSON.stringify(doc,null,2)+'\n';
});
// Preserve existing fixtures, adding complete synthetic aggregate metadata.
for(const f of ['verifier_test.go','restore_verify_test.go'])change(dir+f,s=>{
 s=replace(s,'snapshot := SourceSnapshot{Tables:', 'snapshot := SourceSnapshot{CostAggregateSHA256: fixtureCostAggregateHash(t, 2), Tables:');
 return s.replaceAll('len(checks.AIGateway) != 11','len(checks.AIGateway) != 12').replaceAll('len(checks.AIGateway) != 13','len(checks.AIGateway) != 14').replaceAll('len(state.queries) != 39','len(state.queries) != 40').replaceAll('len(metadata.Checks.AIGateway) != 11','len(metadata.Checks.AIGateway) != 12');
});
change(dir+'capture_test.go',s=>{
 s=replace(s,'\tfor table := range tables {','\tif query == costAggregateQuery { return fixtureCostSQLRows(tFixtureCount(c.state)), nil }\n\tfor table := range tables {');
 return s.replaceAll('len(state.queries) != 30','len(state.queries) != 31');
});
change(dir+'d_review_commit_context_test.go',s=>s.replace('queries := 30','queries := 31').replace('queries = 39','queries = 40').replace('len(checks.AIGateway) != 13','len(checks.AIGateway) != 14'));
change(dir+'business_restore_test.go',s=>{
 s=replace(s,'\tproof := &businessRestoreProofFixture{','\tbinding.Dump.Snapshot.CostAggregateSHA256, err = costSourceAggregateHash(input.Gateway.CostSources)\n\tif err != nil { t.Fatal(err) }\n\tproof := &businessRestoreProofFixture{');
 return replace(s,'\tinput := BusinessRestoreInput{}','\tinput := BusinessRestoreInput{}\n\tbinding.Dump.Snapshot.CostAggregateSHA256 = fixtureCostAggregateHash(t, 0)');
});
change(dir+'restore_rows_mysql_test.go',s=>{
 s=s.replaceAll('SourceSnapshot{Tables: append([]TableCount(nil), binding.Dump.Snapshot.Tables...)}','cloneSourceSnapshot(binding.Dump.Snapshot)');
 s=s.replaceAll('len(checks.AIGateway) != 13','len(checks.AIGateway) != 14');
 return replace(s,'\treadProof.counts = cloneSourceSnapshot(binding.Dump.Snapshot)','\tbinding.Dump.Snapshot.CostAggregateSHA256 = fixtureCostAggregateHash(t, 0)\n\treadProof.counts = cloneSourceSnapshot(binding.Dump.Snapshot)');
});
console.log('Edited isolated production, check schema and fixtures only');
