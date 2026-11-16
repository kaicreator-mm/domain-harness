import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gitBlobSha} from '../dis-v020-cross-project/consumer.mjs';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {createControlledTraceIssuer} from './o2-controlled-execution-trace.mjs';
import {createO4ThreeKeyServerCandidatePreflight} from './o4-three-key-server-preflight.mjs';
import {persistSolutionCandidate,revokeStoredCandidate} from './snapshots/formal-tools/packages/runner/js/solution-store.mjs';
import {consumeVerifiedO4Candidate} from './o4-candidate-consumer.mjs';

const SCOPE='tenant:dis-o4-g6-consumer',RULE='d'.repeat(64);
const Z3_SHA='e9d7e6e6d76c81b5ea3f06d165fc4cfd8afab92b74cdf94417380b5eed10845d';
const G4_MODEL_SET_SHA256='ccffedd71e77e85faea3a98aee7e8b9a0bb3242d3b5e7fbf4103a974b571c7f2';
const sha=x=>createHash('sha256').update(x).digest('hex');
const signed=(payload,key)=>({
 payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64url')
});
const pins=JSON.parse(await readFile(new URL('./fixtures/formal-tools-g4-source-pins.json',import.meta.url),'utf8'));

test('formal-tools G4 store snapshots are byte-identical to pinned main source',async()=>{
 assert.equal(pins.repository,'kaicreator-mm/formal-tools');
 assert.equal(pins.commit,'319367063177dec22a6df64233fae2a5fceef00f');
 assert.equal(pins.model_set.status,'PENDING_INDEPENDENT_REVIEW');
 assert.equal(pins.model_set.commit,'9c279eb6f3509c95a2c8f9016c39b2848bbe014f');
 for(const entry of pins.files){
  const bytes=await readFile(new URL('./'+entry.snapshot,import.meta.url));
  assert.equal(gitBlobSha(bytes),entry.gitBlob,entry.path);
 }
});

function g4Fixture({sourceSha,modelSha}){
 const problem={
  schema:'formal-tools/problem-spec/0.1',problem_id:'dis.xdownload.o4_candidate_consumer',
  source_refs:[{id:'xdownload_interaction',sha256:sourceSha,classification:'PUBLIC',
   purpose:'source-pinned xDownload Interaction Function',consumer:'formal_tools'}],
  requirements:[{id:'r1',source_ref:'xdownload_interaction',
   text:'The selected xDownload Interaction Functions return observations and never dispatch an Effect.'}],
  claims:[{id:'claim1',text:'The selected xDownload Interaction Functions return observations only.',
   kind:'bounded_model',requirement_ids:['r1'],source_refs:['xdownload_interaction'],
   capability_ids:['logic.smt']}],
  oracles:[{id:'xdownload_oracle',source_ref:'xdownload_interaction',frozen:true,
   positive_case_ids:['valid_confirmation'],negative_case_ids:['unsafe_url','oversized_input'],
   review_identity:'unattested_demo_oracle'}],
  capability_ids:['logic.smt'],
  budget:{max_steps:3,max_depth:3,max_cost_units:10,max_total_time_ms:10000,max_retries:0},
  policy:{allowed_tools:['z3'],allowed_operations:{z3:['solve']},destination:'LOCAL',
   max_input_classification:'PUBLIC',allow_network:false}
 };
 const method={
  schema:'formal-tools/method-proposal/0.1',method_id:'xdownload_observation_method',
  problem_id:problem.problem_id,goal_claim_ids:['claim1'],oracle_ids:['xdownload_oracle'],
  semantic_review:'PENDING',
  steps:[{id:'step01',tool_id:'z3',operation:'solve',claim_ids:['claim1'],
   provides:['logic.smt'],depends_on:[],source_refs:['xdownload_interaction'],
   estimated_cost_units:2,timeout_ms:300,destination:'LOCAL',output_classification:'PUBLIC'}]
 };
 const provenance={
  schema:'formal-tools/solution-provenance/0.1',
  source_id:'xdownload_interaction',source_sha256:sourceSha,
  oracle_id:'xdownload_oracle',oracle_sha256:sourceSha,
  model_sha256:modelSha,tool_id:'z3',tool_version:'5.4.0',
  tool_binary_sha256:Z3_SHA,platform:'debian13-x86_64',
  evidence_sha256:sha(Buffer.from('NOT_RUN:xdownload-method-not-executed')),
  evidence_gate:'NOT_RUN'
 };
 return {problem,method,provenance,
  problem_json:JSON.stringify(problem),method_json:JSON.stringify(method),
  provenance_json:JSON.stringify(provenance)};
}

