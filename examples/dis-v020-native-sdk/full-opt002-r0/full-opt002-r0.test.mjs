/** DIS 0.2.0 R211 O2 / OPT-002 full conformance, engineering layer evidence.
 *
 * Real selected AOT/SDK xDownload execution drives every positive: authentic
 * Host-signed trace chain, full OPT-002 receipt with an explicitly PENDING
 * validator slot, executable holdout/no-second-use policy, METHOD/RESULT
 * reuse policy, consent-gated validator access and export, self-signed
 * validator forgery flagging, and explicit NOT_ELIGIBLE Experience wiring.
 *
 * Honesty: all receipts here are engineering evidence only. The independent
 * business Validator authority is EXTERNAL_AUTHORITY_MISSING (DIE #155 F
 * channel BLOCKED); no test key, fixture or self-asserted identity is ever
 * presented as that authority.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {makeNativeFixture} from '../native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {createControlledTraceIssuer,createControlledTraceVerifier} from '../o2-controlled-execution-trace.mjs';
import {createO2IndependentValidatorEvidenceGate} from '../o2-independent-validator-evidence.mjs';
import {
 captureOpt002Trace,verifyOpt002Trace,buildOpt002Receipt,evaluateOpt002Experience
} from './opt002-trace-receipt.mjs';
import {
 createOpt002HoldoutRegistry,evaluateOpt002Reuse,OPT002_HOLDOUT_VERSION
} from './opt002-holdout-policy.mjs';
import {
 createOpt002ConsentLedger,guardOpt002ValidatorAccess,guardOpt002Export
} from './opt002-consent-boundary.mjs';
import {
 provisionOpt002ValidatorPin,admitOpt002Validator
} from './opt002-validator-admission.mjs';

const SCOPE='tenant:dis-o2-opt002-r0';
const RULE='d'.repeat(64);
const DIGEST='e'.repeat(64);
const fixture=makeNativeFixture();
let run=0;
const noAuthority=x=>{
 assert.equal(x.authority,'NONE');
 assert.equal(x.qualified??false,false);
 assert.equal(x.experienceIssued??false,false);
 assert.equal(x.effectDispatched??false,false);
 assert.equal(x.exportAllowed??false,false);
};
async function withSelected(visit){
 const f=await fixture;
 const app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:SCOPE
 });
 try{
  const traceKeys=generateKeyPairSync('ed25519');
  const validatorKeys=generateKeyPairSync('ed25519');
  const issuer=createControlledTraceIssuer({
   app,privateKey:traceKeys.privateKey,publicKey:traceKeys.publicKey,
   scope:SCOPE,expectedAotDigest:f.artifact.digest
  });
  const verifier=createControlledTraceVerifier({
   publicKey:traceKeys.publicKey,scope:SCOPE,expectedAotDigest:f.artifact.digest
  });
  const gate=createO2IndependentValidatorEvidenceGate({
   tracePublicKey:traceKeys.publicKey,validatorPublicKey:validatorKeys.publicKey,
   scope:SCOPE,expectedAotDigest:f.artifact.digest,expectedRuleDigest:RULE
  });
  const runId='run:opt002-r0-'+(++run);
  const input={channel:'cli',requestId:runId,
   url:'https://example.com/media/opt002-r0.mp4',declaredBytes:2048};
  const signValidator=p=>({
   payload:p,
   signature:sign(null,Buffer.from(JSON.stringify(p)),validatorKeys.privateKey).toString('base64url')
  });
  const validatorPayload={
   version:'dis.o2.independent-validator/1',scope:SCOPE,runId,
   aotDigest:f.artifact.digest,ruleDigest:RULE,
   traceSignature:'',observationDigest:'',
   verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
   experienceIssued:false,effectDispatched:false
  };
  return await visit({
   app,f,traceKeys,validatorKeys,issuer,verifier,gate,runId,input,signValidator,validatorPayload
  });
 }finally{app.stop()}
}
async function captureTrace(s){
 const captured=await captureOpt002Trace({issuer:s.issuer,input:s.input,runId:s.runId});
 assert.equal(captured.status,'TRACE_CAPTURED');
 const verified=verifyOpt002Trace({
  verifier:s.verifier,envelope:captured.receipt,traceReceipt:captured.traceReceipt,
  input:captured.input,observation:captured.observation,runId:s.runId
 });
 assert.equal(verified.status,'RECEIPT_VERIFIED_STRUCTURAL');
 return {captured,verified};
}
function validatorReceiptFor(s,traceReceipt){
 const payload={
  ...s.validatorPayload,
  traceSignature:traceReceipt.signature,
  observationDigest:traceReceipt.payload.observationDigest
 };
 return {payload,receipt:s.signValidator(payload)};
}

test('OPT-002 positive: real AOT execution yields authentic trace chain and full receipt with PENDING validator slot',async()=>{
 await withSelected(async s=>{
  const {captured,verified}=await captureTrace(s);
  assert.equal(captured.traceId,s.runId);
  assert.equal(captured.receipt.version,'dis.opt002.full-receipt/1');
  assert.equal(captured.receipt.privacyScope,'local-only');
  assert.equal(captured.receipt.validatorSlot.status,'PENDING');
  assert.equal(captured.receipt.validatorSlot.validatorIdentity,null);
  assert.equal(captured.receipt.validatorSlot.endorsement,null);
  assert.equal(captured.receipt.validatorSlot.reason,'EXTERNAL_AUTHORITY_MISSING');
  assert.equal(verified.traceVerified,true);
  assert.equal(verified.receiptVerified,true);
  assert.equal(verified.reason,'EXTERNAL_AUTHORITY_MISSING');
  assert.equal(verified.validatorSlot.status,'PENDING');
  noAuthority(verified);
  const p=captured.traceReceipt.payload;
  assert.equal(captured.receipt.content.inputDigest,p.inputDigest);
  assert.equal(captured.receipt.content.observationDigest,p.observationDigest);
  assert.equal(captured.receipt.content.aotDigest,s.f.artifact.digest);
  assert.equal(captured.observation.kind,'OBSERVATION');
  assert.equal(captured.observation.evidence.attested,false);
 });
});

test('OPT-002 negative: tampered trace payload, observation, signature and pre-endorsed slot are all rejected',async()=>{
 await withSelected(async s=>{
  const {captured}=await captureTrace(s);
  const tamperedPayload={...captured.traceReceipt.payload,disposition:'QUALIFIED'};
  const bad=verifyOpt002Trace({
   verifier:s.verifier,envelope:captured.receipt,
   traceReceipt:{payload:tamperedPayload,signature:captured.traceReceipt.signature},
   input:captured.input,observation:captured.observation,runId:s.runId
  });
  assert.equal(bad.status,'UNKNOWN');
  assert.equal(bad.receiptVerified,false);
  noAuthority(bad);
  // fresh capture: verifier consumes each trace exactly once
  const s2=await (async()=>{
   const runId='run:opt002-r0-tamper-'+(++run);
   const input={channel:'cli',requestId:runId,
    url:'https://example.com/media/opt002-r0.mp4',declaredBytes:2048};
   return {runId,input};
  })();
  const c2=await captureOpt002Trace({issuer:s.issuer,input:s2.input,runId:s2.runId});
  assert.equal(c2.status,'TRACE_CAPTURED');
  const mutatedObservation={...c2.observation,disposition:'QUALIFIED'};
  const badObs=verifyOpt002Trace({
   verifier:s.verifier,envelope:c2.receipt,traceReceipt:c2.traceReceipt,
   input:c2.input,observation:mutatedObservation,runId:s2.runId
  });
  assert.equal(badObs.status,'UNKNOWN');
  assert.equal(badObs.receiptVerified,false);
  const runId3='run:opt002-r0-tamper2-'+(++run);
  const input3={channel:'cli',requestId:runId3,
   url:'https://example.com/media/opt002-r0.mp4',declaredBytes:2048};
  const c3=await captureOpt002Trace({issuer:s.issuer,input:input3,runId:runId3});
  const badSig=verifyOpt002Trace({
   verifier:s.verifier,envelope:c3.receipt,
   traceReceipt:{payload:c3.traceReceipt.payload,signature:'A'.repeat(86)},
   input:c3.input,observation:c3.observation,runId:runId3
  });
  assert.equal(badSig.status,'UNKNOWN');
  assert.equal(badSig.receiptVerified,false);
  const endorsedSlot={status:'ENDORSED',validatorIdentity:{},endorsement:{},reason:null};
  const claimed={...c3.receipt,validatorSlot:endorsedSlot};
  const badSlot=verifyOpt002Trace({
   verifier:s.verifier,envelope:claimed,traceReceipt:c3.traceReceipt,
   input:c3.input,observation:c3.observation,runId:runId3
  });
  assert.equal(badSlot.status,'UNKNOWN');
  assert.equal(badSlot.reason,'OPT002_VALIDATOR_SLOT_CLAIMS_AUTHORITY');
  noAuthority(badSlot);
 });
});

test('OPT-002 holdout: disjoint partition registers; second use, holdout-as-source and cross-set leak are refused',async()=>{
 const registry=createOpt002HoldoutRegistry();
 const synthesis=[{sourceCohort:'cohort:src-a',independentCaseKey:'case:a1',runId:'run:ha1'},
  {sourceCohort:'cohort:src-b',independentCaseKey:'case:b1',runId:'run:hb1'}];
 const holdout=[{sourceCohort:'cohort:holdout-c',independentCaseKey:'case:c1',runId:'run:hc1'}];
 const negative=[{sourceCohort:'cohort:neg-d',independentCaseKey:'case:d1',runId:'run:hd1'}];
 const ok=registry.registerPartition({synthesis,holdout,negative});
 assert.equal(ok.status,'DISJOINT');
 assert.equal(ok.disjoint,true);
 assert.equal(registry.claimUsage({sourceCohort:'cohort:src-a',role:'synthesis'}).status,'REGISTERED');
 const second=registry.claimUsage({sourceCohort:'cohort:src-a',role:'synthesis'});
 assert.equal(second.status,'REFUSED');
 assert.equal(second.reason,'SOURCE_DATA_SECOND_USE_REFUSED');
 const leak=registry.claimUsage({sourceCohort:'cohort:holdout-c',role:'synthesis'});
 assert.equal(leak.status,'REFUSED');
 assert.equal(leak.reason,'HOLDOUT_DATA_USE_AS_SOURCE_REFUSED');
 const overlapping=createOpt002HoldoutRegistry();
 const crossed=overlapping.registerPartition({
  synthesis:[{sourceCohort:'cohort:same'}],
  holdout:[{sourceCohort:'cohort:same'}],
  negative:[]
 });
 assert.equal(crossed.status,'LEAKED');
 assert.equal(crossed.reason,'SOURCE_COHORT_CROSSES_SETS');
 const caseBridge=createOpt002HoldoutRegistry();
 const bridged=caseBridge.registerPartition({
  synthesis:[{sourceCohort:'cohort:x',independentCaseKey:'case:shared'}],
  holdout:[{sourceCohort:'cohort:y',independentCaseKey:'case:shared'}],
  negative:[]
 });
 assert.equal(bridged.status,'LEAKED');
 assert.equal(bridged.reason,'CASE_OR_RUN_CROSSES_SETS');
});

test('OPT-002 reuse policy: METHOD requests re-execute; RESULT stays blocked before and after structural holdout verification',async()=>{
 await withSelected(async s=>{
  const {captured}=await captureTrace(s);
  const inputDigest=captured.traceReceipt.payload.inputDigest;
  const base={
   contractDigest:DIGEST,targetProfile:'profile:r211-o2',scope:SCOPE,
   privacyScope:'local-only'
  };
  const current={...base,reuseKind:'METHOD_REUSE',methodSignature:'m:inspect:1'};
  const method=evaluateOpt002Reuse({
   candidate:{...current},current
  });
  assert.equal(method.decision,'METHOD_REUSE_REEXECUTE_AND_REVALIDATE');
  assert.equal(method.reusable,false);
  assert.equal(method.mustReexecute,true);
  assert.equal(method.mustRevalidate,true);
  assert.equal(method.effectReplay,false);
  const mismatch=evaluateOpt002Reuse({
   candidate:{...base,reuseKind:'METHOD_REUSE',methodSignature:'m:other:2'},current
  });
  assert.equal(mismatch.decision,'METHOD_SIGNATURE_MISMATCH');
  const registry=createOpt002HoldoutRegistry();
  registry.registerPartition({
   synthesis:[{sourceCohort:'cohort:src-a'}],
   holdout:[{sourceCohort:'cohort:holdout-c'}],
   negative:[{sourceCohort:'cohort:neg-d'}]
  });
  const resultCurrent={...base,reuseKind:'RESULT_REUSE',inputDigest,
   currentness:'CURRENT'};
  const resultCandidate={...base,reuseKind:'RESULT_REUSE',inputDigest,immutable:true};
  const unverified=evaluateOpt002Reuse({
   registry,candidate:resultCandidate,current:resultCurrent
  });
  assert.equal(unverified.decision,'RESULT_REUSE_BLOCKED_HOLDOUT_UNVERIFIED');
  assert.equal(unverified.reusable,false);
  const payload={
   version:OPT002_HOLDOUT_VERSION,scope:SCOPE,holdoutCohort:'cohort:holdout-c',
   inputDigest,ruleDigest:RULE,verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
   experienceIssued:false,effectDispatched:false
  };
  const structural=evaluateOpt002Reuse({
   registry,candidate:resultCandidate,current:resultCurrent,
   holdoutVerification:s.signValidator(payload),validatorPublicKey:s.validatorKeys.publicKey
  });
  assert.equal(structural.decision,'RESULT_REUSE_BLOCKED_INDEPENDENT_BUSINESS_VALIDATION_MISSING');
  assert.equal(structural.reason,'EXTERNAL_AUTHORITY_MISSING');
  assert.equal(structural.structuralHoldoutVerified,true);
  assert.equal(structural.reusable,false);
  const foreign=generateKeyPairSync('ed25519');
  const forged=evaluateOpt002Reuse({
   registry,candidate:resultCandidate,current:resultCurrent,
   holdoutVerification:s.signValidator(payload),validatorPublicKey:foreign.publicKey
  });
  assert.equal(forged.decision,'HOLDOUT_VERIFICATION_SIGNATURE_INVALID');
  assert.equal(forged.structuralHoldoutVerified,false);
  const unknownCohort=evaluateOpt002Reuse({
   registry,candidate:resultCandidate,current:resultCurrent,
   holdoutVerification:s.signValidator({...payload,holdoutCohort:'cohort:never-registered'}),
   validatorPublicKey:s.validatorKeys.publicKey
  });
  assert.equal(unknownCohort.decision,'HOLDOUT_COHORT_NOT_REGISTERED');
 });
});

test('OPT-002 privacy/consent: validator access and export fail closed without consent; consent never enables export directly',async()=>{
 const ledger=createOpt002ConsentLedger();
 const blocked=guardOpt002ValidatorAccess({ledger,subjectCohort:'cohort:holdout-c'});
 assert.equal(blocked.status,'DENIED');
 assert.equal(blocked.reason,'VALIDATOR_ACCESS_DENIED_NO_CONSENT');
 noAuthority(blocked);
 const blockedExport=guardOpt002Export({ledger,subjectCohort:'cohort:holdout-c',sanitized:true});
 assert.equal(blockedExport.status,'DENIED');
 assert.equal(blockedExport.reason,'EXPORT_DENIED_NO_CONSENT');
 const record=ledger.issue({
  consentId:'consent:opt002-r0-1',subjectCohort:'cohort:holdout-c',
  purpose:'validator-review',grantedBy:'owner:local-data-controller'
 });
 assert.equal(record.consentId,'consent:opt002-r0-1');
 assert.throws(()=>ledger.issue({
  consentId:'consent:opt002-r0-1',subjectCohort:'cohort:other',
  purpose:'validator-review',grantedBy:'owner:local-data-controller'
 }),/OPT002_CONSENT_DUPLICATE/);
 const released=guardOpt002ValidatorAccess({ledger,subjectCohort:'cohort:holdout-c'});
 assert.equal(released.status,'RELEASED_LOCAL_ONLY');
 assert.equal(released.exportAllowed,false);
 noAuthority(released);
 const unsanitized=guardOpt002Export({ledger,subjectCohort:'cohort:holdout-c',sanitized:false});
 assert.equal(unsanitized.status,'DENIED');
 assert.equal(unsanitized.reason,'EXPORT_DENIED_UNSANITIZED');
 const reviewable=guardOpt002Export({ledger,subjectCohort:'cohort:holdout-c',sanitized:true});
 assert.equal(reviewable.status,'SUBMISSION_REVIEW_REQUIRED');
 assert.equal(reviewable.exportAllowed,false);
 noAuthority(reviewable);
});

test('OPT-002 validator admission: technical verdict admitted with EXTERNAL_AUTHORITY_MISSING; self-asserted identity flagged FORGERY',async()=>{
 await withSelected(async s=>{
  const {captured}=await captureTrace(s);
  const {payload,receipt}=validatorReceiptFor(s,captured.traceReceipt);
  const pin=provisionOpt002ValidatorPin({
   validatorId:'validator:local-test-pin',publicKey:s.validatorKeys.publicKey,
   provisionedBy:'LOCAL_TEST_PIN'
  });
  const admitted=admitOpt002Validator({
   pin,validatorReceipt:receipt,evidenceGate:s.gate,
   traceReceipt:captured.traceReceipt,input:captured.input,
   observation:captured.observation,runId:s.runId
  });
  assert.equal(admitted.status,'ADMITTED_TECHNICAL');
  assert.equal(admitted.reason,'EXTERNAL_AUTHORITY_MISSING');
  assert.equal(admitted.traceVerified,true);
  assert.equal(admitted.validatorSignatureVerified,true);
  assert.equal(admitted.validatorSlot.status,'PENDING');
  assert.equal(admitted.validatorSlot.validatorIdentity.provisionedBy,'LOCAL_TEST_PIN');
  noAuthority(admitted);
  // self-signed identity claim: claim key == verdict signing key
  const claimKey=s.validatorKeys;
  const identityClaim={
   validatorId:'validator:independent-business-x',
   publicKey:claimKey.publicKey.export({format:'der',type:'spki'}).toString('base64url'),
   selfSignature:sign(null,Buffer.from(JSON.stringify({
    validatorId:'validator:independent-business-x',
    publicKey:claimKey.publicKey.export({format:'der',type:'spki'}).toString('base64url')
   })),claimKey.privateKey).toString('base64url')
  };
  const selfAsserted=admitOpt002Validator({
   pin,validatorReceipt:{...receipt,identityClaim},evidenceGate:s.gate,
   traceReceipt:captured.traceReceipt,input:captured.input,
   observation:captured.observation,runId:s.runId
  });
  assert.equal(selfAsserted.status,'FORGERY');
  assert.equal(selfAsserted.reason,'VALIDATOR_IDENTITY_SELF_ASSERTED');
  assert.equal(selfAsserted.claimedValidatorId,'validator:independent-business-x');
  noAuthority(selfAsserted);
  const foreign=generateKeyPairSync('ed25519');
  const foreignClaim={
   validatorId:'validator:other',
   publicKey:foreign.publicKey.export({format:'der',type:'spki'}).toString('base64url'),
   selfSignature:'A'.repeat(86)
  };
  const unverifiable=admitOpt002Validator({
   pin,validatorReceipt:{...receipt,identityClaim:foreignClaim},evidenceGate:s.gate,
   traceReceipt:captured.traceReceipt,input:captured.input,
   observation:captured.observation,runId:s.runId
  });
  assert.equal(unverifiable.status,'FORGERY');
  assert.equal(unverifiable.reason,'VALIDATOR_IDENTITY_CLAIM_UNVERIFIABLE');
  noAuthority(unverifiable);
  assert.throws(()=>provisionOpt002ValidatorPin({
   validatorId:'validator:x',publicKey:s.validatorKeys.publicKey,
   provisionedBy:'SELF_PROVISIONED'
  }),/OPT002_VALIDATOR_PIN_INVALID/);
 });
});

test('OPT-002 validator admission: wrong-key verdict is rejected and does not consume the legitimate trace',async()=>{
 await withSelected(async s=>{
  const {captured}=await captureTrace(s);
  const {payload}=validatorReceiptFor(s,captured.traceReceipt);
  const foreign=generateKeyPairSync('ed25519');
  const foreignReceipt={
   payload,
   signature:sign(null,Buffer.from(JSON.stringify(payload)),foreign.privateKey).toString('base64url')
  };
  const pin=provisionOpt002ValidatorPin({
   validatorId:'validator:local-test-pin',publicKey:s.validatorKeys.publicKey,
   provisionedBy:'LOCAL_TEST_PIN'
  });
  const rejected=admitOpt002Validator({
   pin,validatorReceipt:foreignReceipt,evidenceGate:s.gate,
   traceReceipt:captured.traceReceipt,input:captured.input,
   observation:captured.observation,runId:s.runId
  });
  assert.equal(rejected.status,'REJECTED');
  assert.equal(rejected.reason,'O2_VALIDATOR_SIGNATURE_INVALID');
  assert.equal(rejected.traceVerified,false);
  // original trace not burned: a correct verdict still verifies
  const {receipt}=validatorReceiptFor(s,captured.traceReceipt);
  const admitted=admitOpt002Validator({
   pin,validatorReceipt:receipt,evidenceGate:s.gate,
   traceReceipt:captured.traceReceipt,input:captured.input,
   observation:captured.observation,runId:s.runId
  });
  assert.equal(admitted.status,'ADMITTED_TECHNICAL');
  assert.equal(admitted.traceVerified,true);
  noAuthority(admitted);
 });
});

test('OPT-002 experience: structural verification never becomes eligibility; gate reports explicit NOT_ELIGIBLE',async()=>{
 await withSelected(async s=>{
  const {captured}=await captureTrace(s);
  const {receipt}=validatorReceiptFor(s,captured.traceReceipt);
  const withoutValidator=evaluateOpt002Experience({
   observation:captured.observation,traceReceipt:captured.traceReceipt,
   context:{privacyScope:'local-only'}
  });
  assert.equal(withoutValidator.status,'NOT_ELIGIBLE');
  assert.equal(withoutValidator.experienceIssued,false);
  assert.equal(withoutValidator.exportAllowed,false);
  assert.equal(withoutValidator.privacyScope,'local-only');
  const withValidator=evaluateOpt002Experience({
   observation:captured.observation,traceReceipt:captured.traceReceipt,
   validatorReceipt:receipt,context:{privacyScope:'local-only'}
  });
  assert.equal(withValidator.status,'NOT_ELIGIBLE');
  assert.equal(withValidator.experienceIssued,false);
  noAuthority(withValidator);
  const forged={...captured.observation,
   evidence:{...captured.observation.evidence,attested:true}};
  const forgedInput=evaluateOpt002Experience({
   observation:forged,traceReceipt:captured.traceReceipt,
   validatorReceipt:receipt,context:{privacyScope:'local-only'}
  });
  assert.equal(forgedInput.status,'NOT_ELIGIBLE');
  assert.equal(forgedInput.experienceIssued,false);
 });
});

test('OPT-002 full pipeline: trace, consent release, holdout partition and METHOD reuse compose without minting any authority',async()=>{
 await withSelected(async s=>{
  const {captured,verified}=await captureTrace(s);
  const ledger=createOpt002ConsentLedger();
  ledger.issue({
   consentId:'consent:opt002-pipeline',subjectCohort:'cohort:holdout-c',
   purpose:'validator-review',grantedBy:'owner:local-data-controller'
  });
  const access=guardOpt002ValidatorAccess({
   ledger,subjectCohort:'cohort:holdout-c',
   traceSummary:{traceId:s.runId,inputDigest:captured.traceReceipt.payload.inputDigest}
  });
  assert.equal(access.status,'RELEASED_LOCAL_ONLY');
  const registry=createOpt002HoldoutRegistry();
  const partition=registry.registerPartition({
   synthesis:[{sourceCohort:'cohort:src-a',independentCaseKey:'case:a1',runId:'run:p1'}],
   holdout:[{sourceCohort:'cohort:holdout-c',independentCaseKey:'case:c1',runId:'run:p2'}],
   negative:[{sourceCohort:'cohort:neg-d',independentCaseKey:'case:d1',runId:'run:p3'}]
  });
  assert.equal(partition.status,'DISJOINT');
  const method=evaluateOpt002Reuse({
   candidate:{contractDigest:DIGEST,targetProfile:'profile:r211-o2',scope:SCOPE,
    privacyScope:'local-only',reuseKind:'METHOD_REUSE',methodSignature:'m:inspect:1'},
   current:{contractDigest:DIGEST,targetProfile:'profile:r211-o2',scope:SCOPE,
    privacyScope:'local-only',reuseKind:'METHOD_REUSE',methodSignature:'m:inspect:1'}
  });
  assert.equal(method.decision,'METHOD_REUSE_REEXECUTE_AND_REVALIDATE');
  assert.equal(verified.reason,'EXTERNAL_AUTHORITY_MISSING');
  noAuthority(verified);
  noAuthority(access);
  noAuthority(method);
 });
});
