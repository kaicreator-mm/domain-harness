/** DIS O4 R147 actual AOT→SDK, triple independent Ed25519 technical preflight. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {createControlledTraceIssuer} from './o2-controlled-execution-trace.mjs';
import {createO4ThreeKeyServerCandidatePreflight} from './o4-three-key-server-preflight.mjs';

const SCOPE='tenant:dis-o4-r147-native',RULE='c'.repeat(64),base=makeNativeFixture();
const sha=x=>createHash('sha256').update(x).digest('hex');
const signed=(payload,key)=>({
 payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64url')
});
let seq=0;
const denied=x=>{
 assert.equal(x.status,'UNKNOWN');
 for(const key of ['qualified','experienceIssued','governanceApproved','serverPromotionAuthorized',
  'newAotBuilt','newAotActivated','artifactExported','effectDispatched'])
  assert.equal(x[key],false,key);
 assert.equal(x.authority,'NONE');
};
const limited=x=>{
 assert.equal(x.status,'CANDIDATE_PREFLIGHT_VERIFIED_TECHNICAL_ONLY');
 assert.equal(x.technicalEnvelopeVerified,true);
 assert.equal(x.traceVerified,true);
 assert.equal(x.validatorSignatureVerified,true);
 assert.equal(x.serverReviewSignatureVerified,true);
 for(const key of ['qualified','experienceIssued','governanceApproved','serverPromotionAuthorized',
  'newAotBuilt','newAotActivated','artifactExported','effectDispatched'])
  assert.equal(x[key],false,key);
 assert.equal(x.authority,'NONE');
};
async function withSelected(visit){
 const f=await base;
 const app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:SCOPE
 });
 try{
  const trace=generateKeyPairSync('ed25519');
  const validator=generateKeyPairSync('ed25519');
  const review=generateKeyPairSync('ed25519');
  const runId='run:o4-r147-'+(++seq);
  const request={channel:'cli',requestId:runId,
   url:'https://example.com/media/o4-review.mp4',declaredBytes:2048};
  const issuer=createControlledTraceIssuer({
   app,privateKey:trace.privateKey,publicKey:trace.publicKey,
   scope:SCOPE,expectedAotDigest:f.artifact.digest
  });
  const captured=await issuer.capture({input:request,runId});
  assert.equal(captured.status,'ISSUED_TRACE_ONLY');
  const validatorPayload={
   version:'dis.o2.independent-validator/1',scope:SCOPE,runId,
   aotDigest:f.artifact.digest,ruleDigest:RULE,
   traceSignature:captured.receipt.signature,
   observationDigest:captured.receipt.payload.observationDigest,
   verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
   experienceIssued:false,effectDispatched:false
  };
  const vReceipt=signed(validatorPayload,validator.privateKey);
  const candidatePayload={
   version:'dis.o4.server-candidate-preflight/1',scope:SCOPE,runId,
   selectedAotDigest:f.artifact.digest,ruleDigest:RULE,
   traceSignature:captured.receipt.signature,validatorSignature:vReceipt.signature,
   observationDigest:captured.receipt.payload.observationDigest,
   proposalDigest:sha('fixed-research-candidate:'+runId),
   consentScope:'local-only',disposition:'CANDIDATE_PREFLIGHT_ONLY',
   authorizedPromotion:false
  };
  const config={
   tracePublicKey:trace.publicKey,validatorPublicKey:validator.publicKey,
   serverReviewPublicKey:review.publicKey,scope:SCOPE,
   expectedAotDigest:f.artifact.digest,expectedRuleDigest:RULE
  };
  const gate=(changes={})=>createO4ThreeKeyServerCandidatePreflight({...config,...changes});
  const packet=(p=candidatePayload,v=vReceipt)=>({
   candidateEnvelope:signed(p,review.privateKey),
   validatorReceipt:v,traceReceipt:captured.receipt,
   input:request,observation:captured.observation,runId
  });
  return await visit({app,config,trace,validator,review,runId,gate,packet,
   candidatePayload,validatorPayload,vReceipt,captured});
 }finally{app.stop()}
}

test('O4 true selected AOT SDK: 3 independent signatures prove technical proposal preflight only',async()=>{
 await withSelected(({app,gate,packet,candidatePayload})=>{
  const g=gate(),out=g.verifyProposal(packet());
  limited(out);
  assert.equal(out.proposalDigest,candidatePayload.proposalDigest);
  assert.equal(out.scope,'LOCAL_TECHNICAL_PREFLIGHT_ONLY');
  assert.equal((g.verifyProposal(packet())).reason,'O4_ORIGINAL_TWO_KEY_EVIDENCE_NOT_VERIFIED');
  assert.equal(typeof app.activateLocalRule,'undefined');
 });
});

test('O4 forged third signature cannot consume valid Trace/Validator before a later valid proposal',async()=>{
 await withSelected(({gate,packet})=>{
  const g=gate(),bad=packet();
  bad.candidateEnvelope={...bad.candidateEnvelope,signature:'A'.repeat(86)};
  const deniedResult=g.verifyProposal(bad);
  denied(deniedResult);
  assert.equal(deniedResult.reason,'O4_SERVER_REVIEW_SIGNATURE_INVALID');
  limited(g.verifyProposal(packet()));
 });
});

test('O4 wrong verdict and scope/target/consent or forged authority cannot preflight or burn Host Trace',async()=>{
 await withSelected(({gate,packet,candidatePayload,validator,validatorPayload})=>{
  const g=gate({maxAttempts:12});
  for(const change of [
   {scope:'tenant:other'},
   {selectedAotDigest:'f'.repeat(64)},
   {ruleDigest:'e'.repeat(64)},
   {consentScope:'upload'},
   {disposition:'APPROVED'},
   {authorizedPromotion:true},
   {proposalDigest:candidatePayload.selectedAotDigest}
  ]){
   const x=g.verifyProposal(packet({...candidatePayload,...change}));
   denied(x);
   assert.equal(x.reason,'O4_PROPOSAL_SCOPE_OR_POLICY_MISMATCH');
  }
  const failedReceipt=signed({...validatorPayload,verdict:'FAIL'},validator.privateKey);
  const failedEnvelope={...candidatePayload,validatorSignature:failedReceipt.signature};
  const y=g.verifyProposal(packet(failedEnvelope,failedReceipt));denied(y);
  assert.equal(y.reason,'O4_PROPOSAL_SCOPE_OR_POLICY_MISMATCH');
  limited(g.verifyProposal(packet()));
 });
});

test('O4 malformed nested Proxy, Getter and duplicated keys never execute attacker traps',async()=>{
 await withSelected(({gate,packet,config})=>{
  const g=gate({maxAttempts:5});
  let traps=0;
  const proxy=new Proxy({},{
   get(){traps++;throw Error('ATTACKER_GET')},
   getPrototypeOf(){traps++;throw Error('ATTACKER_PROTO')},
   ownKeys(){traps++;throw Error('ATTACKER_KEYS')}
  });
  const x=packet();
  x.candidateEnvelope=proxy;
  denied(g.verifyProposal(x));
  const y=packet();
  Object.defineProperty(y,'candidateEnvelope',{
   enumerable:true,get(){traps++;throw Error('ATTACKER_GETTER')}
  });
  denied(g.verifyProposal(y));
  const z=packet();z.validatorReceipt=proxy;
  denied(g.verifyProposal(z));
  assert.equal(traps,0);
  assert.throws(()=>gate({serverReviewPublicKey:config.validatorPublicKey}),
   /O4_THREE_SIGNER_KEYS_NOT_INDEPENDENT/);
  limited(g.verifyProposal(packet()));
 });
});

test('O4 attempts are reserved before work; no approval after max budget',async()=>{
 await withSelected(({gate,packet})=>{
  const g=gate({maxAttempts:1});
  const x=packet();x.candidateEnvelope.signature='A'.repeat(86);
  denied(g.verifyProposal(x));
  const out=g.verifyProposal(packet());denied(out);
  assert.equal(out.reason,'O4_PREFLIGHT_ATTEMPT_BUDGET_EXHAUSTED');
  assert.equal(g.state().remaining,0);
  assert.equal(g.state().serverPromotionAuthorized,false);
 });
});