async function withScenario(visit){
 const fixture=await makeNativeFixture();
 const app=await loadDisV020Aot(fixture.artifact,{
  expectedDigest:fixture.artifact.digest,registry:fixture.registry,
  store:new PlainCasDocStore(),tenantId:SCOPE
 });
 const storeDir=mkdtempSync(join(tmpdir(),'dis-o4-g6-candidate-'));
 try{
  const sourceBytes=await readFile(new URL('../dis-v020-interaction/download-goal.mjs',import.meta.url));
  const g4=g4Fixture({sourceSha:sha(sourceBytes),modelSha:pins.model_set.sha256});
  assert.equal(pins.model_set.sha256,G4_MODEL_SET_SHA256);
  assert.notEqual(g4.provenance.model_sha256,fixture.artifact.digest,
   'formal Model Set digest must not alias the selected DIS AOT digest');
  const stored=await persistSolutionCandidate({store_dir:storeDir,
   problem_json:g4.problem_json,method_json:g4.method_json,provenance_json:g4.provenance_json});
  assert.equal(stored.status,'CANDIDATE_PERSISTED',JSON.stringify(stored));
  assert.equal(stored.record_write,'NEW');
  const trace=generateKeyPairSync('ed25519');
  const validator=generateKeyPairSync('ed25519');
  const review=generateKeyPairSync('ed25519');
  const runId='run:o4-g6-consumer-1';
  const input={channel:'cli',requestId:runId,
   url:'https://example.com/media/o4-consumer.mp4',declaredBytes:2048};
  const issuer=createControlledTraceIssuer({
   app,privateKey:trace.privateKey,publicKey:trace.publicKey,
   scope:SCOPE,expectedAotDigest:fixture.artifact.digest
  });
  const captured=await issuer.capture({input,runId});
  assert.equal(captured.status,'ISSUED_TRACE_ONLY');
  const candidateBytes=Buffer.from(JSON.stringify({
   schema:'dis.o4.server-meta-candidate/2',scope:SCOPE,runId,
   selectedAotDigest:fixture.artifact.digest,modelSha256:g4.provenance.model_sha256,
   sourceSha256:g4.provenance.source_sha256,
   ruleDigest:RULE,selectedFunction:'xdownload.interaction.inspect',
   continuationFunction:'xdownload.interaction.confirm',disposition:'CANDIDATE_PREFLIGHT_ONLY',
   solutionCandidateSha256:stored.candidate_sha256,input
  }));
  const validatorPayload={
   version:'dis.o2.independent-validator/1',scope:SCOPE,runId,
   aotDigest:fixture.artifact.digest,ruleDigest:RULE,
   traceSignature:captured.receipt.signature,
   observationDigest:captured.receipt.payload.observationDigest,
   verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
   experienceIssued:false,effectDispatched:false
  };
  const validatorReceipt=signed(validatorPayload,validator.privateKey);
  const proposalPayload={
   version:'dis.o4.server-candidate-preflight/1',scope:SCOPE,runId,
   selectedAotDigest:fixture.artifact.digest,ruleDigest:RULE,
   traceSignature:captured.receipt.signature,validatorSignature:validatorReceipt.signature,
   observationDigest:captured.receipt.payload.observationDigest,
   proposalDigest:sha(candidateBytes),consentScope:'local-only',
   disposition:'CANDIDATE_PREFLIGHT_ONLY',authorizedPromotion:false
  };
  const config={
   tracePublicKey:trace.publicKey,validatorPublicKey:validator.publicKey,
   serverReviewPublicKey:review.publicKey,scope:SCOPE,
   expectedAotDigest:fixture.artifact.digest,expectedRuleDigest:RULE
  };
  const gate=createO4ThreeKeyServerCandidatePreflight(config);
  const preflight=gate.verifyProposal({
   candidateEnvelope:signed(proposalPayload,review.privateKey),
   validatorReceipt,traceReceipt:captured.receipt,input,
   observation:captured.observation,runId,candidateBytes
  });
  assert.equal(preflight.status,'CANDIDATE_PREFLIGHT_VERIFIED_TECHNICAL_ONLY');
  return await visit({app,storeDir,stored,g4,fixture,preflight,candidateBytes,input});
 }finally{
  await app.stop();
  rmSync(storeDir,{recursive:true,force:true});
 }
}

function countedApp(app){
 let calls=0,ids=[];
 const wrapped=Object.create(app);
 wrapped.invoke=async(id,...args)=>{calls++;ids.push(id);return app.invoke(id,...args)};
 return {app:wrapped,get calls(){return calls},get ids(){return [...ids]}};
}

