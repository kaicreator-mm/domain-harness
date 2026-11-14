/** O2 R83: controlled signed execution-origin, never business verdict. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createControlledTraceIssuer,createControlledTraceVerifier} from './o2-controlled-execution-trace.mjs';
const SOURCE='f57747aa7996c88833e72288a0acd594a7ce5468';
const pair=()=>generateKeyPairSync('ed25519');
const AOT='d'.repeat(64);
const FUNCTION='xdownload.interaction.inspect';
const input=runId=>({channel:'cli',requestId:runId,url:'https://example.com/media/test.mp4',declaredBytes:2048});
const obs=()=>({kind:'OBSERVATION',disposition:'NEEDS_CONFIRMATION',authority:'NONE',contractVersion:'1.0.0',value:{status:'PENDING_USER_CONFIRMATION'},evidence:{attested:false,source:{sourceId:'xdownload-interaction',sha256:'a'.repeat(64),gitBlob:SOURCE}}});
const app=(invoke=async()=>obs())=>({aotDigest:AOT,contractVersions:{[FUNCTION]:'1.0.0'},functions:[FUNCTION],invoke});
const make=(invoke=async()=>obs(),scope='tenant:dis-o2-r83')=>{
 const keys=pair();return {keys,issuer:createControlledTraceIssuer({app:app(invoke),...keys,scope,expectedAotDigest:AOT,maxWaitMs:35}),verifier:createControlledTraceVerifier({publicKey:keys.publicKey,scope,expectedAotDigest:AOT})};
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
 for(const change of scenarios){const verify=createControlledTraceVerifier({publicKey:keys.publicKey,scope:'tenant:dis-o2-r83',expectedAotDigest:AOT});
  const v=verify.consume({receipt:out.receipt,input:args,observation:out.observation,runId,...change});
  assert.equal(v.traceVerified,false);assert.equal(v.experienceIssued,false);assert.equal(v.authority,'NONE');
 }
 const impostor=createControlledTraceVerifier({publicKey:pair().publicKey,scope:'tenant:dis-o2-r83',expectedAotDigest:AOT});
 assert.equal(impostor.consume({receipt:out.receipt,input:args,observation:out.observation,runId}).reason,'O2_TRACE_SIGNATURE_INVALID');
 assert.throws(()=>createControlledTraceIssuer({app:app(),privateKey:keys.privateKey,publicKey:pair().publicKey,scope:'tenant:dis-o2-r83',expectedAotDigest:AOT}),/KEY_MISMATCH/);
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

test('R86 P1-01 mutation after digest cannot alter invoked immutable AOT input',async()=>{
 const runId='run:immutable-001',args=input(runId),original=args.url;
 let selected,blocked;
 const {issuer,verifier}=make(async(_fn,actual)=>{
  selected=actual;blocked=Object.isFrozen(actual);
  return obs();
 });
 const pending=issuer.capture({input:args,runId});
 args.url='https://example.com/media/mutated.mp4';
 const out=await pending;
 assert.equal(out.status,'ISSUED_TRACE_ONLY');
 assert.equal(selected.url,original);assert.equal(blocked,true);
 assert.equal(verifier.consume({receipt:out.receipt,input:args,observation:out.observation,runId}).traceVerified,false);
 assert.equal(verifier.consume({receipt:out.receipt,input:input(runId),observation:out.observation,runId}).traceVerified,true);
});
test('R86 P1-02 non-enumerable source/observation data cannot be silently omitted from signatures',async()=>{
 for(const hiddenAt of ['value','evidence','root']){
  const bad=obs();
  Object.defineProperty(hiddenAt==='root'?bad:bad[hiddenAt],'sensitiveFact',{value:'hidden',enumerable:false});
  const {issuer}=make(async()=>bad);
  const out=await issuer.capture({input:input('run:hidden-'+hiddenAt),runId:'run:hidden-'+hiddenAt});
  assert.equal(out.status,'UNKNOWN');assert.equal(out.traceVerified,false);
 }
 const badInput=input('run:input-hidden');
 Object.defineProperty(badInput,'secret',{value:'hidden',enumerable:false});
 const {issuer}=make();assert.equal((await issuer.capture({input:badInput,runId:'run:input-hidden'})).status,'UNKNOWN');
});
test('R86 P2-01 missing selected contract version denies without promise rejection',async()=>{
 const bad=obs();delete bad.contractVersion;
 const {issuer}=make(async()=>bad);
 const result=await issuer.capture({input:input('run:missing-version'),runId:'run:missing-version'});
 assert.equal(result.status,'UNKNOWN');assert.equal(result.experienceIssued,false);
});

const assertUnknown=result=>{
 assert.equal(result.status,'UNKNOWN');
 assert.equal(result.traceVerified,false);
 assert.equal(result.experienceIssued,false);
 assert.equal(result.qualified,false);
 assert.equal(result.authority,'NONE');
 assert.equal(result.effectDispatched,false);
 assert.equal(result.exportAllowed,false);
};

test('R86 P1-03 outer capture/consume arguments reject Proxy and Getter without executing traps',async()=>{
 const runId='run:p103-outer',args=input(runId);
 const {issuer,verifier}=make();
 const out=await issuer.capture({input:args,runId});
 assert.equal(out.status,'ISSUED_TRACE_ONLY');
 let traps=0,reads=0;
 const hostileProxy=value=>new Proxy(value,{
  getPrototypeOf(){traps++;throw Error('FORBIDDEN_PROXY_TRAP')},
  ownKeys(){traps++;throw Error('FORBIDDEN_PROXY_TRAP')},
  get(){traps++;throw Error('FORBIDDEN_PROXY_TRAP')},
  getOwnPropertyDescriptor(){traps++;throw Error('FORBIDDEN_PROXY_TRAP')}
 });
 assertUnknown(await issuer.capture(hostileProxy({input:args,runId})));
 assertUnknown(verifier.consume(hostileProxy({receipt:out.receipt,input:args,observation:out.observation,runId})));
 const captureGetter={runId};
 Object.defineProperty(captureGetter,'input',{enumerable:true,get(){reads++;throw Error('FORBIDDEN_GETTER')}});
 const consumeGetter={input:args,observation:out.observation,runId};
 Object.defineProperty(consumeGetter,'receipt',{enumerable:true,get(){reads++;throw Error('FORBIDDEN_GETTER')}});
 assertUnknown(await issuer.capture(captureGetter));
 assertUnknown(verifier.consume(consumeGetter));
 assert.equal(traps,0);
 assert.equal(reads,0);
});

test('R86 P1-03 nested inputDigest and observationDigest Symbol.toPrimitive never execute',async()=>{
 const runId='run:p103-coercion',args=input(runId);
 const {issuer,verifier}=make();
 const out=await issuer.capture({input:args,runId});
 assert.equal(out.status,'ISSUED_TRACE_ONLY');
 for(const field of ['inputDigest','observationDigest']){
  let coercions=0;
  const hostile={};
  Object.defineProperty(hostile,Symbol.toPrimitive,{enumerable:true,get(){
   coercions++;throw Error('FORBIDDEN_SYMBOL_TO_PRIMITIVE');
  }});
  const payload={...out.receipt.payload,[field]:hostile};
  const receipt={...out.receipt,payload};
  assertUnknown(verifier.consume({receipt,input:args,observation:out.observation,runId}));
  assert.equal(coercions,0);
 }
});

test('R86 P1-03 null-prototype and noncanonical external argument records fail closed',async()=>{
 const runId='run:p103-null-prototype',args=input(runId);
 const {issuer,verifier}=make();
 const out=await issuer.capture({input:args,runId});
 assert.equal(out.status,'ISSUED_TRACE_ONLY');
 const captureArgs=Object.assign(Object.create(null),{input:args,runId});
 const consumeArgs=Object.assign(Object.create(null),{
  receipt:out.receipt,input:args,observation:out.observation,runId
 });
 assertUnknown(await issuer.capture(captureArgs));
 assertUnknown(verifier.consume(consumeArgs));
 const nullPayload=Object.assign(Object.create(null),out.receipt.payload);
 const receipt={...out.receipt,payload:nullPayload};
 assertUnknown(verifier.consume({receipt,input:args,observation:out.observation,runId}));
 assertUnknown(await issuer.capture(new Date()));
});

test('R86 P2-02 installer AOT digest pin is mandatory but tenant remains a Host trust assumption',async()=>{
 const keys=pair();
 assert.throws(()=>createControlledTraceIssuer({app:app(),...keys,scope:'tenant:test'}),/O2_TRACE_HOST_CONFIGURATION/);
 assert.throws(()=>createControlledTraceIssuer({app:{...app(),aotDigest:'e'.repeat(64)},...keys,scope:'tenant:test',expectedAotDigest:AOT}),/O2_TRACE_HOST_CONFIGURATION/);
 const {issuer}=make();const runId='run:aot-mismatch';
 const out=await issuer.capture({input:input(runId),runId});
 const other=createControlledTraceVerifier({publicKey:pair().publicKey,scope:'tenant:dis-o2-r83',expectedAotDigest:'e'.repeat(64)});
 assert.equal(other.consume({receipt:out.receipt,input:input(runId),observation:out.observation,runId}).traceVerified,false);
});
