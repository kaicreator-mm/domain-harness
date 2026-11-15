/**
 * O2 R143: Real selected AOT/SDK two-key Validator join with trusted Linux
 * Host durable replay state. This is single-host local-FS defense only, not
 * credentialed Oracle, tenant proof, Experience, Effect or distributed replay.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,openSync,fsyncSync,closeSync,chmodSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {createO2DurableNonceLedger} from './o2-durable-nonce-ledger.mjs';
import {createControlledTraceIssuer} from './o2-controlled-execution-trace.mjs';
import {createO2IndependentValidatorEvidenceGate} from './o2-independent-validator-evidence.mjs';

const basePromise=makeNativeFixture();
const SCOPE='tenant:dis-o2-two-key-durable-r143';
const RULE='c'.repeat(64);
let currentRun=0;

async function withTrustedLedger(fn){
 const parent=mkdtempSync(join(tmpdir(),'dis-o2-validator-r143-'));
 const dir=join(parent,'trusted');
 try{
  mkdirSync(dir,{mode:0o700});
  const pfd=openSync(parent,constants.O_RDONLY|constants.O_DIRECTORY);
  try{fsyncSync(pfd)}finally{closeSync(pfd)}
  return await fn(dir);
 }finally{rmSync(parent,{force:true,recursive:true})}
}
async function withSelected(fn){
 const base=await basePromise;
 const app=await loadDisV020Aot(base.artifact,{
  expectedDigest:base.artifact.digest,registry:base.registry,
  store:new PlainCasDocStore(),tenantId:SCOPE
 });
 try{return await fn(app,base.artifact.digest)}
 finally{app.stop()}
}
const noAuthority=value=>{
 assert.equal(value.qualified,false);
 assert.equal(value.experienceIssued,false);
 assert.equal(value.effectDispatched,false);
 assert.equal(value.exportAllowed,false);
 assert.equal(value.authority,'NONE');
};
const signed=(payload,key)=>({
 payload,
 signature:sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64url')
});
async function session(dir,app,aot){
 const keys=generateKeyPairSync('ed25519'),validator=generateKeyPairSync('ed25519');
 const ledger=()=>createO2DurableNonceLedger({directory:dir,scope:SCOPE,expectedAotDigest:aot});
 const runId='run:durable-validator-'+(++currentRun);
 const input={channel:'cli',requestId:runId,
  url:'https://example.com/media/validator.mp4',declaredBytes:2048};
 const issuer=createControlledTraceIssuer({
  app,privateKey:keys.privateKey,publicKey:keys.publicKey,
  scope:SCOPE,expectedAotDigest:aot,nonceLedger:ledger()
 });
 const result=await issuer.capture({input,runId});
 assert.equal(result.status,'ISSUED_TRACE_ONLY');
 const payload={
  version:'dis.o2.independent-validator/1',scope:SCOPE,runId,
  aotDigest:aot,ruleDigest:RULE,traceSignature:result.receipt.signature,
  observationDigest:result.receipt.payload.observationDigest,
  verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
  experienceIssued:false,effectDispatched:false
 };
 const config={tracePublicKey:keys.publicKey,validatorPublicKey:validator.publicKey,
  scope:SCOPE,expectedAotDigest:aot,expectedRuleDigest:RULE};
 const gate=()=>createO2IndependentValidatorEvidenceGate({...config,nonceLedger:ledger()});
 const args=validatorReceipt=>({
  validatorReceipt,traceReceipt:result.receipt,input,
  observation:result.observation,runId
 });
 return {gate,args,payload,validator,dir};
}

test('O2 R143 selected AOT two-key PASS remains technical and rejects replay after Gate reconstruction',async()=>{
 await withTrustedLedger(async dir=>withSelected(async(app,aot)=>{
  const {gate,args,payload,validator}=await session(dir,app,aot);
  const receipt=signed(payload,validator.privateKey);
  const initial=gate().consume(args(receipt));
  assert.equal(initial.status,'VALIDATOR_RECEIPT_VERIFIED_TECHNICAL');
  assert.equal(initial.traceVerified,true);
  assert.equal(initial.validatorSignatureVerified,true);
  noAuthority(initial);
  // New Gate reconstructs both in-memory Verifier and its local-fs nonce
  // ledger, retaining the exact key pins, selected AOT, Scope and receipt.
  const afterReconstruction=gate().consume(args(receipt));
  assert.equal(afterReconstruction.status,'UNKNOWN');
  assert.equal(afterReconstruction.traceVerified,false);
  assert.equal(afterReconstruction.reason,'O2_VALIDATOR_ORIGINAL_TRACE_NOT_VERIFIED');
  noAuthority(afterReconstruction);
 }));
});

test('O2 R143 forged Validator signature never burns durable Host nonce',async()=>{
 await withTrustedLedger(async dir=>withSelected(async(app,aot)=>{
  const {gate,args,payload,validator}=await session(dir,app,aot);
  const failed=gate().consume(args({...signed(payload,validator.privateKey),signature:'A'.repeat(86)}));
  assert.equal(failed.status,'UNKNOWN');
  assert.equal(failed.reason,'O2_VALIDATOR_SIGNATURE_INVALID');
  noAuthority(failed);
  const valid=gate().consume(args(signed(payload,validator.privateKey)));
  assert.equal(valid.status,'VALIDATOR_RECEIPT_VERIFIED_TECHNICAL');
  noAuthority(valid);
  assert.equal(gate().consume(args(signed(payload,validator.privateKey))).status,'UNKNOWN');
 }));
});

test('O2 R143 locally untrusted ledger fails closed; valid signatures do not authorize Experience',async()=>{
 await withTrustedLedger(async dir=>withSelected(async(app,aot)=>{
  const {gate,args,payload,validator}=await session(dir,app,aot);
  chmodSync(dir,0o777);
  const fail=gate;
  assert.throws(fail,/O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY/);
  // No fallback to memory-only SUCCESS when local Host trust deteriorates.
  assert.equal(payload.experienceIssued,false);
  assert.equal(payload.effectDispatched,false);
  assert.equal(args(signed(payload,validator.privateKey)).validatorReceipt.payload.authority,'TECHNICAL_VALIDATION_ONLY');
 }));
});
