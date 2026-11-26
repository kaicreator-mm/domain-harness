import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowSlot, bindWorkflowFunction, StandardWorkflowSession, resolveEvidence } from '../../../src/index.js';
import type { WorkflowSlot, WorkflowNode, WorkflowCapability, NativeWorkflowContext, StandardWorkflowOutcome } from '../../../src/index.js';
import { SlotLeaseScope } from '../../../src/workflow-slots.js';
import { invokeCapability } from '../../../src/workflow-capabilities.js';
import { fixture, optimize, planMetrics, solveRepair, scheduleMetrics } from './domain.js';
import type { Demand, Plan, Job, Schedule } from './domain.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
const ok = <T>(value: T): Outcome<T> => ({ status: 'COMPLETE', value });
const fail = <T>(): Outcome<T> => ({ status: 'REJECT', reason: { code: 'DOMAIN_INVALID', message: 'Domain invalid' } });
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
function node<I,O>(id:string, run:WorkflowNode<I,O>['run'], verify:(input:I,output:O)=>boolean):WorkflowNode<I,O>{
  return {id,goal:'actual professional constraints',requiredKnowledge:[],before:()=>ok(undefined),run,
    after:(input,actual)=>actual.kind==='returned'&&actual.outcome.status==='COMPLETE'&&verify(input,actual.outcome.value)?ok(undefined):fail(),
    project:()=>({effect:'none',detail:null})};
}
async function boundDomain<I,O>(input:I,inputSlot:WorkflowSlot<I>,outputSlot:WorkflowSlot<O>,
  actual:WorkflowNode<I,O>, verify:(value:O)=>boolean):Promise<Outcome<O>>{
  const knowledge={maxItems:1,equal:Object.is,current:()=>({epoch:1,context:{scope:'actual-domain',revisions:new Map([['authority','1']])}})};
  const options={knowledge,current:()=>true};
  const s=new StandardWorkflowSession({maxCalls:30,maxSteps:50,maxDepth:2},{
    ...options,limits:{maxWork:2000000,maxEvents:30,maxActiveScopes:8,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:5}});
  const a=bindWorkflowFunction<I,O>({id:'actual',description:'actual domain calculation',inputs:{input:inputSlot},outputs:{output:outputSlot},
    input:r=>r.read('input',inputSlot),node:actual,output:(v,w)=>w.put('output',outputSlot,v)});
  const b=bindWorkflowFunction<O,O>({id:'verify',description:'independent business verification',inputs:{output:outputSlot},outputs:{output:outputSlot},
    input:r=>r.read('output',outputSlot),node:node('verify',v=>verify(v)?ok(v):fail(),(_v,o)=>verify(o)),output:(v,w)=>w.put('output',outputSlot,v)});
  const allowed:readonly WorkflowCapability[]=[a,b];
  let runId='', entered=0;
  const result=await s.run(async(root:NativeWorkflowContext)=>{
    runId=root.runId;
    const leases=new SlotLeaseScope(()=>root.signal.aborted?undefined:knowledge.current());
    try{
      const values=await root.work(64,()=>{
        const staged=leases.write({input:inputSlot},1,w=>w.put('input',inputSlot,input));
        if(staged.status!=='COMPLETE')return staged;
        const resolved=resolveEvidence([{key:'input',accepts:['authority']}],[{key:'input',origin:'authority',state:'known',
          source:{id:'authority',scope:'actual-domain',revision:'1'},value:input}],knowledge.current().context,knowledge,1);
        return leases.contextEntries(staged.value,{input:['input']},resolved);
      });
      if(values.status!=='COMPLETE')return values;
      const first=await invokeCapability(a,allowed,{root,leases,inputs:values.value,maxBindings:1,options});
      if(first.status!=='COMPLETE')return first;
      entered++;assert.deepEqual(first.value.get('output')?.evidenceKeys,['input']);
      const second=await invokeCapability(b,allowed,{root,leases,inputs:first.value,maxBindings:1,options});
      if(second.status!=='COMPLETE')return second;
      entered++;
      return leases.read({output:outputSlot},second.value,1,r=>r.read('output',outputSlot));
    }finally{leases.close();}
  },{goal:'verify final professional result',requiredKnowledge:[],terminalReads:0,validate:v=>verify(v)?ok(undefined):fail()});
  assert.equal(entered,2);
  const records=s.dispositions().filter(r=>r.kind==='node');
  assert.deepEqual(records.map(r=>r.occurrence.definitionId),[actual.id,'verify']);
  assert.ok(records.every(r=>r.runId===runId&&r.acceptance==='accepted'));
  return result;
}
test('D-A two actual bound Functions consume native demand and pass validated procurement result',async()=>{
  const demand={lead:3,budget:75};
  const input=createWorkflowSlot('demand',(v):v is Demand=>object(v)&&typeof v.lead==='number'&&typeof v.budget==='number');
  const output=createWorkflowSlot('plan',(v):v is Plan=>object(v)&&Array.isArray(v.counts)&&typeof v.cost==='number'&&typeof v.lead==='number');
  const verify=(v:Plan)=>planMetrics(fixture.DA.offers,v.counts,demand)?.cost===64&&v.cost===64;
  const result=await boundDomain(demand,input,output,node('optimize',d=>{
    const p=optimize(fixture.DA.offers,d);return p?ok(p):fail();
  },(_d,p)=>verify(p)),verify);
  assert.deepEqual(result,ok(fixture.DA.enumeration.cases.find(c=>c.lead===3&&c.budget===75)?.optimum));
});
test('D-B two actual bound Functions consume native jobs and pass independently validated SciPy schedule',async()=>{
  const jobs=fixture.DB.jobs, deadline=7;
  const input=createWorkflowSlot('jobs',(v):v is Job[]=>Array.isArray(v)&&v.every((x:unknown)=>object(x)&&typeof x.id==='string'
    &&typeof x.release==='number'&&typeof x.I==='number'&&typeof x.R==='number'));
  const output=createWorkflowSlot('schedule',(v):v is Schedule=>object(v)&&Array.isArray(v.starts)&&typeof v.makespan==='number'&&typeof v.sum==='number');
  const verify=(v:Schedule)=>{const metrics=scheduleMetrics(jobs,v.starts,deadline);
    return metrics!==null&&metrics.makespan===v.makespan&&metrics.sum===v.sum&&v.makespan===fixture.DB.enumeration.best[0]&&v.sum===fixture.DB.enumeration.best[1];};
  const result=await boundDomain(jobs,input,output,node('solve',(j,scope)=>solveRepair(j,deadline,scope.signal),(_j,p)=>verify(p)),verify);
  assert.equal(result.status,'COMPLETE');
});
