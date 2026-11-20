/** Host process for full-host-admission-r0: custody boundary, not in-process.
 *
 * The admission Host runs as its own process. Its Ed25519 private key is read
 * ONLY here, from the operator-controlled file named by ADMISSION_HOST_KEY_FILE
 * (mirroring the R50 DIE_CONTROLLED_HOST_KEY_FILE boot-injection contract, but
 * mandatory — there is no ephemeral fallback in the admission path). The
 * caller/SDK side never receives the key; it speaks newline-delimited JSON
 * over stdio and verifies receipts against the registry-pinned Host identity.
 *
 * Protocol (one request line -> one response line on stdout):
 *   {"op":"ping"} -> {"ok":true,...}
 *   {"op":"admit","request":{...createAdmissionHost.admit shape...}}
 *     -> {"ok":true,"result":{...}} | {"ok":false,"error":"..."}
 *   {"op":"shutdown"} -> {"ok":true} then exit 0
 * Boot failures (bad registry / unpinned host / key mismatch / rolled-back
 * ledger) exit non-zero after printing one JSON diagnostic line; a rolled-back
 * ledger does NOT exit — the Host stays up but denies every admission
 * fail-closed (ADMISSION_LEDGER_ROLLBACK), which is itself test-observable.
 */
import {readFileSync} from 'node:fs';
import {createPrivateKey} from 'node:crypto';
import {createAdmissionHost,loadAdmissionRegistry,
  ADMISSION_REGISTRY_SCHEMA} from './admission-host.mjs';

const args=process.argv.slice(2);
const get=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:undefined};
const registryPath=get('registry'),ledgerDir=get('ledger'),hostId=get('host-id');
const keyFile=process.env.ADMISSION_HOST_KEY_FILE;

function fail(code,message){
  process.stdout.write(JSON.stringify({ok:false,error:message})+'\n');
  process.exit(code);
}
if(!registryPath||!ledgerDir||!hostId||!keyFile)
  fail(2,'usage: admission-host-service.mjs --registry <json> --ledger <dir> --host-id <id> + env ADMISSION_HOST_KEY_FILE');
let registry;
try{
  registry=loadAdmissionRegistry(JSON.parse(readFileSync(registryPath,'utf8')));
}catch(error){fail(3,'ADMISSION_REGISTRY_INVALID: '+error.message)}
if(registry.schema!==ADMISSION_REGISTRY_SCHEMA)fail(3,'ADMISSION_REGISTRY_INVALID');
let host;
try{
  host=createAdmissionHost({registry,hostId,
    hostPrivateKey:createPrivateKey(readFileSync(keyFile)),ledgerDir});
}catch(error){fail(4,error.message)}
if(host.rolledBack())
  process.stderr.write(JSON.stringify({warn:'ADMISSION_LEDGER_ROLLBACK_DENY_ALL'})+'\n');

process.stdout.write(JSON.stringify({ok:true,op:'ready',hostId,
  registryId:host.registryId,rolledBack:host.rolledBack()})+'\n');
let buffer='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  buffer+=chunk;
  let index;
  while((index=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,index);
    buffer=buffer.slice(index+1);
    if(!line.trim())continue;
    let message;
    try{message=JSON.parse(line)}catch{continue}
    try{
      if(message.op==='ping'){
        process.stdout.write(JSON.stringify({ok:true,op:'pong'})+'\n');
      }else if(message.op==='shutdown'){
        // Flush the bye line before exiting: pipe writes are asynchronous.
        process.stdout.write(JSON.stringify({ok:true,op:'bye'})+'\n',
          ()=>process.exit(0));
      }else if(message.op==='admit'){
        const result=host.admit(message.request);
        process.stdout.write(JSON.stringify({ok:true,op:'admit',result})+'\n');
      }else{
        process.stdout.write(JSON.stringify({ok:false,error:'ADMISSION_OP_UNKNOWN'})+'\n');
      }
    }catch(error){
      process.stdout.write(JSON.stringify({ok:false,error:String(error.message)})+'\n');
    }
  }
});
process.stdin.on('end',()=>process.exit(0));
process.on('uncaughtException',error=>{
  process.stdout.write(JSON.stringify({ok:false,
    error:'ADMISSION_SERVICE_UNCAUGHT '+String(error?.message??error)})+'\n',
    ()=>process.exit(1));
});
