import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,chmodSync,symlinkSync,statSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createO2DurableNonceLedger} from './o2-durable-nonce-ledger.mjs';
const PIN='a'.repeat(64),SCOPE='tenant:one';
const fixture=fn=>{const base=mkdtempSync(join(tmpdir(),'dis-o2-nonce-'));try{return fn(join(base,'trusted'),base)}finally{rmSync(base,{recursive:true,force:true})}};
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
 const link=join(base,'symlink');mkdirSync(dir,{mode:0o700});symlinkSync(dir,link);
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

test('O2 durable ledger atomic create admits one of multiple competing processes only',()=>fixture(dir=>{
 const moduleUrl=pathToFileURL(fileURLToPath(new URL('./o2-durable-nonce-ledger.mjs',import.meta.url))).href;
 const script=`import {createO2DurableNonceLedger} from ${JSON.stringify(moduleUrl)};console.log(createO2DurableNonceLedger({directory:process.argv[1],scope:'tenant:one',expectedAotDigest:'${PIN}'}).reserve('run:atomic'))`;
 const p1=spawnSync(process.execPath,['--input-type=module','-e',script,dir],{encoding:'utf8'});
 const p2=spawnSync(process.execPath,['--input-type=module','-e',script,dir],{encoding:'utf8'});
 assert.equal(p1.status,0,p1.stderr);assert.equal(p2.status,0,p2.stderr);
 assert.deepEqual([p1.stdout.trim(),p2.stdout.trim()].sort(),['false','true']);
}));
