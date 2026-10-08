import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sealB, UCError, digest} from '../unified.mjs';
import {assemblyInputs,componentsFor,implementationsFor,cap,kind} from '../fixtures.mjs';
const refRoot=process.env.REFERENCE_938_ROOT;
if (!refRoot) throw new Error('REFERENCE_938_ROOT must point at exact #940 source');
const ref=await import(pathToFileURL(join(refRoot,'bootstrap.mjs')).href);
const pins=JSON.parse(await readFile(join(refRoot,'pins.json'),'utf8'));
const error=code=>e=>e instanceof UCError && e.code===code;
async function pkgRuntime(business='approval',params={}) {
 return ref.bootstrap({root:refRoot,sdk:pins.sdk,business:pins[business],...params});
}
const create=async(business='approval',options={})=>{
 const r=await pkgRuntime(business);
 const inputs=assemblyInputs(r.assembly.packages,business);
 return {r,inputs,compiled:sealB({...inputs,...options})};
};
async function sandbox(fn){
 const temp=await mkdtemp(join(tmpdir(),'uc942-'));
 await cp(refRoot,temp,{recursive:true});
 try{return await fn(temp)}finally{await rm(temp,{recursive:true,force:true})}
}
async function alterManifest(root,path,update){
 const f=join(root,path,'manifest.json'),m=JSON.parse(await readFile(f,'utf8'));
 update(m);const data=JSON.stringify(m,null,2)+'\n';await writeFile(f,data);
 return {path,digest:ref.blobSHA(data)};
}

