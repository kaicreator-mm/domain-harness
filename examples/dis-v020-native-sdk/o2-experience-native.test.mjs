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
 commit:'2490e7655f79b6f3c40e7dd2f395b1dddab738f2',
 path:'examples/dis-v020-native-sdk/o2-experience-gate.mjs',
 gitBlob:'2f82147348ceb39b8577f3c982b1f968fe72c3ca'
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

test('O2 R101 blank padded and noncanonical source case run tokens never mint independent cohorts',()=>{
 const canonical={sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1'};
 for(const field of ['sourceCohort','independentCaseKey','runId']){
  for(const malformed of [' ','  ',' padded ', '\u200bhidden', 'Cafe\u0301']){
   const result=dedupeIndependentCases([{...canonical,[field]:malformed}]);
   assert.equal(result.independentCohortCount,0,field+':'+malformed);
   assert.equal(result.incompleteLineage,true,field+':'+malformed);
   assert.deepEqual(result.excluded,[{reason:'SOURCE_LINEAGE_INCOMPLETE'}]);
  }
 }
});
test('O2 R101 padded aliases never receive credit and do not break conservative bridge grouping',()=>{
 const a={sourceCohort:'source:A',independentCaseKey:'case:1',runId:'run:1'};
 const padded={sourceCohort:' source:A ',independentCaseKey:'case:2',runId:'run:2'};
 const bridge={sourceCohort:'source:B',independentCaseKey:'case:1',runId:'run:2',retry:true};
 for(const input of [[a,padded,bridge],[bridge,padded,a],[padded,a,bridge]]){
  const out=dedupeIndependentCases(input);
  assert.equal(out.independentCohortCount,1);
  assert.deepEqual(out.cohorts,['source:A']);
  assert.equal(out.incompleteLineage,true);
  assert.equal(out.excluded.length,2);
 }
 const genuine=dedupeIndependentCases([
  {sourceCohort:'source:North America',independentCaseKey:'case:group one',runId:'run:unit one'},
  {sourceCohort:'source:East Asia',independentCaseKey:'case:group two',runId:'run:unit two'}
 ]);
 assert.equal(genuine.independentCohortCount,2);
 assert.equal(genuine.incompleteLineage,false);
});
test('O2 R101 partition fail closes on blank padded noncanonical lineage without rejecting internal spaces',()=>{
 const valid={
  synthesis:[{sourceCohort:'source:North America',independentCaseKey:'case:group one',runId:'run:unit one'}],
  holdout:[{sourceCohort:'source:East Asia',independentCaseKey:'case:group two',runId:'run:unit two'}],
  negative:[{sourceCohort:'source:South Asia',independentCaseKey:'case:group three',runId:'run:unit three'}]
 };
 assert.equal(validateCohortPartition(valid).status,'DISJOINT');
 for(const cohort of [' ','  ',' source:North America ','\u200bghost','Cafe\u0301']){
  const input=structuredClone(valid);
  input.synthesis[0].sourceCohort=cohort;
  const result=validateCohortPartition(input);
  assert.equal(result.status,'UNKNOWN');
  assert.equal(result.disjoint,false);
  assert.equal(result.reason,'SOURCE_COHORT_MISSING');
 }
 for(const field of ['independentCaseKey','runId']){
  for(const bad of [' ',' case:group one ','\u200bhidden']){
   const input=structuredClone(valid);
   input.holdout[0][field]=bad;
   const result=validateCohortPartition(input);
   assert.equal(result.status,'UNKNOWN');
   assert.equal(result.disjoint,false);
   assert.equal(result.reason,'PARTITION_LINEAGE_INVALID');
  }
 }
});

const R102_IGNORABLE_CODEPOINTS=Object.freeze([
  0x202E, // RIGHT-TO-LEFT OVERRIDE
  0x2066, // LEFT-TO-RIGHT ISOLATE
  0x034F, // COMBINING GRAPHEME JOINER
  0xFE0F, // VARIATION SELECTOR-16
  0x200E, // LEFT-TO-RIGHT MARK
  0x2063  // INVISIBLE SEPARATOR
]);
const r102Lineage=(cohort,caseKey,run)=>({
 sourceCohort:cohort,independentCaseKey:caseKey,runId:run
});

test('O2 R102 invisible Unicode source case run aliases cannot mint independent cohorts',()=>{
 const valid=r102Lineage('source:A','case:1','run:1');
 const other=r102Lineage('source:B','case:2','run:2');
 for(const cp of R102_IGNORABLE_CODEPOINTS){
  const mark=String.fromCodePoint(cp);
  for(const field of ['sourceCohort','independentCaseKey','runId']){
   const untrusted={...other,[field]:other[field]+mark};
   for(const rows of [[valid,untrusted],[untrusted,valid]]){
    const out=dedupeIndependentCases(rows);
    assert.equal(out.independentCohortCount,1,'U+'+cp.toString(16)+':'+field);
    assert.deepEqual(out.cohorts,['source:A']);
    assert.equal(out.incompleteLineage,true);
    assert.deepEqual(out.excluded,[{reason:'SOURCE_LINEAGE_INCOMPLETE'}]);
   }
  }
 }
});

test('O2 R102 invisible aliases in synthesis holdout negative fail closed while visible Unicode stays valid',()=>{
 const base={
  synthesis:[r102Lineage('source:North America','case:group one','run:unit one')],
  holdout:[r102Lineage('source:東京','case:Café résumé','run:مرحبا 123')],
  negative:[r102Lineage('source:杭州','case:δοκιμή two','run:देवनागरी ٣')]
 };
 assert.equal(validateCohortPartition(base).status,'DISJOINT');
 assert.equal(dedupeIndependentCases([base.holdout[0]]).independentCohortCount,1);
 for(const cp of R102_IGNORABLE_CODEPOINTS){
  const mark=String.fromCodePoint(cp);
  for(const section of ['synthesis','holdout','negative']){
   for(const field of ['sourceCohort','independentCaseKey','runId']){
    const input=structuredClone(base);
    input[section][0][field]+=mark;
    const result=validateCohortPartition(input);
    assert.equal(result.status,'UNKNOWN','U+'+cp.toString(16)+':'+section+':'+field);
    assert.equal(result.disjoint,false);
    assert.equal(result.reason,field==='sourceCohort'?'SOURCE_COHORT_MISSING':'PARTITION_LINEAGE_INVALID');
   }
  }
  const clone={
   synthesis:[r102Lineage('source:A','case:1','run:1')],
   holdout:[r102Lineage('source:A'+mark,'case:1'+mark,'run:1'+mark)],
   negative:[r102Lineage('source:C','case:3','run:3')]
  };
  const result=validateCohortPartition(clone);
  assert.equal(result.status,'UNKNOWN');
  assert.equal(result.disjoint,false);
 }
});

test('O2 R102 invisible lineage bridge never credits cache retry clones regardless of order',()=>{
 const a=r102Lineage('source:A','case:1','run:1');
 const b=r102Lineage('source:B','case:2','run:2');
 for(const cp of R102_IGNORABLE_CODEPOINTS){
  const marker=String.fromCodePoint(cp);
  for(const replay of [{cacheHit:true},{retry:true}]){
   const bridge={...r102Lineage('source:C'+marker,'case:1','run:2'),...replay};
   for(const rows of [[a,b,bridge],[bridge,b,a]]){
    const out=dedupeIndependentCases(rows);
    assert.equal(out.independentCohortCount,1);
    assert.deepEqual(out.cohorts,['source:A']);
    assert.equal(out.incompleteLineage,true);
    assert.deepEqual(out.excluded,[{reason:'CACHE_OR_RETRY_NOT_INDEPENDENT'}]);
   }
  }
 }
});
