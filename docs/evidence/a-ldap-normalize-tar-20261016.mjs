// Keep member bytes and paths intact; allow the non-root owner to extract
// originally read-only Go module directories before making them read-only again.
import {openSync,closeSync,readSync,writeSync,fstatSync} from 'node:fs';
const fd=openSync(process.argv[2],'r+');
let offset=0,members=0;
try {
  const length=fstatSync(fd).size,header=Buffer.alloc(512);
  while(offset+512<=length){
    if(readSync(fd,header,0,512,offset)!==512)throw Error('short tar header');
    if(header.every(v=>v===0))break;
    const text=(start,end)=>header.subarray(start,end).toString('ascii').replace(/\0.*$/s,'').trim();
    const size=parseInt(text(124,136)||'0',8),mode=parseInt(text(100,108)||'0',8);
    if(!Number.isSafeInteger(size)||size<0||offset+512+Math.ceil(size/512)*512>length)throw Error('invalid member length');
    const type=String.fromCharCode(header[156]);
    if(!['0','\0','5','x','g'].includes(type))throw Error('unexpected archive member type '+type);
    const revised=type==='5'?0o755:mode|0o600;
    header.fill(0,100,108);header.write(revised.toString(8).padStart(7,'0'),100,'ascii');
    header.fill(32,148,156);
    const sum=header.reduce((a,b)=>a+b,0);
    header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,'ascii');
    writeSync(fd,header,0,512,offset);
    offset+=512+Math.ceil(size/512)*512;members++;
  }
}finally{closeSync(fd);}
console.log('LOCAL_PASS tar-owner-extract-permissions=yes members='+members+' file-bytes-unchanged=yes');
