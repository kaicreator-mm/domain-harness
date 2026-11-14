/** DIS v0.2 B19/R65: genuinely native AOT→SDK→KDP original EV16
 * complete source-bound Tally JSON-LD Knowledge, NOT an RFC domain SAP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact}
 from '@kaicreator/domain-harness-contracts/dis-v020';
import {compareDisV020FunctionContracts} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {makeVerifiedEV16Reader,gitBlobUtf8Text} from './dke-r26-ev16-reader.mjs';

const ORIGINAL=Object.freeze({
 r8:{repository:'kaicreator-mm/domain-forge',
  commit:'0b2f1ae58b309a5eb9d3e89ac2e13ca915f1b211',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/EV_CROSS_DOMAIN_MATRIX_R8.json',
  gitBlob:'8cab8ead10d90a440c85fec86b01fd408022ae2c'},
 tally:{repository:'kaicreator-mm/tally',
  commit:'3e94685ca57a4b7258988826697af1c1c3a6b3c8',
  path:'docs/versions/v2.1.1/knowledge/generated/graph.jsonld',
  gitBlob:'0f6007315fd7352fe6fd218effcfecf672cb4961'},
 gate:{repository:'kaicreator-mm/domain-forge',
  commit:'0b2f1ae58b309a5eb9d3e89ac2e13ca915f1b211',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r22-ev16-explicit-source-join/FROZEN_CASE_GATE.json',
  gitBlob:'4afea8ce6333a25439f7ec17bf5c396ef3e1b59b'},
 reader:{repository:'kaicreator-mm/domain-forge',
  commit:'38f5c6bbb93873f5042dd0afd31e6b051639d41d',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r23-ev16-bound-reader/verified-reader.mjs',
  gitBlob:'b0e02389abc156cbd8006371765d597ebf86c61c'}
});
const BYTES=Object.freeze({
 r8:'./fixtures/dke-r23-ev16-r8.json',
 tally:'./fixtures/dke-r23-ev16-tally-full.jsonld',
 gate:'./fixtures/dke-r23-ev16-gate.json',
 reader:'./dke-r26-ev16-reader.mjs'
});
const SID=Object.freeze({
 r8:'dke-r23-r8-source',
 tally:'dke-r23-tally-original',
 gate:'dke-r23-source-gate',
 reader:'dke-r26-verified-reader'
});
const FN='dke.ev16.readSourceBound';
const fail=code=>e=>e?.code===code;
const fixture=makeNativeFixture();
const loadFiles=Promise.all(Object.entries(BYTES).map(async([role,path])=>[
 role,await readFile(new URL(path,import.meta.url),'utf8')
])).then(Object.fromEntries);

async function makeContext(){
 const f=await fixture;
 const original=await loadFiles;
 for(const [role,text] of Object.entries(original)){
  assert.equal(sourceGitBlob(text),ORIGINAL[role].gitBlob);
  assert.equal(gitBlobUtf8Text(text),ORIGINAL[role].gitBlob);
 }
 assert.equal(JSON.parse(original.tally)['@graph'].length,807);
 const reader=makeVerifiedEV16Reader(original.r8,original.tally,original.gate);
 const first=reader.query(JSON.parse(original.gate).defaultRequest);
 assert.equal(first.status,'UNKNOWN_NO_ASSERTED_RFC9111_RELATION');
 assert.equal(first.typedRelationships,271);
 assert.equal(first.directRFC9111Nodes,0);
 const additional=Object.entries(original).map(([role,sourceText])=>({
  id:SID[role],sourceText,origin:ORIGINAL[role]
 }));
 const sources=[...f.sources,...additional];
 const origins={...f.expectedSourceOrigins,
  ...Object.fromEntries(additional.map(x=>[x.id,x.origin]))};
 const program=structuredClone(f.program);
 program.domains.push({
  id:'dke.ev16.original',description:'Original exact Tally graph and RFC source-join abstention',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/tally','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.ev16.bound-source',domainId:'dke.ev16.original',kind:'knowledge',
  version:'1.1.0',description:'Full-source-bound read-only EV16 cross-domain UNKNOWN',
  dependsOn:[],functions:[{
   id:FN,kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:SID.reader},
   sourceDependencies:[SID.r8,SID.tally,SID.gate],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.1.0',
    input:{type:'record',fields:{targetEV:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',evId:'string',sourceStatus:'string',
     graphNodes:'number',typedRelationships:'number',
     directRFC9111Nodes:'number',directCacheControlNodes:'number',
     genericCacheNodeIds:'array',tallySourceGitBlob:'string',
     originalR8Cells:'number',originalEV16Cells:'number',
     sourceBytesVerified:'boolean',semanticIndependent:'boolean',
     sapQualified:'boolean',effectDispatched:'boolean'
    },additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const local=req=>{
  const source=JSON.parse(original.gate).defaultRequest;
  const out=reader.query({...source,targetEV:req.targetEV});
  if(out.status!=='UNKNOWN_NO_ASSERTED_RFC9111_RELATION'){
   const e=new Error('DIS_EV16_UNQUALIFIED_CROSS_DOMAIN_SOURCE');
   e.code='DIS_EV16_UNQUALIFIED_CROSS_DOMAIN_SOURCE';throw e;
  }
  return {
   status:'UNKNOWN',evId:'EV16',sourceStatus:out.status,
   graphNodes:out.graphNodes,typedRelationships:out.typedRelationships,
   directRFC9111Nodes:out.directRFC9111Nodes,
   directCacheControlNodes:out.directCacheControlNodes,
   genericCacheNodeIds:[...out.lexicalGenericCacheNodes],
   tallySourceGitBlob:out.sourceGraphGitBlob,
   originalR8Cells:out.originalR8Cells,
   originalEV16Cells:out.originalEV16Cells,
   sourceBytesVerified:out.sourceBytesVerified,
   semanticIndependent:false,sapQualified:false,effectDispatched:false
  };
 };
 const registry={...f.registry,
  [FN]:{sourceId:SID.reader,sha256:sourceSha256(original.reader),
   origin:ORIGINAL.reader,gitBlob:ORIGINAL.reader.gitBlob,execute:local}
 };
 const installed=Object.fromEntries(additional.map(x=>[x.id,{
  sha256:sourceSha256(x.sourceText),origin:x.origin
 }]));
 const build=(p=program,s=sources,o=origins)=>compileDisV020Aot({
  built:f.artifact.built,program:p,sources:s,expectedSourceOrigins:o
 });
 return {f,original,reader,program,sources,origins,registry,installed,build,
   artifact:build()};
}
const ctx=makeContext();
const activate=(x,opts={})=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,
 expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:dis-r64-ev16',
 ...opts
});

test('R65 exact four complete original Git Blobs: real Tally graph DATA selected, R23 code is LOCAL, all pins visible in AOT',async()=>{
 const x=await ctx,q=qualifyDisV020Artifact(x.artifact);
 const fn=q.functions.get(FN);
 assert.equal(fn.definition.effect,'none');
 assert.equal(fn.definition.kind,'knowledge');
 assert.equal(fn.definition.binding.sourceId,SID.reader);
 assert.deepEqual(fn.definition.sourceDependencies,[SID.r8,SID.tally,SID.gate]);
 for(const [role,src] of Object.entries(ORIGINAL)){
  const pin=q.pins.get(SID[role]);
  assert.ok(pin,'missing AOT source pin '+role);
  assert.equal(pin.origin.gitBlob,src.gitBlob);
  assert.equal(pin.origin.commit,src.commit);
  if(role!=='reader')assert.ok(q.sourceConsumers.get(SID[role]).includes(FN));
 }
 const graph=JSON.parse(x.original.tally);
 assert.equal(graph['@graph'].length,807);
 assert.equal(graph['@graph'].filter(y=>y['@type']==='se:RelationshipAssertion').length,271);
 const app=await activate(x);
 try{assert.equal(app.state,'READY');assert.equal(app.contractVersions[FN],'1.1.0')}
 finally{app.stop()}
});

test('R65 actual selected KDP invoking original full-source-bound EV16 returns typed UNKNOWN, never RFC join or Effect',async()=>{
 const x=await ctx,app=await activate(x);
 try{
  const out=await app.invoke(FN,{targetEV:'EV16'},{expectedContractVersion:'1.1.0'});
  const v=out.value;
  assert.equal(out.kind,'OBSERVATION');
  assert.equal(out.disposition,'UNKNOWN');assert.equal(out.authority,'NONE');
  assert.equal(out.evidence.attested,false);
  assert.equal(v.status,'UNKNOWN');assert.equal(v.evId,'EV16');
  assert.equal(v.sourceStatus,'UNKNOWN_NO_ASSERTED_RFC9111_RELATION');
  assert.equal(v.graphNodes,807);assert.equal(v.typedRelationships,271);
  assert.equal(v.directRFC9111Nodes,0);assert.equal(v.directCacheControlNodes,0);
  assert.deepEqual(v.genericCacheNodeIds,[
   'se:CASE-09F-CF-KV-DEPENDENCY','se:LOC-09F-CF-INCIDENT-TIMELINE'
  ]);
  assert.equal(v.tallySourceGitBlob,ORIGINAL.tally.gitBlob);
  assert.equal(v.originalR8Cells,53);assert.equal(v.originalEV16Cells,2);
  assert.equal(v.sourceBytesVerified,true);assert.equal(v.semanticIndependent,false);
  assert.equal(v.sapQualified,false);assert.equal(v.effectDispatched,false);
  v.genericCacheNodeIds.push('FORGED_RFC_RELATION');
  const again=(await app.invoke(FN,{targetEV:'EV16'})).value;
  assert.deepEqual(again.genericCacheNodeIds,[
   'se:CASE-09F-CF-KV-DEPENDENCY','se:LOC-09F-CF-INCIDENT-TIMELINE'
  ]);
 }finally{app.stop()}
});

test('R65 native full Tally graph tamper, false RFC source, fake SAP/Effect and empty data fail closed at Reader construction',async()=>{
 const x=await ctx;
 const a=x.original;
 assert.throws(()=>makeVerifiedEV16Reader(a.r8,a.tally+' ',a.gate),
  fail('R23_TALLY_GRAPH_GIT_BLOB_MISMATCH'));
 assert.throws(()=>makeVerifiedEV16Reader(a.r8,a.tally.replace('"@id"','"fakeRfc":"RFC 9111 Cache-Control","@id"'),a.gate),
  fail('R23_TALLY_GRAPH_GIT_BLOB_MISMATCH'));
 assert.throws(()=>makeVerifiedEV16Reader(a.r8+' ',a.tally,a.gate),
  fail('R23_R8_MATRIX_GIT_BLOB_MISMATCH'));
 assert.throws(()=>makeVerifiedEV16Reader(a.r8,a.tally,a.gate+' '),
  fail('R23_SOURCE_GATE_GIT_BLOB_MISMATCH'));
 assert.throws(()=>makeVerifiedEV16Reader(a.r8,'',a.gate),
  fail('R23_TALLY_GRAPH_GIT_BLOB_MISMATCH'));
 const origReq=JSON.parse(a.gate).defaultRequest;
 for(const change of [
  {declaresExplicitRFCJoin:true},{usesLexicalOnly:true},{claimsNoStoreAlways:true},
  {assertsSourceBytePin:true},{assertsIndependentCritic:true},
  {assertsSAP:true},{assertsEffects:true},{assertsRepair:true}
 ])assert.notEqual(x.reader.query({...origReq,...change}).status,
  'UNKNOWN_NO_ASSERTED_RFC9111_RELATION');
 const direct=x.reader.query(origReq);
 assert.throws(()=>direct.lexicalGenericCacheNodes.push('FORGED'),TypeError);
 assert.equal(x.reader.query(origReq).lexicalGenericCacheNodes.length,2);
});

test('R65 origin allowlist is exact by original producer repo, commit, path and Git Blob, not a broad docs or executable relaxation',async()=>{
 const x=await ctx;
 const cases=[
  {role:'tally',change:{commit:'0'.repeat(40)}},
  {role:'tally',change:{repository:'example/tally'}},
  {role:'tally',change:{path:'docs/versions/v2.1.1/knowledge/generated/untrusted.jsonld'}},
  {role:'reader',change:{commit:'0'.repeat(40)}},
  {role:'reader',change:{path:'docs/standards/dke/DKE-0.0.1/demos/unreviewed.mjs'}}
 ];
 for(const {role,change} of cases){
  const id=SID[role];
  const origin={...x.origins[id],...change};
  const sources=x.sources.map(s=>s.id===id?{...s,origin}:s);
  const trusted={...x.origins,[id]:origin};
  assert.throws(()=>x.build(x.program,sources,trusted),
   fail('DIS_SOURCE_ORIGIN_INVALID'),'unexpected origin accepted for '+role);
 }
});

test('R65 native installer refuses changed original full graph sha, missing source or DATA-as-LOCAL Function source',async()=>{
 const x=await ctx;
 const bad={...x.installed,[SID.tally]:{
  ...x.installed[SID.tally],sha256:'f'.repeat(64)
 }};
 await assert.rejects(activate(x,{expectedSourcePins:bad,tenantId:'tenant:dis-r64-stale'}),
  fail('DIS_SOURCE_ANCHOR_STALE'));
 const missing=x.sources.filter(s=>s.id!==SID.tally);
 assert.throws(()=>x.build(x.program,missing),e=>Boolean(e));
 const forged=structuredClone(x.program);
 const fn=forged.elements.find(e=>e.id==='dke.ev16.bound-source').functions[0];
 fn.binding.sourceId=SID.tally;delete fn.sourceDependencies;
 assert.throws(()=>x.build(forged),fail('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
});

test('R65 native selected Knowledge rejects wrong EV, extra payload, false approvals and contract mismatch',async()=>{
 const x=await ctx,app=await activate(x);
 try{
  for(const bad of [
   {targetEV:'EV02'},
   {targetEV:'EV16',assertsSAP:true},
   {targetEV:'EV16',independentCritic:true},
   {targetEV:'EV16',effect:true},
   {targetEV:'EV16',graph:{'@graph':[]}}
  ])await assert.rejects(app.invoke(FN,bad));
  await assert.rejects(app.invoke(FN,{targetEV:'EV16'},{expectedContractVersion:'2.0.0'}),
   fail('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});


test('R65 exact R26 typed Reader: 76 source-bound adversarial request vectors and native selected Knowledge remain fail-closed',async()=>{
 const x=await ctx, req=JSON.parse(x.original.gate).defaultRequest;
 const flags=['declaresExplicitRFCJoin','usesLexicalOnly','claimsNoStoreAlways',
   'assertsSourceBytePin','assertsIndependentCritic','assertsSAP','assertsEffects','assertsRepair'];
 const denied=['REJECTED_UNSUPPORTED_EXPLICIT_RELATION','REJECTED_LEXICAL_TRANSFER',
   'REJECTED_RFC_SCOPE_OVERCLAIM','REJECTED_FALSE_RFC_PIN',
   'REJECTED_FALSE_AUTHORITY','REJECTED_FALSE_AUTHORITY',
   'REJECTED_FALSE_AUTHORITY','REJECTED_FALSE_PHYSICAL_OUTCOME'];
 let n=0;
 for(const k of flags){
  for(const v of [null,0,'',NaN,undefined,[]]){
   assert.throws(()=>x.reader.query({...req,[k]:v}),fail('R23_REQUEST_BOOLEAN_TYPE'));
   n++;
  }
 }
 for(const k of ['targetEV','sourceGraphCommit','sourceGraphBlob']){
  for(const v of [null,0,NaN,undefined,[]]){
   assert.throws(()=>x.reader.query({...req,[k]:v}),fail('R23_REQUEST_STRING_TYPE'));
   n++;
  }
 }
 flags.forEach((k,i)=>{assert.equal(x.reader.query({...req,[k]:true}).status,denied[i]);n++});
 for(const [k,v,status] of [
  ['targetEV','EV02','REJECTED_EV_SCOPE'],
  ['sourceGraphCommit','0'.repeat(40),'REJECTED_GRAPH_SOURCE_PIN'],
  ['sourceGraphBlob','0'.repeat(40),'REJECTED_GRAPH_SOURCE_PIN']
 ]){
  assert.equal(x.reader.query({...req,[k]:v}).status,status);n++;
 }
 const missing={...req};delete missing.assertsSAP;
 assert.throws(()=>x.reader.query(missing),fail('R23_UNSELECTED_OR_EXTRA_REQUEST'));n++;
 assert.throws(()=>x.reader.query({...req,extraApproval:true}),fail('R23_UNSELECTED_OR_EXTRA_REQUEST'));n++;
 assert.equal(n,76);
 const valid=x.reader.query(req);
 assert.equal(valid.status,'UNKNOWN_NO_ASSERTED_RFC9111_RELATION');
 assert.equal(valid.authority,'NONE');
 assert.equal(valid.sapQualified,false);
 assert.equal(valid.effectDispatched,false);
 const app=await activate(x);
 try{
  const out=await app.invoke(FN,{targetEV:'EV16'},{expectedContractVersion:'1.1.0'});
  assert.equal(out.kind,'OBSERVATION');
  assert.equal(out.disposition,'UNKNOWN');
  assert.equal(out.authority,'NONE');
  assert.equal(out.evidence.attested,false);
  assert.equal(out.value.sapQualified,false);
  assert.equal(out.value.effectDispatched,false);
  await assert.rejects(app.invoke(FN,{targetEV:0}),fail('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(FN,{targetEV:'EV16'},{expectedContractVersion:'1.0.0'}),
   fail('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});

test('R65 immutable exact R23 reader installer pin cannot silently replace R26; versioned contract remains compatible',async()=>{
 const x=await ctx,q=qualifyDisV020Artifact(x.artifact),f=q.functions.get(FN).definition;
 const prev=structuredClone(f.contract);prev.version='1.0.0';
 assert.deepEqual(compareDisV020FunctionContracts(prev,f.contract),
  {compatible:true,from:'1.0.0',to:'1.1.0'});
 const originalR23=await readFile(new URL('./dke-r23-ev16-reader.mjs',import.meta.url),'utf8');
 assert.equal(sourceGitBlob(originalR23),'c37b09082a50eeec7e17c17ecd9366a79c4ce8ae');
 const stale={...x.installed,[SID.reader]:{
  sha256:sourceSha256(originalR23),
  origin:{...x.installed[SID.reader].origin,
   commit:'1f3b39a2a6716c1e977e726fd3737d9bd590a412',
   gitBlob:'c37b09082a50eeec7e17c17ecd9366a79c4ce8ae'}
 }};
 await assert.rejects(activate(x,{expectedSourcePins:stale,
  tenantId:'tenant:dis-r65-stale-original-r23'}),fail('DIS_SOURCE_ANCHOR_STALE'));
 assert.equal(q.pins.get(SID.reader).origin.gitBlob,
  'b0e02389abc156cbd8006371765d597ebf86c61c');
 assert.equal(q.pins.get(SID.reader).origin.commit,
  '38f5c6bbb93873f5042dd0afd31e6b051639d41d');
});
