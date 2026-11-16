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
const snapshotUrl=path=>new URL('./snapshots/formal-tools/'+path,import.meta.url);
const snapshotJson=async path=>JSON.parse(await readFile(snapshotUrl(path),'utf8'));

test('formal-tools G4 store snapshots are byte-identical to pinned main source',async()=>{
 assert.equal(pins.repository,'kaicreator-mm/formal-tools');
 assert.equal(pins.commit,'6991c7aae1026ea9bda9d49f43139e92437f0493');
 assert.equal(pins.model_set.status,'ACCEPT_SCOPED_MERGED');
 assert.equal(pins.model_set.accepted_review_head,'8669555a4e035f824647e39411620f7095b0c0b1');
 assert.equal(pins.g4_method.upstream_commit,pins.commit);
 assert.equal(pins.g4_method.evidence_gate,'BYTES_BOUND_UNATTESTED');
 assert.equal(pins.g4_method.candidate_qualification,'NOT_ADMITTED');
 assert.equal(pins.g4_method.native_invocations,20);
 assert.equal(pins.model_set.commit,'2f573d4d5989b6dbf19d96584fef7ae6e66cbf2');
 for(const entry of [...pins.files,...pins.g4_method.files]){
  const bytes=await readFile(new URL('./'+entry.snapshot,import.meta.url));
  assert.equal(gitBlobSha(bytes),entry.gitBlob,entry.path);
 }
});

test('G6 binds committed xDownload G4 Method and native two-pair source bytes',async()=>{
 const b='benchmarks/llm-methods/g4/';
 const e='validation/xdownload-interaction-2026-11-16/';
 const [problem,method,provenance,modelSet,index,pair,rerun]=await Promise.all([
  snapshotJson(b+'PROBLEM.json'),snapshotJson(b+'METHOD.json'),
  snapshotJson(b+'PROVENANCE.json'),snapshotJson(b+'MODEL_SET.json'),
  snapshotJson(e+'EVIDENCE_INDEX.json'),snapshotJson(e+'PAIR.json'),
  snapshotJson(e+'PAIR-RERUN.json')
 ]);
 const [modelBytes,indexBytes,pairBytes,rerunBytes,sourceBytes]=await Promise.all([
  readFile(snapshotUrl(b+'MODEL_SET.json')),
  readFile(snapshotUrl(e+'EVIDENCE_INDEX.json')),
  readFile(snapshotUrl(e+'PAIR.json')),
  readFile(snapshotUrl(e+'PAIR-RERUN.json')),
  readFile(new URL('../dis-v020-interaction/download-goal.mjs',import.meta.url))
 ]);
 assert.equal(gitBlobSha(sourceBytes),'f57747aa7996c88833e72288a0acd594a7ce5468');
 assert.equal(provenance.source_sha256,sha(sourceBytes));
 assert.equal(provenance.oracle_sha256,provenance.source_sha256,
  'the legacy same-source Oracle is not independent professional Oracle evidence');
 assert.equal(provenance.model_sha256,sha(modelBytes));
 assert.equal(provenance.evidence_sha256,sha(indexBytes));
 assert.equal(index.model_set.sha256,sha(modelBytes));
 assert.equal(index.evidence[0].sha256,sha(pairBytes));
 assert.equal(index.evidence[1].sha256,sha(rerunBytes));
 assert.equal(index.source.sha256,sha(sourceBytes));
 assert.equal(method.problem_id,problem.problem_id);
 assert.equal(method.steps.length,10);
 assert.equal(modelSet.cases.length,5);
 assert.equal(provenance.tool_binary_sha256,Z3_SHA);
 assert.equal(provenance.evidence_gate,'BYTES_BOUND_UNATTESTED');
 assert.equal(pair.pair_agreement.agree,5);
 assert.equal(pair.pair_agreement.disagree,0);
 assert.equal(rerun.pair_agreement.agree,5);
 assert.equal(rerun.execution_summary.native_invocations,10);
 assert.equal(rerun.execution_summary.exit_code_zero,10);
 assert.equal(pins.g4_method.native_invocations,20);
 for(const fixture of modelSet.cases){
  const bytes=await readFile(snapshotUrl(fixture.path));
  assert.equal(sha(bytes),fixture.sha256,fixture.id);
 }
 for(const pack of [pair,rerun]){
  assert.equal(pack.observations.length,5);
  for(const observation of pack.observations){
   for(const tool of ['z3','cvc5']){
    const result=observation.solvers[tool];
    const stdout=await readFile(snapshotUrl(result.stdout_path));
    assert.equal(sha(stdout),result.stdout_sha256,observation.id+' '+tool);
    assert.equal(stdout.toString('utf8').trim().toUpperCase(),observation.expected_status);
    assert.equal(result.exit_code,0);
    assert.equal(result.stderr_empty,true);
    if(result.stderr_path){
     const stderr=await readFile(snapshotUrl(result.stderr_path));
     assert.equal(sha(stderr),result.stderr_sha256,observation.id+' '+tool+' stderr');
    }
   }
  }
 }
});

