/** DIS B20/R66: opt-in nested Function Schema consumed by selected original xDownload Knowledge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyDisV020Artifact,compareDisV020FunctionContracts,
 validateDisV020FunctionValue} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

const deny=code=>e=>e?.code===code;
const copy=structuredClone;
const FN='xdownload.inspectPolicyTree';
const fixture=makeNativeFixture();
const nested={type:'record',fields:{
 workflowKey:'string',
 initialState:'string',
 guards:{type:'array',minItems:1,maxItems:8,items:{type:'record',
  fields:{guardId:'string',predicate:{type:'record',
   fields:{op:'string'},additionalProperties:true}},additionalProperties:true}},
 states:{type:'array',minItems:2,maxItems:16,items:{type:'record',
  fields:{stateKey:'string'},additionalProperties:true}}
},additionalProperties:true};
const intent={type:'record',fields:{
 confirmDownload:{type:'record',fields:{
  roles:{type:'array',items:'string',minItems:1,maxItems:8},
  trigger:{type:'record',fields:{kind:'string',eventType:'string'},additionalProperties:false}
 },additionalProperties:true}
},additionalProperties:true};

async function prepared(){
 const f=await fixture,p=copy(f.program);
 const el=p.elements.find(x=>x.id==='xdownload.policy');
 el.version='1.1.0';
 const old=el.functions.find(x=>x.id==='xdownload.describePolicy');
 const fresh=copy(old);fresh.id=FN;
 fresh.contract=copy(old.contract);
 fresh.contract.version='1.1.0';
 fresh.contract.output={type:'record',fields:{
  domainId:'string',workflowDefinition:nested,intentBindings:intent
 },additionalProperties:true};
 el.functions.push(fresh);
 const artifact=compileDisV020Aot({built:f.artifact.built,program:p,
  sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
 const registry={...f.registry,[FN]:{...f.registry['xdownload.describePolicy']}};
 return {f,p,artifact,registry,contract:fresh.contract};
}
const ctx=prepared();
const open=(x,registry=x.registry)=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry,store:new PlainCasDocStore(),
 tenantId:'tenant:dis-b20-nested-schema'
});

test('B20 R66 actual source-locked native SDK reads bounded nested xDownload policy with typed arrays',async()=>{
 const x=await ctx,q=qualifyDisV020Artifact(x.artifact);
 assert.equal(q.functions.get(FN).definition.contract.version,'1.1.0');
 const app=await open(x);
 try{
  const out=await app.invoke(FN,{}, {expectedContractVersion:'1.1.0'});
  assert.equal(out.kind,'OBSERVATION');assert.equal(out.authority,'NONE');
  assert.equal(out.disposition,'OBSERVED');assert.equal(out.evidence.attested,false);
  assert.equal(out.value.workflowDefinition.guards[0].guardId,'guard:declared-bytes-ok');
  assert.equal(out.value.intentBindings.confirmDownload.roles[0],'requester');
  assert.equal(out.value.workflowDefinition.states.length,3);
 }finally{app.stop()}
});

test('B20 R66 nested unexpected-key, missing role, wrong array item and forged output cannot bypass SDK',async()=>{
 const x=await ctx;
 const mutations=[
  policy=>policy.workflowDefinition.guards[0].predicate.op=5,
  policy=>policy.workflowDefinition.states[1].stateKey=42,
  policy=>policy.workflowDefinition.guards=[],
  policy=>policy.intentBindings.confirmDownload.roles=[null],
  policy=>policy.intentBindings.confirmDownload.trigger.extra='FORGED',
  policy=>delete policy.intentBindings.confirmDownload.trigger.kind
 ];
 for(const mutate of mutations){
  const impl={...x.registry,[FN]:{
   ...x.registry[FN],
   execute:()=>{const p=copy(x.registry[FN].execute());mutate(p);return p}
  }};
  const app=await open(x,impl);
  try{await assert.rejects(app.invoke(FN,{}),deny('DIS_FUNCTION_OUTPUT_INVALID'))}
  finally{app.stop()}
 }
 const app=await open(x);
 try{
  await assert.rejects(app.invoke(FN,{effect:true}),deny('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(FN,{}, {expectedContractVersion:'2.0.0'}),
   deny('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});

test('B20 R66 malformed recursive schemas and over-budget depth/cardinality fail closed at AOT',async()=>{
 const x=await ctx;
 const bad=[
  c=>c.output.fields.workflowDefinition.fields.guards.items='any',
  c=>c.output.fields.workflowDefinition.fields.guards.maxItems=999,
  c=>c.output.fields.workflowDefinition.fields.guards.minItems=9,
  c=>c.output.fields.intentBindings.fields.confirmDownload.fields.roles.items={type:'undefined'},
  c=>c.output.fields.workflowDefinition.fields.states.items.fields.stateKey={type:'record',
   fields:{a:{type:'record',fields:{b:{type:'record',fields:{c:{type:'record',
    fields:{d:'string'}}}}}}}}
 ];
 for(const change of bad){
  const p=copy(x.p),el=p.elements.find(e=>e.id==='xdownload.policy'),
   f=el.functions.find(z=>z.id===FN);
  change(f.contract);
  assert.throws(()=>compileDisV020Aot({built:x.artifact.built,program:p,
   sources:x.f.sources,expectedSourceOrigins:x.f.expectedSourceOrigins}),
   deny('DIS_FUNCTION_SCHEMA_INVALID'));
 }
});

test('B20 R66 nested optional array output ABI changes are versioned and not falsely same-major compatible',async()=>{
 const x=await ctx,prev=x.contract,next=copy(prev);
 next.version='1.2.0';
 assert.equal(compareDisV020FunctionContracts(prev,next).compatible,true);
 const broken=copy(next);broken.output.fields.workflowDefinition.fields.guards.items.fields.guardId='number';
 assert.throws(()=>compareDisV020FunctionContracts(prev,broken),deny('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 const sneaky=copy(prev);sneaky.output.fields.intentBindings.fields.confirmDownload.fields.roles.maxItems=1;
 assert.throws(()=>compareDisV020FunctionContracts(prev,sneaky),deny('DIS_FUNCTION_ABI_UNVERSIONED_DRIFT'));
 assert.equal(validateDisV020FunctionValue(prev,'input',{}),true);
 assert.throws(()=>validateDisV020FunctionValue(prev,'output',{domainId:'downloads',
  workflowDefinition:{workflowKey:'x',initialState:'y',guards:[{}],states:[{stateKey:'z'}]},
  intentBindings:{confirmDownload:{trigger:{kind:'event',eventType:'X'},roles:['requester']}}
 }),deny('DIS_FUNCTION_OUTPUT_INVALID'));
});
