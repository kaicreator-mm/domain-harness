import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [protectedPath, scratchPath] = process.argv.slice(2);
const capture=(op)=>{try {return {ok:true,value:op()}} catch(error){return {ok:false,code:error?.code||'UNKNOWN',name:error?.name||'Error'}}};
const out={
  protectedWrite:capture(()=>{writeFileSync(protectedPath,'OVERWRITTEN');return 'wrote'}),
  protectedRead:capture(()=>readFileSync(protectedPath,'utf8')),
  scratchWrite:capture(()=>{writeFileSync(scratchPath,'SCRATCH_OK');return 'wrote'}),
  spawn:capture(()=>{const x=spawnSync(process.execPath,['--version'],{encoding:'utf8'});if(x.error)throw x.error;return x.status}),
};
console.log(JSON.stringify(out));
