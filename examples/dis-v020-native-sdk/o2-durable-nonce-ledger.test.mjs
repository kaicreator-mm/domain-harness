import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,chmodSync,symlinkSync,statSync,readdirSync,openSync,closeSync,fsyncSync,existsSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createO2DurableNonceLedger} from './o2-durable-nonce-ledger.mjs';
const PIN='a'.repeat(64),SCOPE='tenant:one';
const fixture=async fn=>{
 const base=mkdtempSync(join(tmpdir(),'dis-o2-nonce-')),root=join(base,'trusted');
 try{
  // The Host, never the ledger constructor, pre-provisions the private root.
  mkdirSync(root,{mode:0o700});
  const fd=openSync(base,constants.O_RDONLY|constants.O_DIRECTORY);
  try{fsyncSync(fd)}finally{closeSync(fd)}
  return await fn(root,base);
 }finally{rmSync(base,{recursive:true,force:true})}
};
const make=directory=>createO2DurableNonceLedger({directory,scope:SCOPE,expectedAotDigest:PIN});

test('O2 durable ledger creates restrictive no-plaintext markers and rejects duplicate issuer/verifier claims across reopened instances',()=>fixture(dir=>{
 const a=make(dir);
 assert.equal(a.reserve('run:one'),true);
 assert.equal(a.reserve('run:one'),false);
 assert.equal(a.consume('run:one'),true);
 assert.equal(a.consume('run:one'),false);
 const b=make(dir);
 assert.equal(b.reserve('run:one'),false);
 assert.equal(b.consume('run:one'),false);
 assert.equal(b.reserve('run:two'),true);
 assert.equal(b.consume('run:two'),true);
 const names=readdirSync(dir);assert.equal(names.length,4);
 assert.ok(names.every(n=>/^[0-9a-f]{64}\.nonce$/.test(n)));
 assert.equal(statSync(dir).mode&0o777,0o700);
 assert.ok(names.every(n=>(statSync(join(dir,n)).mode&0o777)===0o600));
}));

test('O2 durable ledger rejects nonce claims across distinct Node processes',()=>fixture(dir=>{
 const a=make(dir);
 assert.equal(a.reserve('run:restart'),true);
 assert.equal(a.consume('run:restart'),true);
 const moduleUrl=pathToFileURL(fileURLToPath(new URL('./o2-durable-nonce-ledger.mjs',import.meta.url))).href;
 const code=`import {createO2DurableNonceLedger} from ${JSON.stringify(moduleUrl)};const l=createO2DurableNonceLedger({directory:process.argv[1],scope:'tenant:one',expectedAotDigest:'${PIN}'});console.log(JSON.stringify([l.reserve('run:restart'),l.consume('run:restart'),l.reserve('run:fresh'),l.consume('run:fresh')]));`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code,dir],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout.trim()),[false,false,true,true]);
}));

test('O2 durable ledger namespaces phases, scope and AOT pin; no reuse across the same namespace',()=>fixture(dir=>{
 const a=make(dir);
 const otherScope=createO2DurableNonceLedger({directory:dir,scope:'tenant:two',expectedAotDigest:PIN});
 const otherPin=createO2DurableNonceLedger({directory:dir,scope:SCOPE,expectedAotDigest:'b'.repeat(64)});
 assert.equal(a.reserve('run:same'),true);
 assert.equal(otherScope.reserve('run:same'),true);
 assert.equal(otherPin.reserve('run:same'),true);
 assert.equal(a.reserve('run:same'),false);
 assert.equal(a.consume('run:same'),true);
}));

test('O2 durable ledger rejects unsupported/untrusted directories, traversal, malformed nonce and changed permissions',()=>fixture((dir,base)=>{
 assert.throws(()=>make('relative/path'),/HOST_CONFIGURATION/);
 const link=join(base,'symlink');symlinkSync(dir,link);
 assert.throws(()=>make(link),/UNTRUSTED_DIRECTORY/);
 const ledger=make(dir);
 for(const bad of ['../outside','x'.repeat(130),null,{},Symbol('coerce')]){
  assert.equal(ledger.reserve(bad),false);
  assert.equal(ledger.consume(bad),false);
 }
 chmodSync(dir,0o777);
 assert.equal(ledger.reserve('run:perm-change'),false);
 assert.equal(ledger.consume('run:perm-change'),false);
}));