test('U01 Schema has identity/graph relation, NO callable Operation',async()=>{
 const {compiled}=await create();
 assert.deepEqual(compiled.inspect('schema').operations,[]);
 assert.ok(compiled.inspect('rule').relations.some(r=>r.targetComponentId==='schema'));
 assert.throws(()=>compiled.invoke('schema.read@1.0.0','read',{}),error('E_MISSING_PROVIDER'));
});
test('U02 Rule uses selected Kind implementation and schema semantic relation',async()=>{
 const {inputs}=await create(),engine=sealB({...inputs,entryCapabilities:[...inputs.entryCapabilities,'rule.check@1.0.0']});
 assert.equal(engine.invoke('rule.check@1.0.0','test',{value:75}).eligible,true);
 assert.equal(engine.invoke('rule.check@1.0.0','test',{value:25}).eligible,false);
 assert.throws(()=>engine.invoke('rule.check@1.0.0','test',{value:'bad'}),error('E_INPUT_SCHEMA'));
});
test('U03 Decision: 0/1/N and stable selection evidence',async()=>{
 const {inputs}=await create();
 const engine=sealB({...inputs,entryCapabilities:[...inputs.entryCapabilities,'decision.choose@1.0.0']});
 const choose=(value,candidates)=>engine.invoke('decision.choose@1.0.0','choose',{value,candidates});
 assert.deepEqual(choose(10,['a','b']),{status:'WAIT',selected:'',candidates:[]});
 assert.deepEqual(choose(75,['b']),{status:'SELECT',selected:'b',candidates:['b']});
 assert.deepEqual(choose(75,['b','a']),{status:'SELECT',selected:'a',candidates:['a','b']});
});
test('U04/W01 bounded Workflow WAIT then accepted resumed payload, and N routing',async()=>{
 const {compiled}=await create();
 const run=(value,candidates)=>compiled.invoke('workflow.run@1.0.0','run',{value,candidates});
 assert.equal(run(40,['review']).status,'WAIT');
 const good=run(75,['review','manual']);
 assert.equal(good.status,'COMPLETE');assert.equal(good.selected,'manual');
 assert.equal(good.facts.approved,true);assert.equal(good.facts.choice,'manual');
});
test('U05 Operation none input/output schema and effectful authority denial',async()=>{
 const {compiled}=await create();
 assert.throws(()=>compiled.invoke('business.notify@1.0.0','send',{message:'sent'}),error('E_EFFECT_AUTHORITY'));
 assert.throws(()=>compiled.invoke('business.notify@1.0.0','send',{message:99}),error('E_INPUT_SCHEMA'));
 const {inputs}=await create();
 let calls=0;
 const withHost=sealB({...inputs,effectAuthority:{invoke:({perform,effect,assemblyDigest})=>{
   assert.equal(effect,'non-idempotent'); assert.ok(assemblyDigest);
   calls++;return perform();
 }}});
 assert.deepEqual(withHost.invoke('business.notify@1.0.0','send',{message:'hi'}),{accepted:true});
 assert.equal(calls,1);
});
test('U07 all five Standard Kinds in one graph and deterministic immutable Assembly',async()=>{
 const {inputs}=await create();
 const a=sealB(inputs),b=sealB({...inputs,components:[...inputs.components].reverse(),
 implementations:[...inputs.implementations].reverse()});
 assert.equal(a.assembly.digest,b.assembly.digest);
 assert.equal(new Set(inputs.components.map(c=>c.kindRef.kindId)).size,5);
 assert.equal(a.assembly.definitionDigest,b.assembly.definitionDigest);
 assert.throws(()=>{a.assembly.bindings[0].implementationId='changed'},TypeError);
});
test('P03 missing, duplicate and version-mismatched Provider fail closed',async()=>{
 const {inputs}=await create();
 let cs=structuredClone(inputs.components);
 cs=cs.filter(c=>c.componentId!=='rule');
 assert.throws(()=>sealB({...inputs,components:cs}),error('E_MISSING_PROVIDER'));
 cs=structuredClone(inputs.components);
 cs.find(c=>c.componentId==='action').providedCapabilities.push(cap('rule.check',['perform']));
 assert.throws(()=>sealB({...inputs,components:cs}),error('E_AMBIGUOUS_PROVIDER'));
 cs=structuredClone(inputs.components);
 cs.find(c=>c.componentId==='decision').requiresCapabilities[0].version='2.0.0';
 assert.throws(()=>sealB({...inputs,components:cs}),error('E_MISSING_PROVIDER'));
});
test('P04 undeclared invocation, illegal graph relation, Capability cycles',async()=>{
 const {inputs}=await create();
 const engine=sealB(inputs);
 assert.throws(()=>engine.invoke('business.action@1.0.0','perform',{selected:'a'}),error('E_UNAUTHORIZED'));
 assert.throws(()=>engine.invoke('workflow.run@1.0.0','skip',{}),error('E_UNDECLARED_OPERATION'));
 const cs=structuredClone(inputs.components);
 cs.find(c=>c.componentId==='rule').relations.push({targetComponentId:'missing',relationKind:'uses'});
 assert.throws(()=>sealB({...inputs,components:cs}),error('E_RELATION_TARGET'));
 const cycle=structuredClone(inputs.components);
 cycle.find(c=>c.componentId==='rule').requiresCapabilities.push(cap('workflow.run',['run']));
 assert.throws(()=>sealB({...inputs,components:cycle}),error('E_CAPABILITY_CYCLE'));
});
test('invalid Kind binding, unsupported Kind operations and declared error ABI refusal',async()=>{
 const {inputs}=await create(),bad=inputs.implementations.map(b=>({...b}));
 bad.find(x=>x.componentId==='workflow').kindRef=kind('schema');
 assert.throws(()=>sealB({...inputs,implementations:bad}),error('E_KIND_BINDING_MISMATCH'));
 const bs=structuredClone(inputs.components);
 bs.find(x=>x.componentId==='rule').operations[0].effect='unknown';
 assert.throws(()=>sealB({...inputs,components:bs}),error('E_OPERATION_CONTRACT'));
});
test('new custom open Kind needs no kernel switch or enum modification',async()=>{
 const {inputs}=await create(),extension={
  schemaVersion:'ucb/1',componentId:'metric',packageId:'sdk',
  kindRef:{kindId:'custom.metric',version:'7.0.0'},semanticBody:{metric:'status'},
  requiredSemanticContracts:[],requiresCapabilities:[],relations:[],
  providesCapabilities:[cap('custom.metric',['ping'])],
  operations:[{operationId:'ping',inputSchema:{required:{}},outputSchema:{required:{ok:'boolean'}},effect:'none',failures:[]}]
 };
 const implementation={componentId:'metric',kindRef:extension.kindRef,implementationId:'custom-impl',implementationVersion:'1.0.0',
  implementationDigest:'custom-sha256:example',handlers:{ping:()=>({ok:true})}};
 const x=sealB({...inputs,components:[...inputs.components,extension],
  implementations:[...inputs.implementations,implementation],
  entryCapabilities:[...inputs.entryCapabilities,'custom.metric@1.0.0']});
 assert.deepEqual(x.invoke('custom.metric@1.0.0','ping',{}),{ok:true});
});
test('B new definition digest and exact Assembly reject historical or alien binding',async()=>{
 const {inputs}=await create();
 const original=sealB(inputs);
 const changed=structuredClone(inputs.components);
 changed.find(c=>c.componentId==='rule').semanticBody.threshold=90;
 const newer=sealB({...inputs,components:changed});
 assert.notEqual(newer.assembly.digest,original.assembly.digest);
 assert.notEqual(newer.assembly.definitionDigest,original.assembly.definitionDigest);
 assert.throws(()=>newer.invoke('workflow.run@1.0.0','run',{value:90,candidates:['a']},
  {expectedAssembly:original.assembly.digest}),error('E_FOREIGN_ASSEMBLY'));
 assert.equal(original.invoke('workflow.run@1.0.0','run',{value:75,candidates:['a']}).status,'COMPLETE');
 assert.equal(newer.invoke('workflow.run@1.0.0','run',{value:75,candidates:['a']}).status,'WAIT');
});
test('V02 unchanged SDK B components and implementation pins run Approval and Learning',async()=>{
 const a=await create('approval'),b=await create('learning');
 const run=(x,v)=>x.compiled.invoke('workflow.run@1.0.0','run',{value:v,candidates:['x']});
 assert.equal(run(a,75).facts.approved,true);
 assert.equal(run(b,90).facts.completed,true);
 assert.equal(run(b,75).status,'WAIT');
 assert.deepEqual(a.inputs.components.filter(c=>c.packageId==='sdk'),
  b.inputs.components.filter(c=>c.packageId==='sdk'));
 assert.deepEqual(a.inputs.implementations.filter(x=>['schema','decision'].includes(x.componentId)).map(x=>x.implementationDigest),
  b.inputs.implementations.filter(x=>['schema','decision'].includes(x.componentId)).map(x=>x.implementationDigest));
});
test('P01/P02 B composes over actual pinned #938 three- and four-Package bootstrap',async()=>sandbox(async root=>{
 const three=await pkgRuntime('approval');
 const original=assemblyInputs(three.assembly.packages,'approval');
 const a=sealB(original);
 const business=await alterManifest(root,'business-approval',m=>m.dependencies.push({id:'support',version:'1.0.0'}));
 const four=await ref.bootstrap({root,sdk:pins.sdk,business,dependencyPins:{support:pins.support}});
 assert.deepEqual(four.assembly.packages.map(p=>p.id),['kernel','sdk','support','approval']);
 const b=sealB(assemblyInputs(four.assembly.packages,'approval'));
 assert.notEqual(a.assembly.digest,b.assembly.digest);
 assert.equal(b.invoke('workflow.run@1.0.0','run',{value:75,candidates:['a']}).status,'COMPLETE');
 const again=sealB(assemblyInputs(four.assembly.packages,'approval'));
 assert.equal(again.assembly.digest,b.assembly.digest);
}));
