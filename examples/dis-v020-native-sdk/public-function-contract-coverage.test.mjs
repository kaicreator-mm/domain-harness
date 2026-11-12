/** R72 / CORE-003: Public Function purposes and incomplete typed I/O on
 * genuinely selected Tally/Runx/xDownload/Orders source bytes.
 * This is a real compiler + SDK consumer test, not a synthetic SAP oracle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDisV020PublicFunctionCoverage,qualifyDisV020Artifact,compareDisV020ElementContracts,classifyDisV020KdpReceipt,classifyDisV020FunctionOutcome}
 from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
const selected=makeNativeFixture(),fail=code=>e=>e?.code===code;
const clone=structuredClone;
const build=(f,p)=>compileDisV020Aot({built:f.artifact.built,program:p,
 sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});

test('R72 selected Tally Runx xDownload and Orders nine public Functions have explicit distinct nonempty purposes in native AOT',async()=>{
 const f=await selected,q=qualifyDisV020Artifact(f.artifact);
 const a=inspectDisV020PublicFunctionCoverage(f.artifact);
 assert.equal(a.functions,9);
 assert.equal(a.descriptionsPresent,9);
 assert.equal(new Set(a.rows.map(x=>x.id)).size,9);
 assert.ok(a.rows.every(x=>x.description.length>15));
 for(const r of a.rows){
  assert.equal(q.functions.get(r.id).definition.description,r.description);
 }
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dis-r72-function-metadata'});
 try{
  const observation=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.authority,'NONE');
  assert.equal(observation.evidence.attested,false);
 }finally{app.stop()}
});
test('R72–R75 selected Function inventory distinguishes nine typed profiles without certifying source SAP',async()=>{
 const f=await selected,a=inspectDisV020PublicFunctionCoverage(f.artifact);
 assert.equal(a.typedIOFunctions,9);
 assert.deepEqual(a.missingTypedIO,[]);
 assert.equal(a.rows.find(x=>x.id==='runx.createPresenceObserver').profile,'TYPED_LOCAL_HANDLE_IO');
 assert.equal(a.rows.find(x=>x.id==='orders.appInit').profile,'TYPED_APP_INIT_IO');
 assert.equal(a.rows.filter(x=>x.profile==='TYPED_KDP_ADMISSION_IO').length,2);
 assert.equal(a.rows.filter(x=>x.profile==='KDP_ADMISSION_RECEIPT_ONLY').length,0);
 assert.equal(a.rows.filter(x=>x.profile==='LOCAL_HANDLE_METHODS_ONLY').length,0);
 assert.equal(a.rows.filter(x=>x.profile==='APP_INIT_LIFECYCLE_ONLY').length,0);
 // Structural completeness is now true; exact-source CI and independent
 // semantic qualifications are still separate release/CORE gates.
 assert.equal(a.fullCore003Ready,true);
 assert.equal(a.independentSAP,false);
 assert.equal(a.effectExecutionProven,false);
});
test('R72 invalid selected Function purpose fails AOT compilation and legacy missing purpose cannot pass explicit strict inspector',async()=>{
 const f=await selected;
 for(const bad of ['','  ',0,{},'x'.repeat(2049)]){
  const p=clone(f.program);
  p.elements.find(e=>e.id==='tally.tasks').functions[0].description=bad;
  assert.throws(()=>build(f,p),fail('DIS_FUNCTION_DESCRIPTION_INVALID'));
 }
 const p=clone(f.program);
 delete p.elements.find(e=>e.id==='tally.tasks').functions[0].description;
 const legacy=build(f,p); // old AOTs continue to install in compatibility mode
 assert.throws(()=>inspectDisV020PublicFunctionCoverage(legacy),
  fail('DIS_PUBLIC_FUNCTION_DESCRIPTION_REQUIRED'));
 assert.notEqual(legacy.digest,f.artifact.digest);
});
test('R72 descriptions do not authorize business truth or change an installed AOT source lock',async()=>{
 const f=await selected,p=clone(f.program);
 p.elements.find(e=>e.id==='tally.tasks').functions[0].description+=' (editorial revision)';
 const modified=build(f,p);
 assert.notEqual(modified.digest,f.artifact.digest);
 assert.equal(inspectDisV020PublicFunctionCoverage(modified).independentSAP,false);
 await assert.rejects(loadDisV020Aot(modified,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-r72-old-aot'
 }),fail('DIS_INSTALLED_AOT_MISMATCH'));
});

test('R73 typed actual KDP Intent envelope and KDP receipt never imply executed Effect',async()=>{
 const f=await selected,a=inspectDisV020PublicFunctionCoverage(f.artifact);
 for(const id of ['orders.approve','xdownload.confirmDownload']){
  const profile=a.rows.find(x=>x.id===id);
  assert.equal(profile.profile,'TYPED_KDP_ADMISSION_IO');
  const contract=f.program.elements.flatMap(e=>e.functions)
    .find(fn=>fn.id===id).receiptContract;
  assert.equal(contract.input.fields.messageId,'string');
  assert.equal(contract.input.fields.instanceKey,'string');
  assert.equal(contract.input.fields.input,'record');
  assert.equal(contract.output.fields.status,'string');
 }
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:dis-r73-kdp-typed'});
 try{
  const good=await app.invoke('orders.approve',{
   messageId:'msg:r73',instanceKey:'instance:r73',input:{amount:30,requestId:'R73'}
  },{expectedContractVersion:'1.0.0'});
  assert.equal(good.kind,'KDP_RECEIPT');
  assert.equal(good.admission,'ADMITTED');
  assert.equal(good.execution,'NOT_PROVEN');
  assert.equal(good.evidence.businessAttested,false);
  for(const extra of [{authority:'KDP'},{effectPermit:true}]){
   await assert.rejects(app.invoke('orders.approve',{
    messageId:'msg:r73-forged',instanceKey:'instance:r73-forged',input:{},...extra
   }),fail('DIS_KDP_INTENT_SCHEMA_INPUT_INVALID'));
  }
 }finally{app.stop()}
});
test('R73 incomplete or forged KDP schema fails source-selected AOT qualification',async()=>{
 const f=await selected;
 for(const [mutation,error] of [
  [r=>{delete r.output},'DIS_KDP_RECEIPT_SCHEMA_INCOMPLETE'],
  [r=>{r.input.fields.instanceKey='number'},'DIS_KDP_RECEIPT_SCHEMA_INVALID'],
  [r=>{r.output.fields.status='number'},'DIS_KDP_RECEIPT_SCHEMA_INVALID'],
  [r=>{r.input.fields.messageId='boolean'},'DIS_KDP_RECEIPT_SCHEMA_INVALID']
 ]){
  const p=clone(f.program);
  const r=p.elements.flatMap(e=>e.functions).find(x=>x.id==='orders.approve').receiptContract;
  mutation(r);
  assert.throws(()=>build(f,p),fail(error));
 }
 assert.equal(inspectDisV020PublicFunctionCoverage(f.artifact).independentSAP,false);
});

test('R74 selected Business App Init has typed Context / READY lifecycle and no public ingress',async()=>{
 const f=await selected,a=inspectDisV020PublicFunctionCoverage(f.artifact);
 assert.equal(a.typedIOFunctions,9);
 const fn=f.program.elements.flatMap(e=>e.functions).find(x=>x.id==='orders.appInit');
 assert.equal(fn.initContract.schema,'dis.v0.2.app-init-contract/1');
 assert.equal(fn.initContract.input.fields.aotDigest,'string');
 assert.equal(fn.initContract.output.fields.status,'string');
 assert.equal(fn.initContract.outcomes.DEGRADED,'DEGRADED');
 assert.equal(a.independentSAP,false);
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:dis-r74-init'});
 try{
  assert.equal(app.state,'READY');
  assert.equal(app.contractVersions['orders.appInit'],'1.0.0');
  await assert.rejects(app.invoke('orders.appInit',{}),fail('DIS_FUNCTION_UNBOUND'));
 }finally{app.stop()}
});
test('R74 forged App Init Schema and fake outcome cannot grant startup authority',async()=>{
 const f=await selected;
 for(const [change,code] of [
  [x=>{x.input.fields.aotDigest='boolean'},'DIS_APP_INIT_SCHEMA_INVALID'],
  [x=>{x.output.fields.status='number'},'DIS_APP_INIT_SCHEMA_INVALID'],
  [x=>{x.outcomes.READY='SUCCEEDED'},'DIS_APP_INIT_OUTCOMES_INVALID'],
  [x=>{x.compatibility.major=2},'DIS_APP_INIT_COMPATIBILITY_INVALID']
 ]){
  const p=clone(f.program);
  const fn=p.elements.flatMap(e=>e.functions).find(x=>x.id==='orders.appInit');
  change(fn.initContract);
  assert.throws(()=>build(f,p),fail(code));
 }
 const p=clone(f.program);
 const fn=p.elements.flatMap(e=>e.functions).find(x=>x.id==='orders.appInit');
 fn.initContract.output.fields.evidenceRefs='number';
 const changed=build(f,p);
 await assert.rejects(loadDisV020Aot(changed,{expectedDigest:changed.digest,
  registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:dis-r74-invalid-output'}),
  fail('DIS_FUNCTION_OUTPUT_INVALID'));
});

test('R75 real selected Runx process-local Factory, observe list and latest method I/O are checked',async()=>{
 const f=await selected,a=inspectDisV020PublicFunctionCoverage(f.artifact);
 assert.equal(a.typedIOFunctions,9);assert.deepEqual(a.missingTypedIO,[]);
 assert.equal(a.independentSAP,false);
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:r75-method-io'});
 try{
  await assert.rejects(app.invoke('runx.createPresenceObserver',{}),
   fail('DIS_LOCAL_HANDLE_FACTORY_INPUT_INVALID'));
  const x=await app.invoke('runx.createPresenceObserver',()=>'2026-11-10T20:00:00Z');
  assert.equal(x.authority,'NONE');assert.equal(x.handle.lifetime,'PROCESS_LOCAL');
  const h=x.value;
  assert.equal(h.latest(),null);assert.deepEqual(h.list(),[]);
  const req={agent_id:'agent-r75',agent_incarnation_id:'inc-r75',
   capability:{capability_id:'read'}};
  assert.throws(()=>h.observe({...req,agent_incarnation_id:9},{agent_id:'agent-r75'}),
   fail('DIS_LOCAL_HANDLE_INPUT_INVALID'));
  assert.equal(h.latest(),null);
  assert.equal(h.observe(req,{agent_id:'agent-r75'}),undefined);
  assert.equal(h.list().length,1);assert.equal(h.latest().agent_incarnation_id,'inc-r75');
  assert.deepEqual(Object.keys(h).sort(),['latest','list','observe']);
  assert.equal(Object.getPrototypeOf(h),null);
  assert.equal(h.liveAgents,undefined);
  assert.equal(Object.isFrozen(h),true);
  const detached=h.latest();
  assert.equal(Object.isFrozen(detached),true);
  assert.throws(()=>{detached.agent_incarnation_id='fake-inc'},TypeError);
  assert.equal(h.latest().agent_incarnation_id,'inc-r75');
  const rows=h.list();
  assert.equal(Object.isFrozen(rows),true);
  assert.equal(Object.isFrozen(rows[0]),true);
  assert.throws(()=>{rows[0].agent_incarnation_id='fake-inc'},TypeError);
  assert.equal(h.latest().agent_incarnation_id,'inc-r75');
  assert.equal(Object.hasOwn(h.latest(),'execution_authorized'),false);
  assert.throws(()=>h.latest(5),fail('DIS_LOCAL_HANDLE_INPUT_INVALID'));
  app.stop();assert.equal(h.latest().agent_id,'agent-r75');
 }finally{app.stop()}
});
test('R75 forged clock, method output, and unsafe source-selected method schema fail closed',async()=>{
 const f=await selected;
 const a=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:r75-clock'});
 try{
  const h=(await a.invoke('runx.createPresenceObserver',()=>0)).value;
  assert.throws(()=>h.observe({agent_id:'x',agent_incarnation_id:'y',
   capability:{capability_id:'c'}},{agent_id:'x'}),fail('DIS_LOCAL_HANDLE_CLOCK_INVALID'));
  assert.deepEqual(h.list(),[]);
 }finally{a.stop()}
 const registry={...f.registry,'runx.createPresenceObserver':{
  ...f.registry['runx.createPresenceObserver'],
  execute:()=>new class{
   observe(){return undefined}
   list(){return [{agent_id:'x',agent_incarnation_id:4,capability_id:'c',last_seen_at:'now'}]}
   latest(){return {agent_id:'x',agent_incarnation_id:4,capability_id:'c',last_seen_at:'now'}}
  }
 }};
 const b=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry,store:new PlainCasDocStore(),tenantId:'tenant:r75-forged-output'});
 try{
  const h=(await b.invoke('runx.createPresenceObserver',()=>'now')).value;
  assert.throws(()=>h.list(),fail('DIS_LOCAL_HANDLE_OUTPUT_INVALID'));
  assert.throws(()=>h.latest(),fail('DIS_LOCAL_HANDLE_OUTPUT_INVALID'));
 }finally{b.stop()}
 for(const [mutate,code] of [
  [h=>{delete h.methodIO.list},'DIS_LOCAL_HANDLE_IO_INVALID'],
  [h=>{delete h.factoryInput},'DIS_LOCAL_HANDLE_IO_INCOMPLETE'],
  [h=>{h.methodIO.latest.returns='SUCCEEDED'},'DIS_LOCAL_HANDLE_IO_INVALID'],
  [h=>{h.methods.push('then')},'DIS_LOCAL_HANDLE_CONTRACT_INVALID']
 ]){
  const p=structuredClone(f.program);
  const h=p.elements.flatMap(e=>e.functions).find(x=>x.id==='runx.createPresenceObserver').handleContract;
  mutate(h);
  assert.throws(()=>build(f,p),fail(code));
 }
});

test('R76 real selected Function compatibility denies hidden Handle, Init and KDP policy drift under a same-major Element bump',async()=>{
 const f=await selected;
 const element=id=>structuredClone(f.program.elements.find(x=>x.id===id));
 for(const [id,mutate] of [
  ['runx.agent.presence',x=>{x.functions[0].handleContract.methodIO.latest.record.fields.last_seen_at='number'}],
  ['orders.init',x=>{x.functions[0].initContract.output.fields.status='number'}],
  ['orders.approval',x=>{x.functions[0].receiptContract.statusMap.denied='ADMITTED'}]
 ]){
  const old=element(id),newer=structuredClone(old);newer.version='1.1.0';
  mutate(newer);
  assert.throws(()=>compareDisV020ElementContracts(old,newer),
   fail('DIS_ELEMENT_ABI_INCOMPATIBLE'),id);
 }
 const old=element('runx.agent.presence'),newer=structuredClone(old);
 newer.version='1.1.0';newer.functions[0].handleContract.version='1.1.0';
 assert.equal(compareDisV020ElementContracts(old,newer).compatible,true);
});


test('R104 KDP receipt prototype-key statuses remain typed UNKNOWN without Effect authority',()=>{
 const contract={
  schema:'dis.v0.2.kdp-receipt-contract/1',version:'1.0.0',
  statusMap:{admitted:'ADMITTED',denied:'DENIED'},
  compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
 };
 for(const [status,expected] of [
  ['admitted','ADMITTED'],['denied','DENIED'],
  ['toString','UNKNOWN'],['constructor','UNKNOWN'],
  ['valueOf','UNKNOWN'],['hasOwnProperty','UNKNOWN'],
  ['__proto__','UNKNOWN'],['missing','UNKNOWN']
 ]){
  const result=classifyDisV020KdpReceipt(contract,{status});
  assert.deepEqual(result,{
   admission:expected,execution:'NOT_PROVEN',businessEvidenceAttested:false
  },status);
  assert.equal(Object.isFrozen(result),true);
 }
});


test('R105 Function outcome inherited labels cannot masquerade as typed dispositions',()=>{
 const contract={
  outcomes:{field:'status',classes:{ok:'OBSERVED',pending:'UNKNOWN'}},
  evidence:{refField:'evidenceRefs',requiredFor:['OBSERVED']}
 };
 const observed=classifyDisV020FunctionOutcome(contract,{status:'ok',evidenceRefs:['source:demo']});
 assert.deepEqual(observed,{disposition:'OBSERVED',evidenceRefs:['source:demo']});
 for(const status of ['toString','constructor','valueOf','hasOwnProperty','__proto__','missing']){
  assert.throws(
   ()=>classifyDisV020FunctionOutcome(contract,{status,evidenceRefs:['source:demo']}),
   fail('DIS_OUTCOME_UNDECLARED'),status
  );
 }
});
