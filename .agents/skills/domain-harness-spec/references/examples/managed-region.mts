import assert from 'node:assert/strict';
import { StandardWorkflowSession, createWorkflowSlot, bindWorkflowFunction, runWorkflowRegion } from '@kaicreator/domain-harness';
import type { StandardWorkflowOutcome, WorkflowNode, WorkflowRegionDefinition, WorkflowKnowledgePolicy, WorkflowObservation } from '@kaicreator/domain-harness';

const ok=<T,>(value:T):StandardWorkflowOutcome<T>=>({status:'COMPLETE',value});
const reject=<T,>(code:string):StandardWorkflowOutcome<T>=>({status:'REJECT',reason:{code,message:code}});
// 示例可信本地价格；真实应用需读取并校验实际权威来源，而非接受用户自签数据。
const price=9007199254740993n;
const knowledge:WorkflowKnowledgePolicy={maxItems:1,equal:(_key,left,right)=>Object.is(left,right),
  current:()=>({epoch:1,context:{scope:'local-quote',revisions:new Map([['catalog','1']])}})};
const current=()=>true;
const requirements=[{key:'price',accepts:['authority'] as const}];
const observations=[{key:'price',origin:'authority' as const,state:'known' as const,value:price,source:{id:'catalog',scope:'local-quote',revision:'1'}}];
const amount=createWorkflowSlot('amount',(v):v is bigint=>typeof v==='bigint');
const multiply:WorkflowNode<bigint,bigint>={id:'calculate',goal:'compute exact two-unit total',requiredKnowledge:requirements,
  knowledge:()=>ok(observations),before:v=>v===price?ok(undefined):reject('PRICE_INVALID'),
  run:v=>ok(v*2n),after:(v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&a.outcome.value-v===v?ok(undefined):reject('TOTAL_INVALID'),
  project:()=>({effect:'none',detail:null}),replay:'pure-read-only'};
const capability=bindWorkflowFunction<bigint,bigint>({id:'calculate',description:'exact native bigint calculation',inputs:{price:amount},outputs:{total:amount},
  input:r=>r.read('price',amount),node:multiply,output:(v,w)=>w.put('total',amount,v)});
const region:WorkflowRegionDefinition<bigint,bigint>={id:'quote',goal:'exact total',constraints:['two units'],limits:{maxWork:5000000,maxDescendantDepth:0,
  maxCandidateBytes:8192,maxJsonDepth:16,maxJsonItems:256,maxNodes:4,maxBindings:4,maxEdits:2,maxProjectionBytes:8192},
  capabilities:[capability],knowledge,current,requiredKnowledge:requirements,optionalKnowledge:[],contextSlots:{price:amount},
  layout:[{kind:'anchor',id:'total',node:{alias:'calculate',capability:'calculate',input:{price:{kind:'context',slot:'price'}}}}],
  refresh:(v,_root,_previous,w)=>{const put=w.put('price',amount,v);return put.status!=='COMPLETE'?put:ok({changed:[],dependencies:[{key:'price',dependsOn:[]}],observations,slotEvidence:{price:['price']}});},
  plan:view=>ok({source:'native',proposal:{runId:view.runId,regionId:view.regionId,factRevision:view.factRevision,planRevision:view.planRevision??0,
    action:view.progress.some(n=>n.definitionId==='calculate'&&n.state==='accepted')?'finish':'continue',edits:[]}}),
  admit:()=>ok(undefined),canSkip:()=>reject('REQUIRED'),canRebind:()=>reject('REQUIRED'),replay:'pure-read-only',
  complete:view=>{const done=view.progress.find(n=>n.definitionId==='calculate'&&n.state==='accepted');return done?view.reader.read(done.instanceId+'/total',amount):reject('NO_RESULT');}};
const trace:WorkflowObservation[]=[];
const session=new StandardWorkflowSession({maxCalls:40,maxSteps:80,maxDepth:2},{knowledge,current,
  limits:{maxWork:10000000,maxEvents:60,maxActiveScopes:8,maxActiveMs:10000,maxSettlementMs:1000,maxNoProgress:3},
  observe:r=>{trace.push(r);}});
const result=await session.run(async root=>{
  const noModel=root.recordModelDecision('exact native calculation','not-needed');if(noModel.status!=='COMPLETE')return noModel;
  const fixed=await root.node(multiply,price,{knowledge,current});if(fixed.status!=='COMPLETE')return fixed;
  const dynamic=await runWorkflowRegion(root,region,price);if(dynamic.status!=='COMPLETE')return dynamic;
  return fixed.value===dynamic.value?dynamic:reject<bigint>('MISMATCH');
},{goal:'verified total',requiredKnowledge:[],terminalReads:0,validate:v=>v===18014398509481986n?ok(undefined):reject('FINAL_TOTAL')});
assert.deepEqual(result,ok(18014398509481986n));
const nodes=session.dispositions().filter(r=>r.kind==='node');
assert.equal(nodes.length,2);assert.ok(nodes.every(r=>r.kind==='node'&&r.acceptance==='accepted'));
assert.equal(new Set(nodes.map(r=>r.kind==='node'?r.occurrence.instanceId:'')).size,2);
assert.equal(new Set(trace.map(r=>r.runId)).size,1);
// 声明层错误类型必须被拒绝；不执行负例。
const typeNegatives=async()=>{
  const wrong=createWorkflowSlot('other',(v):v is string=>typeof v==='string');
  // @ts-expect-error 原生 bigint 输入不能绑定 string token
  bindWorkflowFunction<bigint,bigint>({id:'wrong',description:'type negative',inputs:{price:wrong},outputs:{total:amount},input:r=>r.read('price',wrong),node:multiply,output:(v,w)=>w.put('total',amount,v)});
  // @ts-expect-error 禁止私有模块路径
  await import('@kaicreator/domain-harness/dist/workflow-slots.js');
}
void typeNegatives;
console.log('MANAGED_REGION_EXAMPLE_PASS');
