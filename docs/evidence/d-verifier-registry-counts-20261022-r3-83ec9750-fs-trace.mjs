import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
const root=path.resolve(process.env.D_CONTROL_TRACE_ROOT),out=process.env.D_CONTROL_TRACE_OUTPUT;
const read=fs.readFileSync.bind(fs),exists=fs.existsSync.bind(fs),append=fs.appendFileSync.bind(fs);
function relative(file){if(typeof file==='number')throw Error('Unscoped descriptor read');const p=path.resolve(file instanceof URL?fileURLToPath(file):Buffer.isBuffer(file)?file.toString():file);const r=path.relative(root,p).split(path.sep).join('/');return r==='..'||r.startsWith('../')||path.isAbsolute(r)?null:r||'.';}
function record(v){append(out,JSON.stringify(v)+'\n');}
fs.readFileSync=function(file,...args){const r=relative(file);let v;try{v=read(file,...args);}catch(e){if(r!==null)record({op:'read',path:r,exists:false,error:e.code});throw e;}if(r!==null){const b=Buffer.isBuffer(v)?v:Buffer.from(v,'utf8');record({op:'read',path:r,exists:true,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}return v;};
fs.existsSync=function(file){const v=exists(file),r=relative(file);if(r!==null)record({op:'exists',path:r,exists:v});return v;};
syncBuiltinESMExports();
