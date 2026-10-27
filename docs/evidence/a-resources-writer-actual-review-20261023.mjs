import fs from 'node:fs';
import path from 'node:path';
import {reviewWriter} from './a-resources-writer-fk-actual-review-20261023.mjs';
try {
 const args=process.argv.slice(2),file=args.shift();if(!file)throw Error('explicit receipt required');let transcript,out;
 while(args.length){const k=args.shift(),v=args.shift();if(!v)throw Error('missing argument');if(k==='--transcript'&&transcript===undefined)transcript=v;else if(k==='--out'&&out===undefined)out=v;else throw Error('invalid argument');}
 const result=reviewWriter(file,transcript);
 if(out){const dest=path.resolve(out),dir=path.resolve(import.meta.dirname);if(!dest.startsWith(dir+path.sep))throw Error('output must be in docs/evidence');fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
 console.log(JSON.stringify(result,null,2));
} catch(e){console.error('A_WRITER_ACTUAL_REJECTED: '+e.message);process.exitCode=1;}
