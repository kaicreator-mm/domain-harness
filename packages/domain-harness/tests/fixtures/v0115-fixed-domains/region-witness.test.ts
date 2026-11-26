import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkflowFunction, createWorkflowSlot, InteractionElement, runWorkflowRegion, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { NativeWorkflowContext, WorkflowCapability, WorkflowRegionDefinition, WorkflowRegionView, WorkflowRegionProposal,
  WorkflowSlot, WorkflowSlotBinding, WorkflowObservation } from '@kaicreator/domain-harness';
import { fixture, ok, reject, optimize, planMetrics, solveRepair, scheduleMetrics } from './domain.js';
import type { Demand, Offer, Plan, Job, Schedule, Outcome } from './domain.js';

const limits={maxWork:20000000,maxDescendantDepth:2,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,
  maxNodes:30,maxBindings:32,maxEdits:8,maxProjectionBytes:16384};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null;
const context=(slot:string):WorkflowSlotBinding=>({kind:'context',slot});
const result=(node:string,slot='value'):WorkflowSlotBinding=>({kind:'result',node,slot});
const id=(v:WorkflowRegionView,name:string)=>{
  const found=v.progress.find(n=>n.definitionId===name&&n.state!=='removed'&&n.state!=='skipped');
  if(!found)throw Error('missing occurrence');return found.instanceId;
};
const accepted=(v:WorkflowRegionView,name:string)=>v.progress.some(n=>n.definitionId===name&&n.state==='accepted');
const decision=(v:WorkflowRegionView,action:WorkflowRegionProposal['action'],edits:WorkflowRegionProposal['edits']=[])=>ok({
  source:'native' as const,proposal:{runId:v.runId,regionId:v.regionId,factRevision:v.factRevision,planRevision:v.planRevision??0,action,edits}});
