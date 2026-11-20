/** DIS v0.2 batch B01-01 / R32: selected native Function I/O + typed outcomes.
 * An observation/declared EvidenceRef is NOT accepted evidence or an Effect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyDisV020Artifact,compareDisV020FunctionContracts,classifyDisV020FunctionOutcome} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

const reject=code=>e=>e?.code===code;
const fixture=makeNativeFixture();
const start=(f,registry=f.registry)=>loadDisV020Aot(f.artifact,{
 expectedDigest:f.artifact.digest,registry,store:new PlainCasDocStore(),
 tenantId:'tenant:dis-b01-function-contract'
});
test('B01-01 R32 real selected Tally rule and xDownload Knowledge/Interaction Functions retain typed source and authority',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact),app=await start(f);
 try{
  for(const [id,source,kind] of [
   ['tally.assessTaskEvidence','tally-business','rule'],
   ['tally.projectReleaseReadiness','tally-release','rule'],
   ['xdownload.describePolicy','xdownload-business','knowledge'],
   ['xdownload.interaction.inspect','xdownload-interaction','interaction'],
   ['xdownload.interaction.confirm','xdownload-interaction','interaction']
  ]){
   const fn=q.functions.get(id)?.definition;
   assert.equal(fn?.kind,kind);assert.equal(fn.binding.type,'local');
   assert.equal(fn.binding.sourceId,source);
   assert.equal(fn.contract?.schema,'dis.v0.2.function-contract/1');
   assert.equal(fn.contract.version,'1.0.0');
   assert.equal(q.pins.get(source)?.sha256,f.artifact.sources.find(x=>x.id===source).sha256);
   assert.equal(fn.contract.evidence.refField,'evidenceRefs');
  }
  const rule=await app.invoke('tally.assessTaskEvidence',{}, {expectedContractVersion:'1.0.0'});
  const knowledge=await app.invoke('xdownload.describePolicy',{}, {expectedContractVersion:'1.0.0'});
  const interaction=await app.invoke('xdownload.interaction.inspect',
   {channel:'chat',requestId:'B01-R32',url:'https://example.org/r32'},
   {expectedContractVersion:'1.0.0'});
  assert.deepEqual([rule.disposition,knowledge.disposition,interaction.disposition],
   ['UNKNOWN','OBSERVED','NEEDS_INPUT']);
  for(const r of [rule,knowledge,interaction]){
   assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
   assert.equal(r.evidence.attested,false);
   assert.equal(r.contractVersion,'1.0.0');
  }
 }finally{app.stop()}
});
test('B01-01 R32 KDP admission remains typed separately from LOCAL evidence and never proves Effect success',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact),app=await start(f);
 try{
  const k=q.functions.get('orders.approve')?.definition;
  assert.equal(k.binding.type,'kdp-intent');assert.equal(k.contract,undefined);
  assert.equal(k.receiptContract?.schema,'dis.v0.2.kdp-receipt-contract/1');
  const r=await app.invoke('orders.approve',{
   messageId:'msg:b01-r32',instanceKey:'instance:b01-r32',
   input:{amount:30,requestId:'B01-R32'}
  },{expectedContractVersion:'1.0.0'});
  assert.equal(r.kind,'KDP_RECEIPT');assert.equal(r.admission,'ADMITTED');
  assert.equal(r.execution,'NOT_PROVEN');assert.equal(r.evidence.businessAttested,false);
 }finally{app.stop()}
});
test('B01-01 R32 a forged LOCAL output, undecared outcome or effect-bearing Knowledge input fails closed',async()=>{
 const f=await fixture;
 const badType={...f.registry};
 badType['tally.assessTaskEvidence']={
  ...badType['tally.assessTaskEvidence'],
  execute:()=>({state:'UNQUALIFIED_INPUT',admitted:'true',taskPass:false})
 };
 const a=await start(f,badType);
 try{await assert.rejects(a.invoke('tally.assessTaskEvidence',{}),reject('DIS_FUNCTION_OUTPUT_INVALID'))}finally{a.stop()}
 const falseOutcome={...f.registry};
 falseOutcome['tally.assessTaskEvidence']={
  ...falseOutcome['tally.assessTaskEvidence'],
  execute:()=>({state:'ACCEPTED',admitted:false,taskPass:false})
 };
 const b=await start(f,falseOutcome);
 try{await assert.rejects(b.invoke('tally.assessTaskEvidence',{}),reject('DIS_OUTCOME_UNDECLARED'))}finally{b.stop()}
 const c=await start(f);
 try{
  await assert.rejects(c.invoke('xdownload.describePolicy',{acquire:true}),reject('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(c.invoke('tally.assessTaskEvidence',{}, {expectedContractVersion:'2.0.0'}),
   reject('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{c.stop()}
});
test('B01-01 R32 contract same-version drift and forged declared Evidence cannot qualify truth',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact);
 const prev=q.functions.get('tally.assessTaskEvidence').definition.contract;
 const next=structuredClone(prev);next.outcomes.classes.OBSERVED_INPUT_ONLY='SUCCEEDED';
 assert.throws(()=>compareDisV020FunctionContracts(prev,next),reject('DIS_FUNCTION_ABI_UNVERSIONED_DRIFT'));
 const increment=structuredClone(prev);increment.version='1.1.0';
 assert.equal(compareDisV020FunctionContracts(prev,increment).compatible,true);
 const broken=structuredClone(prev);broken.version='1.1.0';
 broken.input={type:'record',fields:{freshRequired:'string'}};
 assert.throws(()=>compareDisV020FunctionContracts(prev,broken),reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 const fake=structuredClone(prev);fake.outcomes.classes.OBSERVED_INPUT_ONLY='SUCCEEDED';
 const synthetic=classifyDisV020FunctionOutcome(fake,{
  state:'OBSERVED_INPUT_ONLY',evidenceRefs:['fake:attestation']
 });
 assert.equal(synthetic.disposition,'SUCCEEDED');
 assert.deepEqual(synthetic.evidenceRefs,['fake:attestation']);
 // This classifier is structural: no evidence verification or authorization.
 assert.equal(q.functions.get('tally.assessTaskEvidence').definition.effect,'none');
});