test('O2 durable ledger blocks unprovisioned root and untrusted parent; never auto-mkdir',()=>fixture((dir,base)=>{
 const missing=join(base,'not-provisioned');
 assert.equal(existsSync(missing),false);
 assert.throws(()=>make(missing),/UNTRUSTED_DIRECTORY/);
 assert.equal(existsSync(missing),false);
 chmodSync(base,0o777);
 assert.throws(()=>make(dir),/UNTRUSTED_DIRECTORY/);
 assert.throws(()=>createO2DurableNonceLedger({directory:dir,scope:SCOPE,expectedAotDigest:PIN}),/UNTRUSTED_DIRECTORY/);
}));


test('O2 P2 ancestor chain rejects nonsticky writable grandparent but accepts private restored chain',()=>fixture((dir,base)=>{
 const unsafe=join(base,'untrusted-grandparent');
 const direct=join(unsafe,'private-parent'),root=join(direct,'ledger');
 mkdirSync(unsafe,{mode:0o700});
 mkdirSync(direct,{mode:0o700});
 mkdirSync(root,{mode:0o700});
 const safe=make(root);
 assert.equal(safe.reserve('run:before'),true);
 chmodSync(unsafe,0o777);
 assert.throws(()=>make(root),/UNTRUSTED_DIRECTORY/);
 assert.equal(safe.reserve('run:while-untrusted'),false);
 chmodSync(unsafe,0o700);
 assert.equal(make(root).reserve('run:after'),true);
}));

test('O2 P2 invalid scope never invokes toString, valueOf or Symbol.toPrimitive',()=>fixture(dir=>{
 let coercions=0;
 const adversaries=[
  {toString(){coercions++;return 'tenant:coerced'}},
  {[Symbol.toPrimitive](){coercions++;return 'tenant:coerced'}},
  Object(Symbol('adversary')),
  Symbol('coerce'),
  new Proxy({toString(){coercions++;return 'tenant:coerced'}},{get(){coercions++;throw Error('COERCION_TRAP')}})
 ];
 for(const scope of adversaries){
  assert.throws(()=>createO2DurableNonceLedger({directory:dir,scope,expectedAotDigest:PIN}),/HOST_CONFIGURATION/);
 }
 assert.equal(coercions,0);
}));

test('O2 four children wait at a ready/go barrier before racing to reserve exactly one nonce',{timeout:10000},()=>fixture(async dir=>{
 const moduleUrl=pathToFileURL(fileURLToPath(new URL('./o2-durable-nonce-ledger.mjs',import.meta.url))).href;
 const script="import {createO2DurableNonceLedger} from "+JSON.stringify(moduleUrl)+
  ";const l=createO2DurableNonceLedger({directory:process.argv[1],scope:'tenant:one',expectedAotDigest:'"+PIN+
  "'});console.log('READY');process.stdin.once('data',()=>{console.log(l.reserve('run:atomic'));});";
 const children=[];
 try{
  for(let i=0;i<4;i++){
   const child=spawn(process.execPath,['--input-type=module','-e',script,dir]);
   let stdout='',stderr='',readyDone=false;
   let readyResolve,readyReject;
   const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
   const result=new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('close',code=>code===0?resolve(stdout.trim().split(/\s+/).at(-1)):reject(Error('CHILD_EXIT '+code+' '+stderr)));
   });
   child.stdout.on('data',chunk=>{stdout+=chunk;if(!readyDone&&stdout.includes('READY\n')){readyDone=true;readyResolve()}});
   child.stderr.on('data',chunk=>stderr+=chunk);
   child.on('error',readyReject);
   child.on('close',code=>{if(!readyDone)readyReject(Error('CHILD_NOT_READY '+code+' '+stderr))});
   children.push({child,ready,result});
  }
  await Promise.all(children.map(c=>c.ready));
  // Closing the pipe after GO is essential: a flowing Node stdin keeps
  // the child event loop alive even after the once('data') callback fires.
  for(const c of children)c.child.stdin.end('GO\n');
  const results=await Promise.all(children.map(c=>c.result));
  assert.deepEqual(results.sort(),['false','false','false','true']);
 }finally{for(const c of children){if(c.child.exitCode===null)c.child.kill()}}
}));
