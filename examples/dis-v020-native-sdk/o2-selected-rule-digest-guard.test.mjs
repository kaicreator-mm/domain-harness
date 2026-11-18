/** O2 R172 native Node>=24: source-bound candidate is NOT installed Rule authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {createControlledTraceIssuer} from './o2-controlled-execution-trace.mjs';
import {createO2IndependentValidatorEvidenceGate} from './o2-independent-validator-evidence.mjs';
import {inspectO2SelectedRuleDigestSource,deriveO2SelectedRuleCandidate} from './o2-selected-rule-digest-guard.mjs';

const fixturePromise=makeNativeFixture();
const TENANT='tenant:dis-o2-r172-source';
const CLOCK=1795000000000;
const FN='tally.assessTaskEvidence';
const noAuthority=result=>{
 for(const k of ['qualified','ruleInstalled','ruleActivated','experienceIssued',
  'effectDispatched','exportAllowed','installedRuleAttested'])
  assert.equal(result[k],false,k);
 assert.equal(result.authority,'NONE');
};
async function selected(fn){
 const fixture=await fixturePromise;
 const app=await loadDisV020Aot(fixture.artifact,{
  expectedDigest:fixture.artifact.digest,registry:fixture.registry,
  store:new PlainCasDocStore(),tenantId:TENANT
 });
 try{
  const source=fixture.sources.find(x=>x.id==='tally-business');
  assert.ok(source);
  const candidate=deriveO2SelectedRuleCandidate({
   aotDigest:fixture.artifact.digest,scope:TENANT,sourceText:source.sourceText
  });
  const claim={scope:TENANT,aotDigest:fixture.artifact.digest,
   ruleDigest:candidate,issuedAtMs:CLOCK-1000,expiresAtMs:CLOCK+1000};
  const config={app,artifact:fixture.artifact,program:fixture.program,
   sources:fixture.sources,registry:fixture.registry,
   expectedScope:TENANT,expectedAotDigest:fixture.artifact.digest,
   claim,nowEpochMs:CLOCK};
  return await fn({app,fixture,candidate,claim,config});
 }finally{app.stop()}
}

test('source byte pin + actual selected AOT/SDK Rule Function: correct candidate remains BLOCKED without installed Rule attestation',async()=>{
 await selected(async({app,candidate,config})=>{
  assert.ok(app.functions.includes(FN));
  const r=await inspectO2SelectedRuleDigestSource(config);
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.reason,'BLOCKED_MISSING_INSTALLED_RULE_ATTESTATION');
  assert.equal(r.sourceBoundCandidateVerified,true);
  assert.equal(r.sourceBoundCandidateDigest,candidate);
  assert.equal(r.originalSourceGitBlob,'54015fb63ffb13b4f4e562f660d2172098b5f7f4');
  assert.equal(r.selectedObservation,'OBSERVATION_ONLY');
  assert.equal(r.tenantIdentityAttested,false);
  noAuthority(r);
 });
});

test('forged hex RuleDigest and previous self-declared synthetic 64 hex rejected as STALE, not successful Rule proof',async()=>{
 await selected(async({config,claim})=>{
  for(const fake of ['c'.repeat(64),'f'.repeat(64)]){
   const r=await inspectO2SelectedRuleDigestSource({...config,claim:{...claim,ruleDigest:fake}});
   assert.equal(r.status,'STALE');assert.equal(r.reason,'O2_RULE_DIGEST_NOT_DERIVED_FROM_SELECTED_SOURCE');
   noAuthority(r);
  }
  const schema=await inspectO2SelectedRuleDigestSource({...config,claim:{...claim,ruleDigest:'not-hex'}});
  assert.equal(schema.reason,'O2_RULE_CLAIM_SCHEMA_INVALID');noAuthority(schema);
 });
});

test('tenant/AOT drift and temporal expiry/future issued claims deny before Rule observation',async()=>{
 await selected(async({config,claim})=>{
  for(const [options,code,status] of [
   [{claim:{...claim,scope:'tenant:forged'}},'O2_RULE_TENANT_SCOPE_DRIFT','STALE'],
   [{claim:{...claim,aotDigest:'a'.repeat(64)}},'O2_RULE_AOT_CLAIM_DRIFT','STALE'],
   [{nowEpochMs:claim.expiresAtMs},'O2_RULE_CLAIM_EXPIRED_OR_FUTURE','STALE'],
   [{nowEpochMs:claim.issuedAtMs-1},'O2_RULE_CLAIM_EXPIRED_OR_FUTURE','STALE'],
   [{claim:{...claim,expiresAtMs:claim.issuedAtMs+86400001}},'O2_RULE_CLAIM_EXPIRED_OR_FUTURE','STALE'],
   [{expectedScope:'tenant:other'},'O2_RULE_TENANT_SCOPE_DRIFT','STALE'],
   [{expectedAotDigest:'b'.repeat(64)},'O2_RULE_AOT_CLAIM_DRIFT','STALE']
  ]){
   const r=await inspectO2SelectedRuleDigestSource({...config,...options});
   assert.equal(r.reason,code);assert.equal(r.status,status);noAuthority(r);
  }
 });
});

test('stale original Git Blob, changed bytes, registry source drift and missing selected Rule Function fail closed',async()=>{
 await selected(async({config,fixture,app})=>{
  const badSource=fixture.sources.map(s=>s.id==='tally-business'?{...s,sourceText:s.sourceText+'\n// drift\n'}:s);
  const changed=await inspectO2SelectedRuleDigestSource({...config,sources:badSource});
  assert.equal(changed.reason,'O2_RULE_ORIGINAL_SOURCE_PIN_INVALID');noAuthority(changed);
  const missing=await inspectO2SelectedRuleDigestSource({...config,
   sources:fixture.sources.filter(s=>s.id!=='tally-business')});
  assert.equal(missing.reason,'O2_RULE_ORIGINAL_SOURCE_PIN_INVALID');noAuthority(missing);
  const wrongRegistry={...fixture.registry,[FN]:{...fixture.registry[FN],sha256:'0'.repeat(64)}};
  const wrong=await inspectO2SelectedRuleDigestSource({...config,registry:wrongRegistry});
  assert.equal(wrong.reason,'O2_RULE_ORIGINAL_SOURCE_PIN_INVALID');noAuthority(wrong);
  const fakeApp={state:'READY',aotDigest:app.aotDigest,functions:['xdownload.describePolicy'],
   contractVersions:{},invoke:async()=>{throw Error('SHOULD_NOT_RUN')}};
  const absent=await inspectO2SelectedRuleDigestSource({...config,app:fakeApp});
  assert.equal(absent.reason,'O2_RULE_SELECTED_AOT_OR_FUNCTION_DRIFT');noAuthority(absent);
  const staleApp={...fakeApp,functions:[FN],contractVersions:{[FN]:'1.0.0'},
   aotDigest:'0'.repeat(64)};
  const stale=await inspectO2SelectedRuleDigestSource({...config,app:staleApp});
  assert.equal(stale.reason,'O2_RULE_SELECTED_AOT_OR_FUNCTION_DRIFT');noAuthority(stale);
 });
});

test('untrusted Proxy/accessor Rule claim rejected without executing traps',async()=>{
 await selected(async({config,claim})=>{
  let probes=0;
  const proxy=new Proxy({...claim},{get(){probes++;throw Error('trap')},
   getPrototypeOf(){probes++;throw Error('trap')},
   ownKeys(){probes++;throw Error('trap')}});
  const result=await inspectO2SelectedRuleDigestSource({...config,claim:proxy});
  assert.equal(result.reason,'O2_RULE_CLAIM_UNSAFE');assert.equal(probes,0);noAuthority(result);
  const getter={...claim};
  Object.defineProperty(getter,'ruleDigest',{enumerable:true,get(){probes++;throw Error('getter')}});
  const result2=await inspectO2SelectedRuleDigestSource({...config,claim:getter});
  assert.equal(result2.reason,'O2_RULE_CLAIM_UNSAFE');assert.equal(probes,0);noAuthority(result2);
 });
});

test('valid original two-key signatures with synthetic RULE still do not establish selected Rule provenance',async()=>{
 await selected(async({config,claim,app,fixture})=>{
  const traceKeys=generateKeyPairSync('ed25519');
  const validatorKeys=generateKeyPairSync('ed25519');
  const runId='run:dis-r172-proof-gap';
  const input={channel:'cli',requestId:runId,url:'https://example.com/only',declaredBytes:16};
  const issuer=createControlledTraceIssuer({app,privateKey:traceKeys.privateKey,
   publicKey:traceKeys.publicKey,scope:TENANT,expectedAotDigest:fixture.artifact.digest});
  const trace=await issuer.capture({input,runId});
  assert.equal(trace.status,'ISSUED_TRACE_ONLY');
  const synthetic='c'.repeat(64);
  const payload={version:'dis.o2.independent-validator/1',scope:TENANT,runId,
   aotDigest:fixture.artifact.digest,ruleDigest:synthetic,
   traceSignature:trace.receipt.signature,observationDigest:trace.receipt.payload.observationDigest,
   verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
   experienceIssued:false,effectDispatched:false};
  const validatorReceipt={payload,
   signature:sign(null,Buffer.from(JSON.stringify(payload)),validatorKeys.privateKey).toString('base64url')};
  const oldGate=createO2IndependentValidatorEvidenceGate({
   tracePublicKey:traceKeys.publicKey,validatorPublicKey:validatorKeys.publicKey,
   scope:TENANT,expectedAotDigest:fixture.artifact.digest,expectedRuleDigest:synthetic
  });
  const old=oldGate.consume({validatorReceipt,traceReceipt:trace.receipt,
   input,observation:trace.observation,runId});
  assert.equal(old.status,'VALIDATOR_RECEIPT_VERIFIED_TECHNICAL');
  assert.equal(old.qualified,false);assert.equal(old.experienceIssued,false);
  const guard=await inspectO2SelectedRuleDigestSource({...config,
   claim:{...claim,ruleDigest:synthetic}});
  assert.equal(guard.status,'STALE');
  assert.equal(guard.reason,'O2_RULE_DIGEST_NOT_DERIVED_FROM_SELECTED_SOURCE');
  noAuthority(guard);
 });
});
