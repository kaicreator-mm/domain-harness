import assert from 'node:assert/strict';
import { InteractionElement, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';
import type { InteractionDecision, InteractionPrompt, StandardWorkflowOutcome, WorkflowLimits } from '@kaicreator/domain-harness';
import { scheduleInteractively, type ScheduleInput, type ScheduleFacts } from './interactive.js';
import { baseline, downtime, WorkshopElement, validateSchedule, type Plan, type Task, type Policy, type SolverElement } from './plan.js';
const ok=<T>(value:T):StandardWorkflowOutcome<T>=>({status:'COMPLETE',value});
const limits=(calls:number,steps:number,depth=2):WorkflowLimits=>({maxCalls:calls,maxSteps:steps,maxDepth:depth});
const envelope=(p:InteractionPrompt)=>({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey});
export async function verifyInteraction(tasks:readonly Task[], solver:SolverElement, oracle:(tasks:readonly Task[],policy:Policy)=>number|null) {
  const facts:ScheduleFacts={tasks,current:downtime,scenarios:[baseline,downtime]};
  const initial=JSON.stringify(facts);
  const assertPlan=(plan:Plan,policy:Policy)=>{assert.equal(plan.revision,policy.revision);assert.equal(plan.makespan,oracle(tasks,policy));assert.ok(validateSchedule(tasks,policy,plan.starts,plan.makespan));};
  async function run(input:ScheduleInput, answers:readonly string[], budget:WorkflowLimits, f=facts) {
    const prompts:InteractionPrompt[]=[];const before=solver.calls;
    const active=scheduleInteractively(budget,input,f,solver,{onPrompt:(p,e)=>{prompts.push(p);const value=answers[prompts.length-1];if(value===undefined)throw Error('UNEXPECTED_PROMPT');assert.equal(e.submit({...envelope(p),action:'submit',values:{[p.fields[0]!.id]:value}}).accepted,true);}});
    return {result:await active.result,prompts,calls:solver.calls-before};
  }
  const complete=await run('排程 current',[],limits(6,10));assert.equal(complete.calls,1);assert.equal(complete.prompts.length,0);assert.equal(complete.result.status,'COMPLETE');if(complete.result.status!=='COMPLETE')throw Error('CURRENT');assertPlan(complete.result.value.plan,downtime);
  const structured=await run({goal:'current'},[],limits(6,10));assert.equal(structured.result.status,'COMPLETE');assert.equal(structured.prompts.length,0);
  const whatIf=await run('排程',['what-if','shop-v1'],limits(10,14));assert.equal(whatIf.calls,1);assert.deepEqual(whatIf.prompts.map(p=>p.decisionKey),['goal','scenario']);assert.equal(whatIf.result.status,'COMPLETE');if(whatIf.result.status!=='COMPLETE')throw Error('WHAT_IF');assertPlan(whatIf.result.value.plan,baseline);assert.equal(whatIf.result.value.goal,'what-if');
  const choice=whatIf.prompts[1]!.fields[0]!;assert.ok(choice.kind==='choice');assert.deepEqual(choice.options.map(o=>o.id),['shop-v1','shop-v2']);assert.ok(choice.comparison?.some(r=>r.label==='Closed slots'&&r.cells['shop-v2']?.includes('[3,4,5]')));assert.equal(choice.options.some(o=>o.recommended),false);
  const partial=await run('排程',['current'],limits(8,12));assert.equal(partial.calls,1);assert.equal(partial.result.status,'COMPLETE');assert.equal(partial.prompts.length,1);
  for(const budget of [limits(7,12),limits(8,11),limits(8,12,1)]){const short=await run('排程',['current'],budget);assert.equal(short.calls,0);assert.equal(short.prompts.length,1);assert.deepEqual(short.result,{status:'FAILED',reason:{code:'WORKSHOP_TOTAL_BUDGET',message:'WORKSHOP_TOTAL_BUDGET'}});}
  for(const [input,f,status] of [['排程 current',{...facts,current:undefined},'UNKNOWN'],['unsupported',facts,'UNKNOWN'],[{goal:'what-if',scenario:'not-allowed'},facts,'REJECT'],['排程 current',{...facts,tasks:[]},'ASK'],['排程 current',{...facts,tasks:tasks.map((t,i)=>i===0?{...t,after:['absent']}:t)},'UNKNOWN'],['排程 current',{...facts,tasks:tasks.map((t,i)=>i===0?{...t,after:['a-qc']}:t)},'REJECT']] as const){const refused=await run(input,[],limits(12,20),f);assert.equal(refused.calls,0);assert.equal(refused.prompts.length,0);assert.equal(refused.result.status,status);}
  const impossible:Policy={revision:'closed',horizon:8,closed:{repair:[0,1,2,3,4,5,6,7]}};
  const infeasible=await run({goal:'what-if',scenario:'closed'},[],limits(6,10),{...facts,scenarios:[impossible]});assert.equal(infeasible.calls,1);assert.equal(oracle(tasks,impossible),null);assert.deepEqual(infeasible.result,{status:'REJECT',reason:{code:'NO_FEASIBLE_PLAN',message:'NO_FEASIBLE_PLAN'}});
  let old:InteractionPrompt|undefined;const beforeRevision=solver.calls;
  const revision=await scheduleInteractively(limits(10,14),'排程',facts,solver,{onPrompt:(p,e)=>{
    if(!old){old=p;assert.equal(e.submit({...envelope(p),action:'submit',values:{goal:'what-if'}}).accepted,true);}
    else{assert.equal(e.submit({...envelope(old),action:'submit',values:{goal:'current'}}).accepted,false);assert.equal(e.submit({...envelope(p),action:'revise',text:'排程 current'}).accepted,true);}
  }}).result;assert.equal(solver.calls-beforeRevision,1);assert.equal(revision.status,'COMPLETE');if(revision.status==='COMPLETE')assertPlan(revision.value.plan,downtime);
  const beforeReview=solver.calls;
  const reviewed=await scheduleInteractively(limits(13,20),{goal:'what-if',scenario:'shop-v1'},facts,solver,{review:true,onPrompt:(p,e)=>{
    assert.ok(p.description?.includes('shop-v1: makespan 7'));assert.equal(solver.calls-beforeReview,1);assert.equal(e.submit({...envelope(p),action:'submit',values:{goal:'current'}}).accepted,true);
  }}).result;assert.equal(solver.calls-beforeReview,2);assert.equal(reviewed.status,'COMPLETE');if(reviewed.status!=='COMPLETE'||!reviewed.value.previous)throw Error('REVIEW');assertPlan(reviewed.value.previous,baseline);assertPlan(reviewed.value.plan,downtime);
  const beforeCancel=solver.calls;const cancelled=await scheduleInteractively(limits(8,12),'排程',facts,solver,{onPrompt:(_p,e)=>e.cancel()}).result;assert.equal(cancelled.status,'REJECT');assert.equal(solver.calls,beforeCancel);
  const nofit=await scheduleInteractively(limits(8,12),'排程',facts,solver,{onPrompt:(p,e)=>{assert.equal(e.submit({...envelope(p),action:'no-fit'}).accepted,true);}}).result;assert.equal(nofit.status,'ASK');assert.equal(solver.calls,beforeCancel);
  // Fixed comparison actually asks all three fields and solves the same what-if model. Calendar response is not authority.
  const fixedKeys=['goal','calendar','scenario'] as const;const fixedAnswers=['what-if',downtime.revision,baseline.revision];let fixedPrompts=0;
  const fixed=new InteractionElement({onPrompt:p=>{const value=fixedAnswers[fixedPrompts++]!;assert.equal(fixed.submit({...envelope(p),action:'submit',values:{[p.decisionKey]:value}}).accepted,true);}});
  const fixedResult=await runInteractiveRecognitionHandling<number,Policy,Plan>(fixed,limits(12,16),0,(n,event):StandardWorkflowOutcome<InteractionDecision<number,Policy>>=>{
    if(event.kind==='response'){assert.equal(event.response.action,'submit');if(event.response.action==='submit')assert.equal(event.response.values[fixedKeys[n-1]!],fixedAnswers[n-1]);}
    if(n===3)return ok({kind:'ready',intent:baseline});const key=fixedKeys[n]!;
    return ok({kind:'clarify',state:n+1,prompt:{decisionKey:key,title:key,fields:[{id:key,label:key,kind:'string',required:true}],actions:['submit']}});
  },(p,scope)=>new WorkshopElement(solver,p).runIn(scope.root,tasks));assert.equal(fixedResult.status,'COMPLETE');if(fixedResult.status==='COMPLETE')assertPlan(fixedResult.value,baseline);assert.equal(fixedPrompts,3);assert.equal(JSON.stringify(facts),initial);
  console.log(JSON.stringify({status:'WORKSHOP_INTERACTION_PASS',currentMakespan:complete.result.value.plan.makespan,whatIfMakespan:whatIf.result.value.plan.makespan,reviewMakespans:[reviewed.value.previous.makespan,reviewed.value.plan.makespan],fixedPrompts,semanticPrompts:whatIf.prompts.length,solverCalls:solver.calls,exactAndShort:true,authorityMissingNoSolve:true,oldResponseRejected:true,planningOnly:true}));
}
