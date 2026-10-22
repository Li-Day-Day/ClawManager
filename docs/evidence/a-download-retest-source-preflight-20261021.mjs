// Read-only fast check, not SQL evidence or a replacement for snapshot gates.
import fs from 'node:fs';
import {loadReviewedOwnerBaseline,decode} from './a-download-owners-actual-review-20261020.mjs';
try {
  const bytes=fs.readFileSync(0),s=JSON.parse(decode(bytes));
  if(!Array.isArray(s.files)||!s.files.length)throw new Error('source_inventory_required');
  const b=loadReviewedOwnerBaseline(bytes).baselineSource;
  const ordinary=m=>m.files.filter(f=>/^(backend|contracts)\//.test(f.path)&&!f.path.endsWith('_mysql_test.go')).map(f=>`${f.path}\0${f.size}\0${f.sha256}`).sort();
  if(JSON.stringify(ordinary(s))!==JSON.stringify(ordinary(b)))throw new Error('ordinary_source_changed_requires_reviewed_baseline');
  console.log(JSON.stringify({status:'ready_for_original_snapshot_gate',reviewed_source_sha256:b.source_sha256,actual_sql:false,tests_started:false,dependencies_installed:false}));
} catch(e) {
  console.log(JSON.stringify({status:'not_ready',code:e.message,actual_sql:false,tests_started:false}));process.exitCode=1;
}
