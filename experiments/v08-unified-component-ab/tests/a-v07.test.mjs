import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {adaptLegacyView} from '../unified.mjs';
import {unifyLegacyRuntime} from '../legacy-a.mjs';

if(!process.env.V07_ROOT)throw new Error('V07_ROOT exact v0.7 worktree required');
const v07=process.env.V07_ROOT;
const load=async file=>import(pathToFileURL(join(v07,'packages/domain-harness/src/contracts',file+'.ts')).href);
const component=await load('component'),tools=await load('tool-component'),
 digests=await load('component-digest'),graphs=await load('definition-graph'),
 selection=await load('capability-provision');
const sha={digestUtf8:async str=>createHash('sha256').update(str).digest('hex')};
const copy=x=>structuredClone(x);
const required={capabilityId:'sample.evaluate',version:'1.0.0'};
const semantic={family:'semantic',componentId:'workflow',kind:{kindId:'kaicreator.workflow',version:'1.0.0'},
 requiredSemanticContracts:[],requiredCapabilities:[copy(required)],
 semanticBody:{initial:'idle',states:[{stateId:'idle'}],transitions:[]}};
const tool={family:'tool',componentId:'evaluator',kind:{kindId:'sample.tool',version:'1.0.0'},
 requiredSemanticContracts:[],requiredCapabilities:[],
 semanticBody:{operations:[{operationId:'evaluate',inputSchema:{},outputSchema:{},effect:'none',declaredFailures:['DENIED']}],
 providesCapabilities:[copy(required)]}};
const graph={graphId:'sample-graph',components:[semantic,tool],relations:[
 {relationId:'uses-evaluator',relationKind:'requires',sourceComponentId:'workflow',targetComponentId:'evaluator'}
]};
test('U06 A real v0.7 Component and Tool validator on frozen records',()=>{
 component.validateComponentEnvelope(semantic);component.validateComponentEnvelope(tool);
 tools.validateToolComponent(tool);graphs.validateDefinitionGraphEnvelope(graph);
 assert.deepEqual(component.COMPONENT_FAMILIES,['semantic','tool']);
 assert.equal(adaptLegacyView(semantic).callable,false);
 assert.equal(adaptLegacyView(tool).callable,true);
});
test('U06 A original v0.7 Component digest and graph digest stay byte-identical after making views',async()=>{
 const a=await digests.computeComponentSemanticDigest(semantic,sha);
 const b=await digests.computeComponentSemanticDigest(tool,sha);
 const graphDigest=await graphs.computeDefinitionGraphDigest(graph,sha);
 const before={a,b,graphDigest};
 const viewSemantic=adaptLegacyView(semantic),viewTool=adaptLegacyView(tool);
 assert.equal(viewSemantic.legacyFamily,'semantic');assert.equal(viewTool.legacyFamily,'tool');
 assert.deepEqual({a:await digests.computeComponentSemanticDigest(semantic,sha),
  b:await digests.computeComponentSemanticDigest(tool,sha),
  graphDigest:await graphs.computeDefinitionGraphDigest(graph,sha)},before);
 assert.notEqual(a,b);assert.equal(a.length,64);
 const permuted={...graph,components:[tool,semantic]};
 assert.equal(await graphs.computeDefinitionGraphDigest(permuted,sha),graphDigest);
 // Legacy digest changes on semantic change; adapter does not rewrite history.
 const mutated=copy(semantic);mutated.semanticBody.initial='changed';
 assert.notEqual(await digests.computeComponentSemanticDigest(mutated,sha),a);
});
test('U06 A real v0.7 provider selection remains Tool-only and exact',()=>{
 const result=selection.selectCapabilityProvider(graph,required,'workflow');
 assert.equal(result.provider.componentId,'evaluator');assert.equal(result.provider.family,'tool');
 assert.deepEqual(result.provider.providesCapability,required);
 const mismatch={...required,version:'2.0.0'};
 assert.throws(()=>selection.selectCapabilityProvider(graph,mismatch),e=>e.code==='CAPABILITY_PROVIDER_NOT_FOUND');
});
test('U06 A uniform runtime view invokes both v0.7 Tool and explicitly selected semantic Kind adapter',()=>{
 const selected=selection.selectCapabilityProvider(graph,required,'workflow');
 const runtime=unifyLegacyRuntime({
  validatedEnvelopes:graph.components,selectedProvider:selected.provider.componentId,
  handlers:{evaluator:{evaluate:({value})=>({eligible:value>=70})}},
  kindAdapters:{'kaicreator.workflow@1.0.0':{
    run:({value},definition)=>({state:definition.initial,authorized:true,value})}}
 });
 assert.deepEqual(runtime.invoke('evaluator','evaluate',{value:75}),{eligible:true});
 assert.deepEqual(runtime.invoke('workflow','run',{value:75}),{state:'idle',authorized:true,value:75});
 assert.throws(()=>runtime.invoke('workflow','evaluate',{value:75}),e=>e.code==='E_LEGACY_NOT_CALLABLE');
 assert.throws(()=>runtime.invoke('evaluator','unknown',{value:75}),e=>e.code==='E_LEGACY_NOT_ADMITTED');
});
test('U06 A negative: tool/semantic family cannot silently change or gain a Provider',async()=>{
 const rewritten=copy(semantic);rewritten.family='tool';
 assert.throws(()=>tools.validateToolComponent(rewritten));
 assert.notEqual(await digests.computeComponentSemanticDigest(rewritten,sha),
  await digests.computeComponentSemanticDigest(semantic,sha));
 const illegal=copy(tool);illegal.semanticBody.providesCapabilities.push(copy(required));
 assert.throws(()=>tools.validateToolComponent(illegal));
});
