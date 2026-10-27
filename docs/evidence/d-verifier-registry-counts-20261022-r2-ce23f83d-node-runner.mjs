import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.D_CONTROL_TRACE_ROOT);
for(const name of process.argv.slice(2)){if(!/^scripts\/[a-z0-9.-]+\.test\.mjs$/.test(name))throw Error('Unsupported test input');await import(pathToFileURL(path.join(root,name)).href);}