function domain(){
  let epoch=1;
  const knowledge={maxItems:2,equal:Object.is,current:()=>({epoch,context:{scope:'actual-domain',
    revisions:new Map([['source','1'],['constraint',String(epoch)]])}})};
  const current=()=>true;
  const requirements=[{key:'source',accepts:['authority'] as const},{key:'constraint',accepts:['authority'] as const}];
  const trace:WorkflowObservation[]=[];
  const session=new StandardWorkflowSession({maxCalls:1000,maxSteps:1500,maxDepth:4},{
    knowledge,current,limits:{maxWork:30000000,maxEvents:400,maxActiveScopes:16,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:5},
    observe:r=>{trace.push(r);}
  });
  const refresh=(source:unknown,constraint:unknown)=>({changed:[],dependencies:requirements.map(r=>({key:r.key,dependsOn:[]})),
    observations:[{key:'source',origin:'authority' as const,state:'known' as const,value:source,source:{id:'source',scope:'actual-domain',revision:'1'}},
      {key:'constraint',origin:'authority' as const,state:'known' as const,value:constraint,source:{id:'constraint',scope:'actual-domain',revision:String(epoch)}}]});
  const definition=<I,O>(options:Pick<WorkflowRegionDefinition<I,O>,'capabilities'|'contextSlots'|'layout'|'refresh'|'plan'|'complete'>&
    Partial<Pick<WorkflowRegionDefinition<I,O>,'clarify'>>):WorkflowRegionDefinition<I,O>=>({
    id:'actual-domain',goal:'professional constraints and actual result',constraints:['actual authoritative inputs'],limits,knowledge,current,
    requiredKnowledge:requirements,optionalKnowledge:[],admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),
    replay:'pure-read-only',...options});
  return {session,trace,definition,refresh,advance:()=>{epoch++;}};
}
function read<I>(id:string,slot:WorkflowSlot<I>,onRun:()=>void):WorkflowCapability {
  return bindWorkflowFunction<I,I>({id,description:'actual typed source',inputs:{value:slot},outputs:{value:slot},input:r=>r.read('value',slot),
    node:{id,goal:'read source',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),run:v=>{onRun();return ok(v);},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',slot,v)});
}
async function userConstraint(root:NativeWorkflowContext,answer:number):Promise<Outcome<number>>{
  const e=new InteractionElement({onPrompt:(p,actual)=>{setImmediate(()=>actual.submit({
    intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{constraint:answer}}));}});
  return e.runIn(root,scope=>scope.resolve<number,number>(0,(_state,event)=>{
    if(event.kind==='initial')return ok({kind:'clarify',state:1,prompt:{decisionKey:'constraint',title:'Change actual constraint',
      actions:['submit'],fields:[{id:'constraint',kind:'number',label:'constraint',required:true}]}});
    return event.response.action==='submit'&&typeof event.response.values.constraint==='number'
      ?ok({kind:'ready',intent:event.response.values.constraint}):reject('INVALID_RESPONSE');
  }));
}

test('public D-A region revalidates actual procurement after feedback, retains unaffected source anchor',async()=>{
  const d=domain(),offers=fixture.DA.offers;let demand:Demand={lead:5,budget:75};
  const counts={source:0,solve:0,verify:0};let asked=false;
  const offerSlot=createWorkflowSlot('offers',(v):v is Offer[]=>Array.isArray(v)&&v.every((x:unknown)=>object(x)&&typeof x.id==='string'&&typeof x.cost==='number'));
  const demandSlot=createWorkflowSlot('demand',(v):v is Demand=>object(v)&&typeof v.lead==='number'&&typeof v.budget==='number');
  const planSlot=createWorkflowSlot('plan',(v):v is Plan=>object(v)&&Array.isArray(v.counts)&&typeof v.cost==='number'&&typeof v.lead==='number');
  const source=read('read',offerSlot,()=>{counts.source++;});
  const solve=bindWorkflowFunction<{offers:Offer[];demand:Demand},Plan>({id:'solve',description:'actual procurement enumeration',
    inputs:{offers:offerSlot,demand:demandSlot},outputs:{value:planSlot},
    input:r=>{const a=r.read('offers',offerSlot),b=r.read('demand',demandSlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({offers:a.value,demand:b.value});},
    node:{id:'solve',goal:'find optimal purchase',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:i=>{counts.solve++;const p=optimize(i.offers,i.demand);return p?ok(p):reject('INFEASIBLE');},
      after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&planMetrics(i.offers,a.outcome.value.counts,i.demand)!==null?ok(undefined):reject('INVALID'),
      project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',planSlot,v)});
  const verify=bindWorkflowFunction<{plan:Plan;demand:Demand},Plan>({id:'verify',description:'verify purchase constraints',
    inputs:{plan:planSlot,demand:demandSlot},outputs:{value:planSlot},
    input:r=>{const a=r.read('plan',planSlot),b=r.read('demand',demandSlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({plan:a.value,demand:b.value});},
    node:{id:'verify',goal:'verify purchase',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:i=>{counts.verify++;const p=planMetrics(offers,i.plan.counts,i.demand);return p&&p.cost===i.plan.cost?ok(i.plan):reject('INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',planSlot,v)});
  const definition=d.definition<void,Plan>({capabilities:[source,solve,verify],contextSlots:{offers:offerSlot,demand:demandSlot},layout:[
    {kind:'anchor',id:'read',node:{alias:'read',capability:'read',input:{value:context('offers')}}},
    {kind:'anchor',id:'solve',node:{alias:'solve',capability:'solve',input:{offers:result('read'),demand:context('demand')}}},
    {kind:'anchor',id:'verify',node:{alias:'verify',capability:'verify',input:{plan:result('solve'),demand:context('demand')}}}],
    refresh:(_i,_root,_prev,w)=>{const a=w.put('offers',offerSlot,offers),b=w.put('demand',demandSlot,demand);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({...d.refresh(offers,demand),slotEvidence:{offers:['source'],demand:['constraint']}});},
    plan:v=>{if(accepted(v,'verify')&&!asked){asked=true;
      const initial=v.reader.read(id(v,'verify')+'/value',planSlot);assert.deepEqual(initial,ok(fixture.DA.enumeration.cases[0]?.optimum));
      return decision(v,'clarify');}return decision(v,accepted(v,'verify')?'finish':'continue');},
    clarify:async(_v,root)=>{const response=await userConstraint(root,3);if(response.status!=='COMPLETE')return response;
      demand={...demand,lead:response.value};d.advance();return ok(undefined);},
    complete:v=>v.reader.read(id(v,'verify')+'/value',planSlot)});
  const r=await d.session.run(root=>runWorkflowRegion(root,definition,undefined),{goal:'actual final cost and lead',requiredKnowledge:[],terminalReads:0,
    validate:p=>planMetrics(offers,p.counts,demand)?.cost===64&&p.cost===64?ok(undefined):reject('FINAL_INVALID')});
  assert.deepEqual(r,ok(fixture.DA.enumeration.cases.find(c=>c.lead===3&&c.budget===75)?.optimum));
  assert.deepEqual(counts,{source:1,solve:2,verify:2});
  assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
});

test('public D-B region replaces pending template in mutable gap and runs actual solver exactly once',async()=>{
  const d=domain(),jobs=fixture.DB.jobs,deadline=7;
  const counts={read:0,solve:0,verify:0};let edited=false;
  const jobSlot=createWorkflowSlot('jobs',(v):v is Job[]=>Array.isArray(v)&&v.every((x:unknown)=>object(x)&&typeof x.id==='string'&&typeof x.I==='number'&&typeof x.R==='number'));
  const deadlineSlot=createWorkflowSlot('deadline',(v):v is number=>typeof v==='number'&&Number.isInteger(v));
  const scheduleSlot=createWorkflowSlot('schedule',(v):v is Schedule=>object(v)&&Array.isArray(v.starts)&&typeof v.makespan==='number'&&typeof v.sum==='number');
  const source=read('read',jobSlot,()=>{counts.read++;});
  const solve=bindWorkflowFunction<{jobs:Job[];deadline:number},Schedule>({id:'solve',description:'actual scipy MILP',
    inputs:{jobs:jobSlot,deadline:deadlineSlot},outputs:{value:scheduleSlot},
    input:r=>{const a=r.read('jobs',jobSlot),b=r.read('deadline',deadlineSlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({jobs:a.value,deadline:b.value});},
    node:{id:'solve',goal:'actual repair solve',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:(i,root)=>{counts.solve++;return solveRepair(i.jobs,i.deadline,root.signal);},
      after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&scheduleMetrics(i.jobs,a.outcome.value.starts,i.deadline)!==null?ok(undefined):reject('INVALID'),
      project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const verified=(v:Schedule)=>{const metrics=scheduleMetrics(jobs,v.starts,deadline);
    return metrics!==null&&metrics.makespan===v.makespan&&metrics.sum===v.sum&&v.makespan===fixture.DB.enumeration.best[0]&&v.sum===fixture.DB.enumeration.best[1];};
  const verify=bindWorkflowFunction<Schedule,Schedule>({id:'verify',description:'verify actual repair schedule',
    inputs:{value:scheduleSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',scheduleSlot),
    node:{id:'verify',goal:'verify constraints',requiredKnowledge:[],before:()=>ok(undefined),run:v=>{counts.verify++;return verified(v)?ok(v):reject('INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const definition=d.definition<void,Schedule>({capabilities:[source,solve,verify],contextSlots:{jobs:jobSlot,deadline:deadlineSlot},layout:[
    {kind:'anchor',id:'read',node:{alias:'read',capability:'read',input:{value:context('jobs')}}},
    {kind:'gap',id:'schedule',templates:[{alias:'seed',capability:'solve',input:{jobs:context('jobs'),deadline:context('deadline')}}],seed:['seed']},
    {kind:'anchor',id:'verify',node:{alias:'verify',capability:'verify',input:{value:result('seed')}}}],
    refresh:(_i,_root,_prev,w)=>{const a=w.put('jobs',jobSlot,jobs),b=w.put('deadline',deadlineSlot,deadline);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({...d.refresh(jobs,deadline),slotEvidence:{jobs:['source'],deadline:['constraint']}});},
    plan:v=>{if(accepted(v,'read')&&!edited){edited=true;return decision(v,'continue',[
      {kind:'insert',gap:'schedule',node:{alias:'actual',capability:'solve',input:{jobs:result(id(v,'read')),deadline:context('deadline')}}},
      {kind:'rebind',node:id(v,'verify'),input:'value',to:result('actual')},{kind:'remove',node:id(v,'solve')}]);}
      return decision(v,accepted(v,'verify')?'finish':'continue');},
    complete:v=>v.reader.read(id(v,'verify')+'/value',scheduleSlot)});
  const r=await d.session.run(root=>runWorkflowRegion(root,definition,undefined),{goal:'actual final schedule',requiredKnowledge:[],terminalReads:0,
    validate:p=>verified(p)?ok(undefined):reject('FINAL_INVALID')});
  assert.equal(r.status,'COMPLETE');assert.deepEqual(counts,{read:1,solve:1,verify:1});
  assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
});