async function g4Fixture({sourceSha,modelSha}){
 // These are exact copies of merged formal-tools G4 evidence: not a synthetic
 // replacement Method, not newly executed solvers, and not an Oracle grant.
 const b='benchmarks/llm-methods/g4/';
 const [problemBytes,methodBytes,provenanceBytes]=await Promise.all([
  readFile(snapshotUrl(b+'PROBLEM.json')),
  readFile(snapshotUrl(b+'METHOD.json')),
  readFile(snapshotUrl(b+'PROVENANCE.json'))
 ]);
 const problem=JSON.parse(problemBytes.toString('utf8'));
 const method=JSON.parse(methodBytes.toString('utf8'));
 const provenance=JSON.parse(provenanceBytes.toString('utf8'));
 assert.equal(problem.source_refs.find(x=>x.id==='xdownload_interaction')?.sha256,sourceSha);
 assert.equal(provenance.source_sha256,sourceSha);
 assert.equal(provenance.oracle_sha256,sourceSha);
 assert.equal(provenance.model_sha256,modelSha);
 assert.equal(provenance.tool_binary_sha256,Z3_SHA);
 assert.equal(provenance.evidence_gate,'BYTES_BOUND_UNATTESTED');
 assert.equal(provenance.schema,'formal-tools/solution-provenance/0.1');
 assert.equal(method.steps.length,10);
 return {problem,method,provenance,
  problem_json:problemBytes.toString('utf8'),
  method_json:methodBytes.toString('utf8'),
  provenance_json:provenanceBytes.toString('utf8')};
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
  const g4=await g4Fixture({sourceSha:sha(sourceBytes),modelSha:pins.model_set.sha256});
  assert.equal(pins.model_set.sha256,G4_MODEL_SET_SHA256);
  assert.notEqual(g4.provenance.model_sha256,fixture.artifact.digest,
   'formal Model Set digest must not alias the selected DIS AOT digest');
  assert.equal(g4.provenance.oracle_sha256,g4.provenance.source_sha256,
   'current G4 Candidate schema binds this unattested demo Oracle to its source; it is not an independent Oracle');
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
   sourceSha256:g4.provenance.source_sha256,oracleSha256:g4.provenance.oracle_sha256,
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
 let calls=0,ids=[],inputs=[];
 const wrapped=Object.create(app);
 Object.defineProperty(wrapped,'invoke',{value:async(id,...args)=>{calls++;ids.push(id);inputs.push(args[0]);return app.invoke(id,...args)}});
 return {app:wrapped,get calls(){return calls},get ids(){return [...ids]},get inputs(){return [...inputs]}};
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
  // The internal exactDataRecord snapshot is null-prototype by design; only
  // a fixed-key, frozen ordinary DTO may cross the selected Function ABI.
  assert.equal(Object.getPrototypeOf(counted.inputs[0]),Object.prototype);
  assert.equal(Object.isFrozen(counted.inputs[0]),true);
  assert.equal(Object.getPrototypeOf(counted.inputs[1]),Object.prototype);
 });
});

test('G6 rejects a substituted Base64 snapshot before invoking the Domain App',async()=>{
 await withScenario(async s=>{
  const counted=countedApp(s.app);
  const mutable={...s.preflight};
  const mutableResult=await consumeVerifiedO4Candidate({
   preflightResult:mutable,app:counted.app,expectedScope:SCOPE,
   expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:s.g4.provenance_json
  });
  assert.equal(mutableResult.status,'BLOCKED');
  assert.equal(mutableResult.reason,'O4_PREFLIGHT_RESULT_NOT_DIRECT');
  assert.equal(counted.calls,0);
  const first=s.preflight.candidateBytesBase64[0]==='A'?'B':'A';
  const tampered=Object.freeze({...s.preflight,candidateBytesBase64:first+s.preflight.candidateBytesBase64.slice(1)});
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

test('G6 rejects G4 Source and Oracle identity/hash drift before Domain App invocation',async()=>{
 await withScenario(async s=>{
  const counted=countedApp(s.app);
  const drifts=[
   ['source_sha256','f'.repeat(64),'G4_SOURCE_OR_MODEL_PROVENANCE_MISMATCH'],
   ['source_id','different_source','G4_PROVENANCE_DRIFT'],
   ['oracle_sha256','e'.repeat(64),'G4_SOURCE_OR_MODEL_PROVENANCE_MISMATCH'],
   ['oracle_id','different_oracle','G4_PROVENANCE_DRIFT']
  ];
  for(const [field,value,reason] of drifts){
   const changed={...s.g4.provenance,[field]:value};
   const result=await consumeVerifiedO4Candidate({
    preflightResult:s.preflight,app:counted.app,expectedScope:SCOPE,
    expectedRuleDigest:RULE,storeDir:s.storeDir,currentProvenanceJson:JSON.stringify(changed)
   });
   assert.equal(result.status,'STALE',field+': '+JSON.stringify(result));
   assert.equal(result.reason,reason,field);
   if(reason==='G4_PROVENANCE_DRIFT')assert.deepEqual(result.changedFields,[field]);
   assert.equal(counted.calls,0,field);
  }
 });
});
