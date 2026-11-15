/** O2 R140 real selected AOT->SDK Trace + independently keyed Validator receipt, technical-only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {createControlledTraceIssuer} from './o2-controlled-execution-trace.mjs';
import {createO2IndependentValidatorEvidenceGate} from './o2-independent-validator-evidence.mjs';

const SCOPE='tenant:dis-o2-independent-research';
const RULE='c'.repeat(64);
const source=makeNativeFixture();
let n=0;
async function withSelected(visit){
 const f=await source,run=++n;
 const app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-o2-independent-research'
 });
 try{
  const traceKeys=generateKeyPairSync('ed25519');
  const validatorKeys=generateKeyPairSync('ed25519');
  const config={tracePublicKey:traceKeys.publicKey,validatorPublicKey:validatorKeys.publicKey,
    scope:SCOPE,expectedAotDigest:f.artifact.digest,expectedRuleDigest:RULE};
  const issuer=createControlledTraceIssuer({
   app,privateKey:traceKeys.privateKey,publicKey:traceKeys.publicKey,
   scope:SCOPE,expectedAotDigest:f.artifact.digest
  });
  const runId='run:independent-'+run;
  const request={channel:'cli',requestId:runId,
   url:'https://example.com/media/r140.mp4',declaredBytes:2048};
  const trace=await issuer.capture({input:request,runId});
  assert.equal(trace.status,'ISSUED_TRACE_ONLY');
  const payload={
   version:'dis.o2.independent-validator/1',scope:SCOPE,runId,
   aotDigest:f.artifact.digest,ruleDigest:RULE,traceSignature:trace.receipt.signature,
   observationDigest:trace.receipt.payload.observationDigest,
   verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
   experienceIssued:false,effectDispatched:false
  };
  const signed=p=>({payload:p,
   signature:sign(null,Buffer.from(JSON.stringify(p)),validatorKeys.privateKey).toString('base64url')});
  return await visit({app,runId,request,trace,config,traceKeys,validatorKeys,payload,signed,
   input:receipt=>({validatorReceipt:receipt,traceReceipt:trace.receipt,
    input:request,observation:trace.observation,runId})});
 }finally{app.stop()}
}
const noAuthority=x=>{
 assert.equal(x.qualified,false);
 assert.equal(x.experienceIssued,false);
 assert.equal(x.effectDispatched,false);
 assert.equal(x.exportAllowed,false);
 assert.equal(x.authority,'NONE');
};
test('O2 R140 different-key signed Validator can prove trace binding but never mint Experience',async()=>{
 await withSelected(({config,payload,signed,input})=>{
  const gate=createO2IndependentValidatorEvidenceGate(config);
  const res=gate.consume(input(signed(payload)));
  assert.equal(res.status,'VALIDATOR_RECEIPT_VERIFIED_TECHNICAL');
  assert.equal(res.traceVerified,true);
  assert.equal(res.validatorSignatureVerified,true);
  assert.equal(res.validatorVerdict,'PASS');
  noAuthority(res);
  const replay=gate.consume(input(signed(payload)));
  assert.equal(replay.status,'UNKNOWN');
  assert.equal(replay.traceVerified,false);
  noAuthority(replay);
 });
});
test('O2 R140 forged Validator signature fails before burning original signed Trace',async()=>{
 await withSelected(({config,payload,signed,input})=>{
  const gate=createO2IndependentValidatorEvidenceGate(config);
  const fake={...signed(payload),signature:'A'.repeat(86)};
  const rejected=gate.consume(input(fake));
  assert.equal(rejected.reason,'O2_VALIDATOR_SIGNATURE_INVALID');
  noAuthority(rejected);
  const valid=gate.consume(input(signed(payload)));
  assert.equal(valid.traceVerified,true,'bad Validator must not consume legitimate Host Trace');
  noAuthority(valid);
 });
});
test('O2 R140 signed false authority, source drift, wrong rule and wrong Trace are denied',async()=>{
 await withSelected(({config,payload,signed,input})=>{
  for(const changed of [
   {...payload,authority:'DOMAIN_ORACLE'},
   {...payload,experienceIssued:true},
   {...payload,ruleDigest:'f'.repeat(64)},
   {...payload,aotDigest:'e'.repeat(64)},
   {...payload,traceSignature:'B'.repeat(86)},
   {...payload,observationDigest:'f'.repeat(64)}
  ]){
   const gate=createO2IndependentValidatorEvidenceGate(config);
   const r=gate.consume(input(signed(changed)));
   assert.equal(r.status,'UNKNOWN');noAuthority(r);
  }
  const otherKey=generateKeyPairSync('ed25519');
  const wrongGate=createO2IndependentValidatorEvidenceGate({...config,validatorPublicKey:otherKey.publicKey});
  const fake=wrongGate.consume(input(signed(payload)));
  assert.equal(fake.reason,'O2_VALIDATOR_SIGNATURE_INVALID');
  noAuthority(fake);
 });
});
test('O2 R140 getters, proxies and typed scope errors are rejected without attacker traps',async()=>{
 await withSelected(({config,payload,signed,input,traceKeys})=>{
  assert.throws(()=>createO2IndependentValidatorEvidenceGate({
   ...config,validatorPublicKey:traceKeys.publicKey
  }),/O2_VALIDATOR_AND_TRACE_KEYS_MUST_DIFFER/);
  const gate=createO2IndependentValidatorEvidenceGate(config);
  let reads=0;
  const proxy=new Proxy(signed(payload),{
   get(){reads++;throw Error('FORBIDDEN')},
   getPrototypeOf(){reads++;throw Error('FORBIDDEN')},
   ownKeys(){reads++;throw Error('FORBIDDEN')}
  });
  const forged=input(proxy);
  const r=gate.consume(forged);
  assert.equal(r.status,'UNKNOWN');noAuthority(r);
  assert.equal(reads,0);
  const accessor=input(signed(payload));
  Object.defineProperty(accessor,'validatorReceipt',{enumerable:true,get(){reads++;throw Error('FORBIDDEN')}});
  assert.equal(gate.consume(accessor).status,'UNKNOWN');
  assert.equal(reads,0);
  const checked=gate.consume(input(signed(payload)));
  assert.equal(checked.status,'VALIDATOR_RECEIPT_VERIFIED_TECHNICAL');
  noAuthority(checked);
 });
});
