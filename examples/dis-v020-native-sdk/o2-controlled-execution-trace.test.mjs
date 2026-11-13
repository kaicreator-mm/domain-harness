/** O2 R83: controlled signed execution-origin, never business verdict. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createControlledTraceIssuer,createControlledTraceVerifier} from './o2-controlled-execution-trace.mjs';
const SOURCE='f57747aa7996c88833e72288a0acd594a7ce5468';
const pair=()=>generateKeyPairSync('ed25519');
const input=runId=>({channel:'cli',requestId:runId,url:'https://example.com/media/test.mp4',declaredBytes:2048});
const obs=()=>({kind:'OBSERVATION',disposition:'NEEDS_CONFIRMATION',authority:'NONE',contractVersion:'1.0.0',value:{status:'PENDING_USER_CONFIRMATION'},evidence:{attested:false,source:{sourceId:'xdownload-interaction',sha256:'a'.repeat(64),gitBlob:SOURCE}}});
const app=(invoke=async()=>obs())=>({functions:['xdownload.interaction.inspect'],invoke});
const make=(invoke=async()=>obs(),scope='tenant:dis-o2-r83')=>{
 const keys=pair();return {keys,issuer:createControlledTraceIssuer({app:app(invoke),...keys,scope,maxWaitMs:35}),verifier:createControlledTraceVerifier({publicKey:keys.publicKey,scope})};
};
test('R83 authentic controlled Host trace verifies origin without business PASS/Experience',async()=>{
 const {issuer,verifier}=make(),runId='run:real-001',args=input(runId);
 const out=await issuer.capture({input:args,runId});assert.equal(out.status,'ISSUED_TRACE_ONLY');
 assert.equal(out.receipt.payload.sourceGitBlob,SOURCE);
 assert.equal(out.receipt.payload.authority,'NONE');
 const v=verifier.consume({receipt:out.receipt,observation:out.observation,input:args,runId});
 assert.equal(v.status,'VERIFIED_TRACE_ONLY');assert.equal(v.reason,'INDEPENDENT_BUSINESS_VALIDATOR_MISSING');
 assert.equal(v.traceVerified,true);assert.equal(v.experienceIssued,false);assert.equal(v.qualified,false);
 assert.equal(v.effectDispatched,false);assert.equal(v.exportAllowed,false);
 assert.equal(verifier.consume({receipt:out.receipt,observation:out.observation,input:args,runId}).reason,'O2_TRACE_REPLAY');
});
test('R83 tamper, scope and independent key attack all fail closed',async()=>{
 const {issuer,keys}=make();const runId='run:tamper-002',args=input(runId);
 const out=await issuer.capture({input:args,runId});
 const scenarios=[
  {receipt:{...out.receipt,payload:{...out.receipt.payload,experienceIssued:true}}},
  {receipt:{...out.receipt,payload:{...out.receipt.payload,scope:'tenant:other'}}},
  {receipt:{...out.receipt,payload:{...out.receipt.payload,inputDigest:'b'.repeat(64)}}},
  {receipt:{...out.receipt,payload:{...out.receipt.payload,validatorStatus:'PASS'}}},
  {receipt:{...out.receipt,signature:'A'.repeat(86)}},
  {input:{...args,declaredBytes:4096}},
  {observation:{...out.observation,disposition:'VERIFIED'}}
 ];
 for(const change of scenarios){const verify=createControlledTraceVerifier({publicKey:keys.publicKey,scope:'tenant:dis-o2-r83'});
  const v=verify.consume({receipt:out.receipt,input:args,observation:out.observation,runId,...change});
  assert.equal(v.traceVerified,false);assert.equal(v.experienceIssued,false);assert.equal(v.authority,'NONE');
 }
 const impostor=createControlledTraceVerifier({publicKey:pair().publicKey,scope:'tenant:dis-o2-r83'});
 assert.equal(impostor.consume({receipt:out.receipt,input:args,observation:out.observation,runId}).reason,'O2_TRACE_SIGNATURE_INVALID');
 assert.throws(()=>createControlledTraceIssuer({app:app(),privateKey:keys.privateKey,publicKey:pair().publicKey,scope:'tenant:dis-o2-r83'}),/KEY_MISMATCH/);
});
test('R83 source, origin and claimed authority cannot mint a trace',async()=>{
 for(const scenario of [
  {...obs(),authority:'KDP'},
  {...obs(),evidence:{...obs().evidence,attested:true}},
  {...obs(),evidence:{...obs().evidence,source:{...obs().evidence.source,gitBlob:'b'.repeat(40)}}},
  {...obs(),kind:'EFFECT'},
 ]){
  const {issuer}=make(async()=>scenario);
  const out=await issuer.capture({input:input('run:reject'),runId:'run:reject'});
  assert.equal(out.status,'UNKNOWN');assert.equal(out.experienceIssued,false);
 }
});
test('R83 concurrent identical run IDs are reserved before SDK invoke',async()=>{
 let calls=0;let settle;
 const {issuer}=make(()=>{calls++;return new Promise(resolve=>{settle=resolve})});
 const args=input('run:concurrent');
 const a=issuer.capture({input:args,runId:'run:concurrent'});
 const b=issuer.capture({input:args,runId:'run:concurrent'});
 assert.equal((await b).reason,'O2_RUN_REPLAY');
 await Promise.resolve();settle(obs());
 assert.equal((await a).status,'ISSUED_TRACE_ONLY');assert.equal(calls,1);
});
test('R83 hung native SDK bounded UNKNOWN, no late receipt can escape',async()=>{
 const {issuer}=make(()=>new Promise(()=>{}));
 const out=await issuer.capture({input:input('run:hung'),runId:'run:hung'});
 assert.equal(out.reason,'O2_NATIVE_UNAVAILABLE_OR_TIMEOUT');assert.equal(out.experienceIssued,false);
 assert.equal((await issuer.capture({input:input('run:hung'),runId:'run:hung'})).reason,'O2_RUN_REPLAY');
});
test('R83 getters, Proxy, invalid canonical and run ID mismatches fail with zero accessor invocation',async()=>{
 let reads=0;
 const args=input('run:unsafe');Object.defineProperty(args,'channel',{enumerable:true,get(){reads++;throw Error('FORBIDDEN')}});
 const {issuer}=make();
 assert.equal((await issuer.capture({input:args,runId:'run:unsafe'})).status,'UNKNOWN');
 assert.equal(reads,0);
 assert.equal((await issuer.capture({input:new Proxy(input('run:proxy'),{}),runId:'run:proxy'})).status,'UNKNOWN');
 assert.equal((await issuer.capture({input:input('run:one'),runId:'run:two'})).status,'UNKNOWN');
});
