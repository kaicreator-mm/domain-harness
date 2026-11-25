import { InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision, prepareCandidates, buildClarification, mapClarificationResponse, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';
import type { InteractionPrompt, InteractionEvent, InteractionDecision, ClarificationPreparation, EvidenceObservation, StandardWorkflowOutcome, WorkflowLimits } from '@kaicreator/domain-harness';
import { WorkshopElement, validateTasks, type Task, type Policy, type Plan, type SolverElement } from './plan.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
type Key = 'calendar' | 'goal' | 'scenario';
type Choice = Readonly<{goal?: 'current' | 'what-if'; scenario?: string}>;
export type ScheduleInput = string | Choice;
/** Trusted domain snapshot, not client-submitted facts. What-if policies never replace current. */
export type ScheduleFacts = Readonly<{ tasks: readonly Task[]; current?: Policy; scenarios: readonly Policy[] }>;
type Intent = Readonly<{ goal: 'current' | 'what-if'; policy: Policy }>;
type State = Readonly<{ choice: Choice; round: number; proposal?: Plan }>;
export type ScheduleResult = Readonly<{ goal: Intent['goal']; plan: Plan; previous?: Plan }>;
const ok = <T>(value:T):Outcome<T> => ({status:'COMPLETE',value});
const stop = (status:'ASK'|'REJECT'|'UNKNOWN'|'FAILED',code:string):Outcome<never> => ({status,reason:{code,message:code}});
const bounds = {maxItems:16,maxDependencies:16};
function parse(input:ScheduleInput):Choice|undefined {
  if(typeof input !== 'string') return input;
  const m=/^排程(?: (current|what-if)(?: ([a-zA-Z0-9_.:-]+))?)?$/u.exec(input);
  if(!m) return undefined;
  return {...(m[1]?{goal:m[1] as 'current'|'what-if'}:{}),...(m[2]?{scenario:m[2]}:{})};
}

/** Planning only. A–F organize a real solver call; no dispatch or change of authoritative calendar. */
export function scheduleInteractively(limits:WorkflowLimits, input:ScheduleInput,
  facts:ScheduleFacts, solver:SolverElement, options:Readonly<{review?:boolean; onPrompt?:(prompt:InteractionPrompt, interaction:InteractionElement)=>void}>={}):Readonly<{interaction:InteractionElement;result:Promise<Outcome<ScheduleResult>>}> {
  const current=facts.current;
  // The caller supplies a trusted immutable snapshot; the current policy is never inferred from scenarios.
  const policies=new Map(facts.scenarios.slice(0,16).map(p=>[p.revision,p]));
  const scopeName='workshop/current';
  let prepared:Extract<ClarificationPreparation<Key>,{status:'prompt'}>|undefined;
  const decide=(state:Readonly<State>,event:InteractionEvent):Outcome<InteractionDecision<State,Intent>>=>{
    if(!current) return stop('UNKNOWN','CURRENT_CALENDAR_UNKNOWN');
    if(policies.size!==facts.scenarios.length||facts.scenarios.length>16) return stop('REJECT','SCENARIO_SET_INVALID');
    const valid=validateTasks(facts.tasks,current);
    if(valid.status!=='COMPLETE')return valid;
    let selected=state.choice;
    let invalidate:readonly string[]|undefined;
    if(event.kind==='initial') {
      if(state.proposal) {
        const invalidation=invalidateEvidence<Key|'plan'>(['calendar','goal','scenario','plan'],['goal'],[{key:'calendar',dependsOn:[]},{key:'goal',dependsOn:[]},{key:'scenario',dependsOn:['goal']},{key:'plan',dependsOn:['calendar','goal','scenario']}],bounds);
        if(!invalidation.complete||!invalidation.stale.includes('plan'))return stop('FAILED','INVALIDATION_FAILED');
        invalidate=['goal','scenario'];
      }
      else {
        const parsed=parse(input);
        if(!parsed)return stop('UNKNOWN','UNSUPPORTED_INPUT');
        selected=parsed;
      }
    } else {
      const prompt=lastPrompt;
      if(!prepared||!prompt) return stop('FAILED','CLARIFICATION_BINDING');
      const mapped=mapClarificationResponse(prepared,prompt,event);
      if(mapped.status==='failed')return stop('FAILED','CLARIFICATION_BINDING');
      if(mapped.status==='other') {
        if(event.response.action==='revise'&&'text' in event.response) {
          const next=parse(event.response.text);
          if(!next) return stop('UNKNOWN','UNSUPPORTED_REVISION');
          selected=next;
          const invalidation=invalidateEvidence<Key>(['calendar','goal','scenario'],['goal'],[{key:'calendar',dependsOn:[]},{key:'goal',dependsOn:[]},{key:'scenario',dependsOn:['goal']}],bounds);
          if(!invalidation.complete)return stop('FAILED','INVALIDATION_FAILED');
          if(invalidation.stale.includes('scenario')&&next.goal!=='what-if')selected=next.goal===undefined?{}:{goal:next.goal};
          invalidate=['goal','scenario'];
        } else return stop('ASK','NO_MATCHING_SCENARIO');
      } else {
        for(const item of mapped.values) {
          if(typeof item.value!=='string')return stop('REJECT','INVALID_CHOICE');
          if(item.key==='goal') {
            if(item.value!=='current'&&item.value!=='what-if')return stop('REJECT','INVALID_GOAL');
            selected={goal:item.value};
          } else if(item.key==='scenario') selected={goal:'what-if',scenario:item.value};
          else return stop('REJECT','AUTHORITATIVE_FIELD');
        }
      }
    }
    if(selected.goal!==undefined&&selected.goal!=='current'&&selected.goal!=='what-if')return stop('REJECT','INVALID_GOAL');
    if(selected.scenario!==undefined&&(selected.goal!=='what-if'||!policies.has(selected.scenario)))return stop('REJECT','INVALID_SCENARIO');
    const source={id:'calendar',scope:scopeName,revision:current.revision};
    const userSource={id:'user',scope:scopeName,revision:String(state.round)};
    const observations:EvidenceObservation<Key,string>[]=[{key:'calendar',origin:'authority',state:'known',value:current.revision,source}];
    if(selected.goal!==undefined)observations.push({key:'goal',origin:'user',state:'known',value:selected.goal,source:userSource});
    if(selected.scenario!==undefined)observations.push({key:'scenario',origin:'user',state:'known',value:selected.scenario,source:userSource});
    const evidence=resolveEvidence<Key,string>([{key:'calendar',accepts:['authority']},{key:'goal',accepts:['user']},{key:'scenario',accepts:['user']}],observations,
      {scope:scopeName,revisions:new Map([['calendar',current.revision],['user',String(state.round)]])},{equal:(_k,a,b)=>a===b},16);
    if(!evidence.complete)return stop('FAILED','EVIDENCE_FAILED');
    const has=(key:Key)=>evidence.items.some(row=>row.key===key&&row.status==='resolved');
    const selection=selectNextDecision<Key>([
      {key:'calendar',applicable:'yes',required:'yes',satisfied:has('calendar')?'yes':'unknown',priority:30,dependsOn:[]},
      {key:'goal',applicable:'yes',required:'yes',satisfied:has('goal')?'yes':'no',priority:20,dependsOn:['calendar']},
      {key:'scenario',applicable:selected.goal==='what-if'?'yes':'no',required:'yes',satisfied:has('scenario')?'yes':'no',priority:10,dependsOn:['goal']},
    ],bounds);
    if(!selection.complete)return stop('FAILED','DECISION_FAILED');
    const key=selection.status==='next'?selection.key:'goal';
    const candidateContext={scope:scopeName,revision:`${current.revision}:${state.round}:${key}`};
    const entries=key==='scenario'?facts.scenarios.map(policy=>({id:policy.revision,policy})): [{id:'current',policy:current},{id:'what-if',policy:undefined}];
    const assessed=(p:Policy)=>{
      const outcome=validateTasks(facts.tasks,p);
      return outcome.status==='COMPLETE'?{status:'eligible' as const}:outcome.status==='REJECT'?{status:'excluded' as const,reason:outcome.reason.code}:
        outcome.status==='FAILED'?{status:'failed' as const,reason:outcome.reason.code}:{status:'unknown' as const,reason:outcome.reason.code};
    };
    const candidates=prepareCandidates({status:'complete',...candidateContext,entries:entries.map(entry=>({...candidateContext,id:entry.id,value:entry.policy}))},candidateContext,{
      assess:entry=>{
        if(entry.value!==undefined)return assessed(entry.value);
        const states=facts.scenarios.map(assessed);
        if(states.some(s=>s.status==='failed'))return {status:'failed',reason:'SCENARIO_CHECK_FAILED'};
        if(states.some(s=>s.status==='eligible'))return {status:'eligible'};
        if(states.some(s=>s.status==='unknown'))return {status:'unknown',reason:'SCENARIO_UNKNOWN'};
        return {status:'excluded',reason:'NO_SCENARIOS'};
      },
      comparisonLabels:['Policy revision','Horizon','Closed slots'],
      project:entry=>({label:entry.id,...(key==='scenario'?{reason:'Hypothetical calendar, not current facts'}:{}),priority:0,
        cells:[entry.value?.revision??'Choose a scenario',String(entry.value?.horizon??'-'),entry.value?JSON.stringify(entry.value.closed):'-']}),
    },{maxVisited:16,maxReturned:16});
    const built=buildClarification(evidence,selection,{decisionKey:key,title:key==='scenario'?'Select hypothetical calendar':'Select scheduling goal',
      ...(state.proposal?{description:`Computed ${state.proposal.revision}: makespan ${state.proposal.makespan}; choose the next planning goal`}:{}),actions:['submit','revise','no-fit','cancel']},[
      {field:{id:key,kind:'choice',label:key,required:true,options:[],completeness:'incomplete'},evidenceKey:key,applicable:'yes',confirmation:'user',candidates:{current:candidateContext,result:candidates}},
    ]);
    if(built.status==='ready'&&selected.goal) {
      const policy=selected.goal==='current'?current:policies.get(selected.scenario??'');
      if(!policy)return stop('UNKNOWN','SCENARIO_UNKNOWN');
      return ok({kind:'ready',intent:{goal:selected.goal,policy},...(invalidate?{invalidate}:{})});
    }
    if(built.status!=='prompt')return stop(built.status==='failed'?'FAILED':'UNKNOWN','CLARIFICATION_'+built.status.toUpperCase());
    prepared=built;
    return ok({kind:'clarify',state:{...state,choice:selected,round:state.round+1},prompt:built.prompt,...(invalidate?{invalidate}:{})});
  };
  // Capture the actual A prompt before notifying the UI; retain only this invocation's binding.
  let lastPrompt:InteractionPrompt|undefined;
  const interaction=new InteractionElement({onPrompt:p=>{lastPrompt=p;return options.onPrompt?.(p,interaction);}});
  const result=runInteractiveRecognitionHandling<State,Intent,ScheduleResult>(interaction,limits,{choice:{},round:0},decide,async(intent,scope)=>{
    if(scope.signal.aborted)return stop('REJECT','CANCELLED');
    const first=await new WorkshopElement(solver,intent.policy).runIn(scope.root,facts.tasks);
    if(first.status!=='COMPLETE')return first;
    if(!options.review)return ok({goal:intent.goal,plan:first.value});
    // Explicitly requested review of a computed proposal, not a mandatory repeated confirmation.
    const next=await scope.resolve<State,Intent>({choice:{},round:100,proposal:first.value},decide);
    if(next.status!=='COMPLETE')return next;
    if(scope.signal.aborted)return stop('REJECT','CANCELLED');
    if(next.value.policy===intent.policy)return ok({goal:next.value.goal,plan:first.value});
    const revised=await new WorkshopElement(solver,next.value.policy).runIn(scope.root,facts.tasks);
    if(revised.status!=='COMPLETE')return revised;
    return ok({goal:next.value.goal,plan:revised.value,previous:first.value});
  });
  return Object.freeze({interaction,result});
}
