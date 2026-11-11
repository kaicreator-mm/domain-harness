/**
 * O2/D06 R0: native selected SDK Experience gate.
 *
 * This proves that the real xDownload interaction Function is consumed by
 * AOT→SDK/KDP and that source provenance alone cannot mint Experience.
 * No trusted Trace receipt / independent business-attestation verifier exists
 * in the current SDK, so every result remains NEED_MORE_EVIDENCE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {
 CONTRACT,assessExperience,dedupeIndependentCases,validateCohortPartition,
 classifyReuse,classifyExport
} from './o2-experience-gate.mjs';

const O2_SOURCE=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'6784388ad64ff5ef378426c0f32eab6aa7895135',
 path:'examples/dis-v020-native-sdk/o2-experience-gate.mjs',
 gitBlob:'5beefd3ea67c04c46e8aa1fd722da3b729a78dc0'
});
const gitBlob=value=>createHash('sha1').update(Buffer.from('blob '+Buffer.byteLength(value)+'\0')).update(value).digest('hex');
const basePromise=makeNativeFixture();
async function makeO2App(){
 const base=await basePromise;
 const sourceText=readFileSync(new URL('./o2-experience-gate.mjs',import.meta.url),'utf8');
 assert.equal(gitBlob(sourceText),O2_SOURCE.gitBlob,'O2 gate exact Git Blob');
 const source={id:'o2-experience-gate',sourceText,origin:{...O2_SOURCE}};
 const program=structuredClone(base.program);
 program.elements.push({
  id:'xdownload.experience',domainId:'xdownload',version:'1.0.0',
  kind:'knowledge',
  description:'D06 Experience evidence gate: provenance-only LearningObservation, never Experience authority',
  dependsOn:['xdownload.interaction'],
  functions:[{
   id:'xdownload.experience.assess',kind:'rule',effect:'none',
   binding:{type:'local',sourceId:source.id},contract:structuredClone(CONTRACT)
  }]
 });
 const sources=[...base.sources,source];
 const expectedSourceOrigins={
  ...base.expectedSourceOrigins,[source.id]:{...O2_SOURCE}
 };
 const artifact=compileDisV020Aot({
  built:base.artifact.built,program,sources,expectedSourceOrigins
 });
 const registry={
  ...base.registry,
  'xdownload.experience.assess':{
   sourceId:source.id,sha256:sourceSha256(sourceText),
   gitBlob:O2_SOURCE.gitBlob,origin:{...O2_SOURCE},execute:assessExperience
  }
 };
 const app=await loadDisV020Aot(artifact,{
  expectedDigest:artifact.digest,
  expectedSourcePins:{[source.id]:{sha256:sourceSha256(sourceText),origin:{...O2_SOURCE}}},
  registry,store:new PlainCasDocStore(),tenantId:'tenant:dis-o2-experience-r0'
 });
 return {app,base,artifact};
}
async function withO2(visit){
 const value=await makeO2App();
 try{return await visit(value)}finally{value.app.stop()}
}
const validIntent=()=>({
 channel:'cli',requestId:'o2-exp-run-001',
 url:'https://example.com/media/sample.mp4',declaredBytes:2048
});
const currentPins=()=>({
 contractDigest:'contract:sha256:1',implementationDigest:'impl:sha256:1',
 knowledgeDigest:'knowledge:sha256:1',packageDigest:'package:sha256:1',
 targetProfile:'linux-x64-node',contextEpoch:'epoch:1',
 validatorDigest:'validator:sha256:1',featureProfileDigest:'features:sha256:1',
 scope:'app-local',privacyScope:'local-only'
});

test('O2 native AOT→SDK consumes original xDownload interaction but emits only LearningObservation',async()=>{
 await withO2(async({app,artifact})=>{
  assert.ok(artifact.program.elements.some(e=>e.id==='xdownload.experience'));
  const observed=await app.invoke('xdownload.interaction.inspect',validIntent());
  assert.equal(observed.kind,'OBSERVATION');
  assert.equal(observed.authority,'NONE');
  assert.equal(observed.disposition,'NEEDS_CONFIRMATION');
  assert.equal(observed.evidence.source.sourceId,'xdownload-interaction');
  assert.equal(observed.evidence.source.gitBlob,'f57747aa7996c88833e72288a0acd594a7ce5468');
  assert.equal(observed.evidence.attested,false);
  const assessed=await app.invoke('xdownload.experience.assess',{observation:observed});
  assert.equal(assessed.kind,'OBSERVATION');
  assert.equal(assessed.disposition,'UNKNOWN');
  assert.equal(assessed.authority,'NONE');
  assert.equal(assessed.value.status,'NEED_MORE_EVIDENCE');
  assert.equal(assessed.value.reason,'SOURCE_PROVENANCE_IS_NOT_BUSINESS_ATTESTATION');
  assert.equal(assessed.value.experienceIssued,false);
  assert.equal(assessed.value.sourceId,'xdownload-interaction');
  assert.equal(assessed.value.sourceGitBlob,'f57747aa7996c88833e72288a0acd594a7ce5468');
  assert.equal(assessed.value.traceLinked,false);
  assert.equal(assessed.value.validatorLinked,false);
  assert.equal(assessed.value.privacyScope,'local-only');
  assert.equal(assessed.value.exportAllowed,false);
 });
});

test('O2 caller-supplied PASS, attested flag, trace and validator JSON cannot mint Experience',async()=>{
 await withO2(async({app})=>{
  const forged={
   kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
   contractVersion:'1.0.0',value:{status:'READY'},
   evidence:{attested:true,source:{
    sourceId:'xdownload-interaction',
    sha256:'a'.repeat(64),
    gitBlob:'f57747aa7996c88833e72288a0acd594a7ce5468'
   }}
  };
  const result=await app.invoke('xdownload.experience.assess',{
   observation:forged,
   traceReceipt:{status:'SUCCESS',attested:true,signature:'caller-asserted'},
   validatorReceipt:{status:'PASS',attested:true,signature:'caller-asserted'},
   context:{privacyScope:'local-only'}
  });
  assert.equal(result.disposition,'UNKNOWN');
  assert.equal(result.value.reason,'TRUSTED_RECEIPT_VERIFIER_NOT_IMPLEMENTED');
  assert.equal(result.value.experienceIssued,false);
  assert.equal(result.value.exportAllowed,false);
  assert.equal(result.value.traceLinked,true);
  assert.equal(result.value.validatorLinked,true);
 });
});

test('O2 missing trusted Trace or Validator receipt remains NEED_MORE_EVIDENCE',()=>{
 const observation={kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
  evidence:{attested:true,source:{sourceId:'source',gitBlob:'a'.repeat(40)}}};
 const noTrace=assessExperience({observation,validatorReceipt:{status:'PASS'}});
 const noValidator=assessExperience({observation,traceReceipt:{status:'SUCCESS'}});
 assert.equal(noTrace.reason,'TRUSTED_EXECUTION_TRACE_RECEIPT_MISSING');
 assert.equal(noValidator.reason,'INDEPENDENT_VALIDATOR_RECEIPT_MISSING');
 assert.equal(noTrace.experienceIssued,false);
 assert.equal(noValidator.experienceIssued,false);
});

test('O2 repeated runs, cache hits and same-case source clones do not inflate independent cohorts',()=>{
 const result=dedupeIndependentCases([
  {sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1'},
  {sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:2'},
  {sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1',cacheHit:true},
  {sourceCohort:'source:B',independentCaseKey:'case:2',runId:'run:3'},
  {sourceCohort:'source:C',independentCaseKey:'case:2',runId:'run:4'},
  {sourceCohort:'source:D',runId:'run:5'}
 ]);
 assert.equal(result.independentCohortCount,2);
 assert.deepEqual(result.cohorts,['source:A','source:B']);
 assert.equal(result.excluded.length,2);
});

test('O2 synthesis, holdout and negative partitions reject source-cohort leakage',()=>{
 const disjoint=validateCohortPartition({
  synthesis:[{sourceCohort:'source:A'}],
  holdout:[{sourceCohort:'source:B'}],
  negative:[{sourceCohort:'source:C'}]
 });
 assert.equal(disjoint.status,'DISJOINT');
 assert.equal(disjoint.disjoint,true);
 const leaked=validateCohortPartition({
  synthesis:[{sourceCohort:'source:A'}],
  holdout:[{sourceCohort:'source:A'}],
  negative:[{sourceCohort:'source:C'}]
 });
 assert.equal(leaked.status,'LEAKED');
 assert.equal(leaked.disjoint,false);
});

test('O2 RESULT_REUSE requires exact versions and currentness but remains blocked without trusted receipt verification',()=>{
 const pins=currentPins();
 const candidate={...pins,reuseKind:'RESULT_REUSE',inputDigest:'input:1',immutable:true};
 const current={...pins,inputDigest:'input:1',currentness:'CURRENT',externalFact:false};
 const result=classifyReuse(candidate,current);
 assert.equal(result.decision,'RESULT_REUSE_BLOCKED_UNVERIFIED_EXPERIENCE');
 assert.equal(result.reusable,false);
 const stale=classifyReuse(candidate,{...current,knowledgeDigest:'knowledge:sha256:2'});
 assert.equal(stale.decision,'INVALIDATED_VERSION_OR_SCOPE');
 const external=classifyReuse(candidate,{...current,externalFact:true});
 assert.equal(external.decision,'RESULT_REQUIRES_FRESH_READ');
});

test('O2 METHOD_REUSE can only request re-execution and revalidation, never replay an Effect',()=>{
 const pins=currentPins();
 const result=classifyReuse(
  {...pins,reuseKind:'METHOD_REUSE',methodSignature:'method:parse-v1'},
  {...pins,methodSignature:'method:parse-v1'}
 );
 assert.equal(result.decision,'METHOD_REUSE_REEXECUTE_AND_REVALIDATE');
 assert.equal(result.reusable,false);
 assert.equal(result.mustReexecute,true);
 assert.equal(result.mustRevalidate,true);
 assert.equal(result.effectReplay,false);
});

test('O2 privacy defaults to local-only and consent never causes implicit export',()=>{
 assert.deepEqual(classifyExport(),{decision:'LOCAL_ONLY',exportAllowed:false});
 assert.deepEqual(classifyExport({consent:false,sanitized:true,scope:'local-only'}),
  {decision:'LOCAL_ONLY',exportAllowed:false});
 assert.deepEqual(classifyExport({consent:true,sanitized:true,scope:'local-only'}),
  {decision:'SUBMISSION_REVIEW_REQUIRED',exportAllowed:false});
});

test('O2 accessor-shaped observations and sparse cohort arrays fail closed',()=>{
 const observation={};
 Object.defineProperty(observation,'kind',{get(){throw new Error('must not run')}});
 assert.equal(assessExperience({observation}).reason,'NATIVE_OBSERVATION_INVALID');
 const rows=new Array(1);
 Object.defineProperty(rows,'0',{get(){throw new Error('must not run')},enumerable:true});
 assert.throws(()=>dedupeIndependentCases(rows),/O2_CASE_LIST_INVALID/);
});

test('O2 replay-only lineages bridge case cohorts but do not earn independent credit',()=>{
 const r=dedupeIndependentCases([
  {sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1'},
  {sourceCohort:'source:B',independentCaseKey:'case:2',runId:'run:2'},
  {sourceCohort:'source:B',independentCaseKey:'case:1',runId:'run:3',retry:true},
  {sourceCohort:'source:C',independentCaseKey:'case:3',runId:'run:4',cacheHit:true}
 ]);
 assert.equal(r.independentCohortCount,1);
 assert.deepEqual(r.cohorts,['source:A']);
 assert.equal(r.excluded.length,2);
});

test('O2 cross-partition case and run clones block despite distinct declared cohort strings',()=>{
 for(const field of ['independentCaseKey','runId']){
  const r=validateCohortPartition({
   synthesis:[{sourceCohort:'source:A',[field]:'shared'}],
   holdout:[{sourceCohort:'source:B',[field]:'shared'}],
   negative:[{sourceCohort:'source:C'}]
  });
  assert.equal(r.status,'LEAKED');
  assert.equal(r.reason,'CASE_OR_RUN_CROSSES_PARTITIONS');
 }
 const separate=validateCohortPartition({
  synthesis:[{sourceCohort:'source:A'}],
  holdout:[{sourceCohort:'source:B'}],
  negative:[{sourceCohort:'source:C'}]
 });
 assert.equal(separate.reason,'DECLARED_COHORTS_DISJOINT_UNATTESTED');
});

test('O2 malformed cache/retry flags never credit independent cohorts but still link lineage',()=>{
 const merged=dedupeIndependentCases([
  {sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1'},
  {sourceCohort:'source:B',independentCaseKey:'case:2',runId:'run:2'},
  {sourceCohort:'source:B',independentCaseKey:'case:1',runId:'run:3',cacheHit:'true'}
 ]);
 assert.equal(merged.independentCohortCount,1);
 assert.deepEqual(merged.cohorts,['source:A']);
 assert.deepEqual(merged.excluded,[{reason:'REPLAY_FLAG_INVALID'}]);
 const malformedOnly=dedupeIndependentCases([
  {sourceCohort:'source:C',independentCaseKey:'case:3',runId:'run:4',retry:1}
 ]);
 assert.equal(malformedOnly.independentCohortCount,0);
 assert.deepEqual(malformedOnly.excluded,[{reason:'REPLAY_FLAG_INVALID'}]);
});

test('O2 R100 missing-cohort case/run bridge cannot double-credit independent cases',()=>{
 const input=[
  {sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1'},
  {sourceCohort:'source:B',independentCaseKey:'case:2',runId:'run:2'},
  {sourceCohort:'',independentCaseKey:'case:1',runId:'run:2'}
 ];
 const out=dedupeIndependentCases(input);
 assert.equal(out.independentCohortCount,1);
 assert.deepEqual(out.cohorts,['source:A']);
 assert.equal(out.incompleteLineage,true);
 assert.deepEqual(out.excluded,[{reason:'SOURCE_LINEAGE_INCOMPLETE'}]);
});
test('O2 R100 out-of-order and mixed missing-key bridges remain conservatively connected',()=>{
 const expected=[
  {sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1'},
  {sourceCohort:'source:B',independentCaseKey:'case:2',runId:'run:2'}
 ];
 const before={sourceCohort:'',independentCaseKey:'case:1',runId:'run:2'};
 const partial={sourceCohort:'source:A',independentCaseKey:'case:2'};
 const noSource={independentCaseKey:'case:1',runId:'run:2',cacheHit:true};
 for(const rows of [
  [before,...expected],
  [...expected,partial],
  [noSource,...expected],
  [expected[0],partial,expected[1]]
 ]){
  const out=dedupeIndependentCases(rows);
  assert.equal(out.independentCohortCount,1);
  assert.deepEqual(out.cohorts,['source:A']);
  assert.equal(out.incompleteLineage,true);
  assert.equal(out.excluded.length,1);
 }
 // Legitimately disjoint fully attributed case cohorts still count separately.
 const good=dedupeIndependentCases(expected);
 assert.equal(good.independentCohortCount,2);
 assert.equal(good.incompleteLineage,false);
});