test('G6 consumes only the immutable verified Base64 snapshot through the real xDownload DIS AOT',async()=>{
 await withScenario(async s=>{
  const counted=countedApp(s.app);
  s.candidateBytes.fill(0); // caller-owned Buffer is no longer the consumer input
  const result=await consumeVerifiedO4Candidate({
   preflightResult:s.preflight,app:counted.app,expectedScope:SCOPE,
   expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:s.g4.provenance_json
  });
  assert.equal(result.status,'CONSUMED_OBSERVATION_ONLY',JSON.stringify(result));
  assert.equal(result.candidateStoreStatus,'REPLAY_BLOCKED_UNQUALIFIED');
  assert.equal(result.solutionReplay,'BLOCKED_UNQUALIFIED');
  assert.equal(result.domainOutcome,'READY_FOR_KDP');
  assert.equal(result.effectDispatched,false);
  assert.equal(result.authority,'NONE');
  assert.equal(result.qualified,false);
  assert.equal(result.solutionPromotable,false);
  assert.deepEqual(counted.ids,[
   'xdownload.interaction.inspect','xdownload.interaction.confirm'
  ]);
 });
});

test('G6 rejects a substituted Base64 snapshot before invoking the Domain App',async()=>{
 await withScenario(async s=>{
  const counted=countedApp(s.app);
  const first=s.preflight.candidateBytesBase64[0]==='A'?'B':'A';
  const tampered={...s.preflight,candidateBytesBase64:first+s.preflight.candidateBytesBase64.slice(1)};
  const result=await consumeVerifiedO4Candidate({
   preflightResult:tampered,app:counted.app,expectedScope:SCOPE,
   expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:s.g4.provenance_json
  });
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'O4_VERIFIED_SNAPSHOT_DIGEST_MISMATCH');
  assert.equal(counted.calls,0);
 });
});

test('G6 propagates G4 tool-version drift and explicit revocation before any Domain App call',async()=>{
 await withScenario(async s=>{
  const counted=countedApp(s.app);
  const drift={...s.g4.provenance,tool_version:'5.4.1'};
  const stale=await consumeVerifiedO4Candidate({
   preflightResult:s.preflight,app:counted.app,expectedScope:SCOPE,
   expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:JSON.stringify(drift)
  });
  assert.equal(stale.status,'STALE');
  assert.deepEqual(stale.changedFields,['tool_version']);
  assert.equal(counted.calls,0);
  const revoked=await revokeStoredCandidate({
   store_dir:s.storeDir,candidate_sha256:s.stored.candidate_sha256,reason:'ORACLE_REVOKED'
  });
  assert.equal(revoked.status,'INVALIDATED');
  const invalidated=await consumeVerifiedO4Candidate({
   preflightResult:s.preflight,app:counted.app,expectedScope:SCOPE,
   expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:s.g4.provenance_json
  });
  assert.equal(invalidated.status,'INVALIDATED');
  assert.equal(invalidated.reason,'G4_REVOCATION_TOMBSTONE');
  assert.equal(counted.calls,0);
 });
});

test('G6 refuses a different selected AOT even when the G4 candidate remains unchanged',async()=>{
 await withScenario(async s=>{
  const wrong=Object.create(s.app);
  Object.defineProperty(wrong,'aotDigest',{value:'f'.repeat(64)});
  const counted=countedApp(wrong);
  const result=await consumeVerifiedO4Candidate({
   preflightResult:s.preflight,app:counted.app,expectedScope:SCOPE,
   expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:s.g4.provenance_json
  });
  assert.equal(result.status,'STALE');
  assert.equal(result.reason,'DIS_SELECTED_AOT_DRIFT');
  assert.equal(counted.calls,0);
 });
});

test('G6 rejects G4 Model Set drift independently from selected DIS AOT digest',async()=>{
 await withScenario(async s=>{
  const counted=countedApp(s.app);
  assert.notEqual(s.g4.provenance.model_sha256,s.fixture.artifact.digest);
  const drift={...s.g4.provenance,model_sha256:'f'.repeat(64)};
  const result=await consumeVerifiedO4Candidate({
   preflightResult:s.preflight,app:counted.app,expectedScope:SCOPE,
   expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:JSON.stringify(drift)
  });
  assert.equal(result.status,'STALE');
  assert.equal(result.reason,'G4_SOURCE_OR_MODEL_PROVENANCE_MISMATCH');
  assert.equal(counted.calls,0);
 });
});
