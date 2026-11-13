/** O2 Linux Host durable nonce integration; does NOT mint Experience/Effect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createO2DurableNonceLedger} from './o2-durable-nonce-ledger.mjs';
import {createControlledTraceIssuer,createControlledTraceVerifier} from './o2-controlled-execution-trace.mjs';
const AOT='d'.repeat(64),FUNCTION='xdownload.interaction.inspect',SCOPE='tenant:dis-o2-durable-host',SOURCE='f57747aa7996c88833e72288a0acd594a7ce5468';
const observation=()=>({kind:'OBSERVATION',disposition:'NEEDS_CONFIRMATION',authority:'NONE',contractVersion:'1.0.0',value:{status:'PENDING_USER_CONFIRMATION'},evidence:{attested:false,source:{sourceId:'xdownload-interaction',sha256:'a'.repeat(64),gitBlob:SOURCE}}});
const app={aotDigest:AOT,contractVersions:{[FUNCTION]:'1.0.0'},functions:[FUNCTION],invoke:async()=>observation()};
const input=runId=>({channel:'cli',requestId:runId,url:'https://example.com/media/test.mp4',declaredBytes:2048});
const withDir=async fn=>{const dir=mkdtempSync(join(tmpdir(),'dis-o2-durable-int-'));try{await fn(dir)}finally{rmSync(dir,{recursive:true,force:true})}};
const ledger=dir=>createO2DurableNonceLedger({directory:dir,scope:SCOPE,expectedAotDigest:AOT});
const issuer=(keys,durable)=>createControlledTraceIssuer({app,...keys,scope:SCOPE,expectedAotDigest:AOT,nonceLedger:durable});
const verifier=(keys,durable)=>createControlledTraceVerifier({publicKey:keys.publicKey,scope:SCOPE,expectedAotDigest:AOT,nonceLedger:durable});

test('O2 Host durable ledger resists issuer and verifier replay after both are reconstructed',()=>withDir(async dir=>{
 const keys=generateKeyPairSync('ed25519');const runId='run:durable-001',arg=input(runId);
 const issued=await issuer(keys,ledger(dir)).capture({input:arg,runId});
 assert.equal(issued.status,'ISSUED_TRACE_ONLY');
 const first=verifier(keys,ledger(dir)).consume({receipt:issued.receipt,input:arg,observation:issued.observation,runId});
 assert.equal(first.status,'VERIFIED_TRACE_ONLY');assert.equal(first.experienceIssued,false);assert.equal(first.exportAllowed,false);
 const second=verifier(keys,ledger(dir)).consume({receipt:issued.receipt,input:arg,observation:issued.observation,runId});
 assert.equal(second.status,'UNKNOWN');assert.equal(second.traceVerified,false);assert.equal(second.effectDispatched,false);
 const twice=await issuer(keys,ledger(dir)).capture({input:arg,runId});
 assert.equal(twice.status,'UNKNOWN');assert.equal(twice.experienceIssued,false);
 const next='run:durable-002',fresh=await issuer(keys,ledger(dir)).capture({input:input(next),runId:next});
 assert.equal(fresh.status,'ISSUED_TRACE_ONLY');
}));

test('O2 durable Host storage failure denies signing and verification without falling back to volatile PASS',()=>withDir(async dir=>{
 const keys=generateKeyPairSync('ed25519');const runId='run:denied',arg=input(runId);
 const valid=await issuer(keys,ledger(dir)).capture({input:arg,runId});assert.equal(valid.status,'ISSUED_TRACE_ONLY');
 const durable=ledger(dir);chmodSync(dir,0o777);
 const rejected=verifier(keys,durable).consume({receipt:valid.receipt,input:arg,observation:valid.observation,runId});
 assert.equal(rejected.status,'UNKNOWN');assert.equal(rejected.traceVerified,false);assert.equal(rejected.experienceIssued,false);
 const failIssue=await issuer(keys,durable).capture({input:input('run:blocked'),runId:'run:blocked'});
 assert.equal(failIssue.status,'UNKNOWN');assert.equal(failIssue.effectDispatched,false);
}));

test('O2 Host cannot bind ledger from another scope or AOT digest to this signer/verifier',()=>withDir(async dir=>{
 const keys=generateKeyPairSync('ed25519');
 const wrong=createO2DurableNonceLedger({directory:dir,scope:'tenant:other',expectedAotDigest:AOT});
 assert.throws(()=>issuer(keys,wrong),/O2_TRACE_NONCE_LEDGER_MISMATCH/);
 assert.throws(()=>verifier(keys,wrong),/O2_TRACE_NONCE_LEDGER_MISMATCH/);
 const wrongAot=createO2DurableNonceLedger({directory:dir,scope:SCOPE,expectedAotDigest:'e'.repeat(64)});
 assert.throws(()=>issuer(keys,wrongAot),/O2_TRACE_NONCE_LEDGER_MISMATCH/);
}));
