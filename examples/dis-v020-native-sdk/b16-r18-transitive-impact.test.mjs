/** DIS v0.2 B16/R62: genuine DKE R18 original native source graph evidence
 * as DATA; actual DIS AOT/SDK/KDP independent transitive replay.
 * Unqualified Guide203/79 full pages and independent semantic SAP remain NO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact}
 from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {R18_ORIGINS,makeR18KnowledgeReader,unpackR18,replayR18,verifyR18NativeEvidence}
 from './dke-r18-impact-reader.mjs';
const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'ccc0bf0ab7bc3b6b247929f78d36056dba7ad9bb',
 path:'examples/dis-v020-native-sdk/dke-r18-impact-reader.mjs',
 gitBlob:'0a51feffaec5119dff2bb3176fb00ae93bca7ed5'
});
const fail=code=>e=>e?.code===code;
const clone=structuredClone;
const base=makeNativeFixture();
async function setup(){
 const f=await base;
 const [planText,runnerPackage,receiptPackage,readerText]=await Promise.all([
  readFile(new URL('./fixtures/dke-r18-frozen-plan.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r18-native-runner.mjs.zlib.b64',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r18-native-receipt.json.zlib.b64',import.meta.url),'utf8'),
  readFile(new URL('./dke-r18-impact-reader.mjs',import.meta.url),'utf8')
 ]);
 const extra=[
  {id:'dke-r18-plan',sourceText:planText,origin:R18_ORIGINS.plan},
  {id:'dke-r18-runner',sourceText:runnerPackage,origin:R18_ORIGINS.runner},
  {id:'dke-r18-receipt',sourceText:receiptPackage,origin:R18_ORIGINS.receipt},
  {id:'dke-r18-reader',sourceText:readerText,origin:READER_ORIGIN}
 ];
 for(const x of extra)assert.equal(sourceGitBlob(x.sourceText),x.origin.gitBlob);
 const selected=makeR18KnowledgeReader(planText,runnerPackage,receiptPackage);
 const sources=[...f.sources,...extra];
 const origins={...f.expectedSourceOrigins};
 for(const x of extra)origins[x.id]=x.origin;
 const program=clone(f.program);
 program.domains.push({
  id:'dke.r18.graph',description:'Exact native DKE evidence dependency graph, unqualified method',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.r18.impact',domainId:'dke.r18.graph',kind:'knowledge',
  version:'1.0.0',description:'Read-only selective transitive source invalidation',
  dependsOn:[],functions:[{
   id:'dke.r18.readImpact',kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:'dke-r18-reader'},
   sourceDependencies:['dke-r18-plan','dke-r18-runner','dke-r18-receipt'],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{nodeId:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',nodeId:'string',graphState:'string',methodOutcome:'string',
     factOutcome:'string',invalidated:'boolean',sourceProvenance:'string',
     invalidatedCount:'number',graphNodes:'number',guide203RawPinned:'boolean',
     guide79RawPinned:'boolean',semanticIndependent:'boolean',
     sapQualified:'boolean',effectDispatched:'boolean'
    },additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const registry={...f.registry,'dke.r18.readImpact':{
  sourceId:'dke-r18-reader',sha256:sourceSha256(readerText),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,
  execute:req=>selected.query(req)
 }};
 const installed=Object.fromEntries(extra.map(x=>[x.id,{
  sha256:sourceSha256(x.sourceText),origin:x.origin
 }]));
 const build=(p=program,s=sources,o=origins)=>compileDisV020Aot({
  built:f.artifact.built,program:p,sources:s,expectedSourceOrigins:o
 });
 return {f,planText,runnerPackage,receiptPackage,readerText,selected,sources,origins,
  program,registry,installed,build,artifact:build()};
}
const context=setup();
const activate=(x,opts={})=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:dis-r62-native',...opts
});
test('R62 original DKE R18 native runner and machine receipt compressed Git Blobs are selected AOT DATA, never executable',async()=>{
 const x=await context,q=qualifyDisV020Artifact(x.artifact);
 const fn=q.functions.get('dke.r18.readImpact');
 assert.equal(fn.definition.effect,'none');
 assert.equal(fn.definition.binding.sourceId,'dke-r18-reader');
 assert.deepEqual(fn.definition.sourceDependencies,['dke-r18-plan','dke-r18-runner','dke-r18-receipt']);
 for(const key of ['plan','runner','receipt']){
  const id='dke-r18-'+key;
  assert.equal(q.pins.get(id).origin.gitBlob,R18_ORIGINS[key].gitBlob);
  assert.ok(q.sourceConsumers.get(id).includes('dke.r18.readImpact'));
 }
 const js=unpackR18(x.runnerPackage,'runner'),original=unpackR18(x.receiptPackage,'receipt');
 assert.equal(sourceGitBlob(js),'4d197c74bf25fbad2234972341fa7aee9a034045');
 assert.equal(sourceGitBlob(original),'0d168fae56e2dfbfe1239d9b8df131ad132b7dde');
 const app=await activate(x);
 try{assert.equal(app.state,'READY');assert.equal(app.contractVersions['dke.r18.readImpact'],'1.0.0')}
 finally{app.stop()}
});
test('R62 original DKE native evidence DAG: only four nodes invalidated, unrelated RTC Knowledge preserved in real selected SDK',async()=>{
 const x=await context,app=await activate(x);
 const invalid=['reference.remove-16','reference.replace-17','method.d05-rtc-substitution','consumer.method-readonly'];
 const known=['knowledge.rtc-conditional','consumer.rtc-fact-readonly','knowledge.unrelated'];
 try{
  const ids=['source.framework-readme','source.guide203','source.guide79',
   'knowledge.rtc-conditional','reference.remove-16','reference.replace-17',
   'method.d05-rtc-substitution','consumer.method-readonly','consumer.rtc-fact-readonly',
   'knowledge.unrelated'];
  for(const nodeId of ids){
   const out=await app.invoke('dke.r18.readImpact',{nodeId},{expectedContractVersion:'1.0.0'});
   const v=out.value;
   assert.equal(out.kind,'OBSERVATION');assert.equal(out.disposition,'UNKNOWN');
   assert.equal(out.authority,'NONE');assert.equal(out.evidence.attested,false);
   assert.deepEqual(out.evidence.declaredRefs,[]);
   assert.equal(v.status,'UNKNOWN');assert.equal(v.nodeId,nodeId);
   assert.equal(v.invalidated,invalid.includes(nodeId));
   assert.equal(v.invalidatedCount,4);assert.equal(v.graphNodes,10);
   assert.equal(v.methodOutcome,'UNKNOWN_STALE_SOURCE');
   assert.equal(v.factOutcome,'SOURCE_OBSERVED_NO_SAP');
   assert.equal(v.guide203RawPinned,false);assert.equal(v.guide79RawPinned,false);
   assert.equal(v.semanticIndependent,false);assert.equal(v.sapQualified,false);
   assert.equal(v.effectDispatched,false);
   if(known.includes(nodeId))assert.equal(v.graphState,'SOURCE_OBSERVED_NOT_SAP');
  }
 }finally{app.stop()}
});
test('R62 native independent graph replay verifies original baseline/partial/hypothetical and conservative missing-publisher-source gate',async()=>{
 const x=await context,plan=JSON.parse(x.planText);
 const raw=JSON.parse(unpackR18(x.receiptPackage,'receipt'));
 const orig=unpackR18(x.runnerPackage,'runner');
 const check=verifyR18NativeEvidence(plan,raw,orig);
 assert.equal(check.nodes,10);assert.equal(check.invalidated,4);
 assert.equal(check.selectedNativeChecks,6);assert.equal(check.negativeCases,18);
 assert.deepEqual(check.baseline.affected,[
  'reference.remove-16','reference.replace-17','method.d05-rtc-substitution','consumer.method-readonly'
 ]);
 const guide=clone(plan.frozenObservations.guide79);
 guide[0].role='REMOVE_MAINBOARD';
 const partial=replayR18(plan,{steps:guide});
 assert.equal(partial.methodOutcome,'UNKNOWN_STALE_SOURCE');
 assert.equal(partial.affected.length,3);
 guide[1].role='REASSEMBLE_MAINBOARD';
 const hypothetical=replayR18(plan,{steps:guide});
 assert.equal(hypothetical.methodOutcome,'UNKNOWN_MISSING_SOURCE_OR_REVIEW');
 assert.equal(hypothetical.affected.length,0);
 assert.equal(hypothetical.status['method.d05-rtc-substitution'],'BLOCKED_SOURCE_PIN');
});
test('R62 forged origin package/full source SHA, false semantic Owner SAP, altered method graph/cycle/duplicate fail closed',async()=>{
 const x=await context,plan=JSON.parse(x.planText),raw=JSON.parse(unpackR18(x.receiptPackage,'receipt'));
 assert.throws(()=>makeR18KnowledgeReader(x.planText,x.runnerPackage,x.receiptPackage+'X'),
  fail('DIS_R18_GIT_PACKAGE_DRIFT'));
 assert.throws(()=>unpackR18('AAAA','receipt'),fail('DIS_R18_DECOMPRESS_INVALID'));
 const falseSAP=clone(raw);falseSAP.sapQualified=1;
 assert.throws(()=>verifyR18NativeEvidence(plan,falseSAP,unpackR18(x.runnerPackage,'runner')),
  fail('DIS_R18_FALSE_SOURCE_OR_AUTHORITY'));
 const forged=clone(raw);forged.baseline.status['knowledge.rtc-conditional']='INVALIDATED';
 assert.throws(()=>verifyR18NativeEvidence(plan,forged,unpackR18(x.runnerPackage,'runner')),
  fail('DIS_R18_BASELINE_MISMATCH'));
 const roots=clone(plan);roots.source.targetGuideRawSHA='f'.repeat(64);
 assert.throws(()=>replayR18(roots),fail('DIS_R18_PLAN_INVALID'));
 const edges={
  'reference.remove-16':['source.guide203','source.guide79'],
  'reference.replace-17':['source.guide203','source.guide79'],
  'method.d05-rtc-substitution':['reference.remove-16','reference.replace-17'],
  'consumer.method-readonly':['method.d05-rtc-substitution'],
  'consumer.rtc-fact-readonly':['knowledge.rtc-conditional']
 };
 // A source graph with a missing edge is still a valid DAG, but is NOT
 // the original exact source graph and must not hide affected Method/consumer nodes.
 assert.deepEqual(replayR18(plan,{edges}),replayR18(plan));
 const swappedOrder=clone(edges);swappedOrder['reference.remove-16'].reverse();
 assert.deepEqual(replayR18(plan,{edges:swappedOrder}),replayR18(plan));
 const missingMethod=clone(edges);missingMethod['method.d05-rtc-substitution']=[];
 assert.throws(()=>replayR18(plan,{edges:missingMethod}),fail('DIS_R18_GRAPH_EDGE_SET_DRIFT'));
 const missingConsumer=clone(edges);missingConsumer['consumer.method-readonly']=[];
 assert.throws(()=>replayR18(plan,{edges:missingConsumer}),fail('DIS_R18_GRAPH_EDGE_SET_DRIFT'));
 const redirected=clone(edges);redirected['consumer.method-readonly']=['knowledge.rtc-conditional'];
 assert.throws(()=>replayR18(plan,{edges:redirected}),fail('DIS_R18_GRAPH_EDGE_SET_DRIFT'));
 const missingFact=clone(edges);missingFact['consumer.rtc-fact-readonly']=[];
 assert.throws(()=>replayR18(plan,{edges:missingFact}),fail('DIS_R18_GRAPH_EDGE_SET_DRIFT'));
 const cyclic=clone(edges);cyclic['reference.remove-16']=['method.d05-rtc-substitution'];
 assert.throws(()=>replayR18(plan,{edges:cyclic}),fail('DIS_R18_GRAPH_CYCLE'));
 const duplicate=clone(edges);duplicate['method.d05-rtc-substitution'].push('reference.remove-16');
 assert.throws(()=>replayR18(plan,{edges:duplicate}),fail('DIS_R18_GRAPH_DUPLICATE'));
 assert.throws(()=>replayR18(plan,{model:'UNSELECTED_GENERATION'}),fail('DIS_R18_FALSE_AUTHORITY_OR_MODEL'));
 assert.throws(()=>replayR18(plan,{autoRemap:true}),fail('DIS_R18_FALSE_AUTHORITY_OR_MODEL'));
});
test('R62 compressed upstream DATA cannot masquerade as LOCAL code, installer drift and forged Function Effect rejected',async()=>{
 const x=await context;
 const forged=clone(x.program),fn=forged.elements.find(z=>z.id==='dke.r18.impact').functions[0];
 fn.binding.sourceId='dke-r18-runner';delete fn.sourceDependencies;
 assert.throws(()=>x.build(forged),fail('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 const pins={...x.installed,'dke-r18-receipt':{
  ...x.installed['dke-r18-receipt'],sha256:'f'.repeat(64)
 }};
 await assert.rejects(activate(x,{expectedSourcePins:pins,tenantId:'tenant:dis-r62-stale'}),
  fail('DIS_SOURCE_ANCHOR_STALE'));
 const app=await activate(x);
 try{
  for(const v of [
   {nodeId:'not-a-node'},
   {nodeId:'consumer.method-readonly',ownerApproved:true},
   {nodeId:'consumer.method-readonly',effect:true}
  ])await assert.rejects(app.invoke('dke.r18.readImpact',v));
  await assert.rejects(app.invoke('dke.r18.readImpact',
   {nodeId:'consumer.method-readonly'},{expectedContractVersion:'2.0.0'}),
   fail('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});
