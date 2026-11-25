import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { InteractionElement, JsonReader, resolveEvidence, selectNextDecision, prepareCandidates,
  buildClarification, mapClarificationResponse, invalidateEvidence, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';
import { runOrderPolicyIn } from './workflow-init.mjs';

const ok=value=>({status:'COMPLETE',value});
const stop=(status,code)=>({status,reason:{code,message:'Order policy evaluation not completed'}});
const scope='reference-order';
const limits={maxItems:16,maxDependencies:16};
const policyFiles={
  normal:new URL('../data/order-policy.json',import.meta.url),
  strict:new URL('../data/order-policy-strict.json',import.meta.url),
};
async function readPolicyFacts(root,signal) {
  const reader=new JsonReader();
  const facts=[];
  for(const [key,url] of Object.entries(policyFiles)){
    if(signal.aborted)return stop('REJECT','CANCELLED');
    const read=await root.invoke(()=>reader.read(readFileSync(url,'utf8')));
    if(read.status!=='COMPLETE')return read;
    const result=read.value;
    if(result.kind!=='SUCCEEDED'||!result.value||typeof result.value.id!=='string'||!Number.isFinite(result.value.minimumTotal))
      return stop('UNKNOWN','POLICY_FACTS_UNAVAILABLE');
    facts.push({key,id:result.value.id,minimumTotal:result.value.minimumTotal});
  }
  if(new Set(facts.map(fact=>fact.id)).size!==facts.length)return stop('UNKNOWN','POLICY_FACTS_CONFLICT');
  return ok(facts);
}
const revisionOf=facts=>createHash('sha256').update(JSON.stringify(facts)).digest('hex');
function parse(input) {
  if(input==='order' || input==='订单')return {};
  if(input==='order current' || input==='订单 当前')return {goal:'current'};
  if(input==='order compare' || input==='订单 比较')return {goal:'compare'};
  return undefined;
}

/** 当前正式策略由 Reference 应用选择；比较仅评估假设规则，不改变正式规则或授予权限。 */
export function createOrderInteraction(input, onPrompt=()=>{}, budget={maxCalls:22,maxSteps:24,maxDepth:1}) {
  let binding,prompt;
  const interaction=new InteractionElement({onPrompt:p=>{prompt=p;onPrompt(p,interaction);}});
  const decide=async(state,event,root,signal)=>{
    let choice=state.choice,invalidate;
    if(event.kind==='initial'){
      choice=parse(input);
      if(!choice)return stop('UNKNOWN','UNSUPPORTED_INPUT');
    }else{
      const mapped=mapClarificationResponse(binding,prompt,event);
      if(mapped.status==='failed')return stop('FAILED','INVALID_BINDING');
      if(mapped.status==='other'){
        if((event.response.action==='text'||event.response.action==='revise')&&'text' in event.response){
          choice=parse(event.response.text);
          if(!choice)return stop('UNKNOWN','UNSUPPORTED_INPUT');
          const stale=invalidateEvidence(['goal','scenario'],['goal'],[
            {key:'goal',dependsOn:[]},{key:'scenario',dependsOn:['goal']}],limits);
          if(!stale.complete)return stop('FAILED','INVALIDATION_FAILED');
          invalidate=stale.stale;
        }else return stop('ASK','NO_MATCHING_POLICY');
      }else{
        for(const item of mapped.values){
          if(item.key==='goal')choice={goal:item.value};
          if(item.key==='scenario')choice={goal:'compare',scenario:item.value};
        }
      }
    }
    const observed=await readPolicyFacts(root,signal);
    if(observed.status!=='COMPLETE')return observed;
    const facts=observed.value;
    const revision=revisionOf(facts);
    // 等待期间权威规则变化时拒绝旧选择，不能通过预填掩盖变化。
    if(state.revision!==undefined&&state.revision!==revision)return stop('UNKNOWN','POLICY_FACTS_CHANGED');
    const source={id:'policy',scope,revision};
    const user={id:'user',scope,revision:String(state.round)};
    const observations=[
      {key:'current',origin:'authority',state:'known',value:'normal',source},
      {key:'goal',origin:'recommendation',state:'known',value:'current',source},
    ];
    if(choice.goal!==undefined)observations.push({key:'goal',origin:'user',state:'known',value:choice.goal,source:user});
    if(choice.scenario!==undefined)observations.push({key:'scenario',origin:'user',state:'known',value:choice.scenario,source:user});
    const evidence=resolveEvidence([{key:'current',accepts:['authority']},{key:'goal',accepts:['user']},
      {key:'scenario',accepts:['user']}],observations,{scope,revisions:new Map([['policy',revision],['user',user.revision]])},{equal:(_k,a,b)=>a===b},16);
    if(!evidence.complete)return stop('FAILED','EVIDENCE_FAILED');
    const known=key=>evidence.items.some(item=>item.key===key&&item.status==='resolved');
    const selection=selectNextDecision([
      {key:'current',dependsOn:[],applicable:'yes',required:'yes',satisfied:known('current')?'yes':'unknown',priority:30},
      {key:'goal',dependsOn:['current'],applicable:'yes',required:'yes',satisfied:known('goal')?'yes':'no',priority:20},
      {key:'scenario',dependsOn:['goal'],applicable:choice.goal==='compare'?'yes':'no',required:'yes',satisfied:known('scenario')?'yes':'no',priority:10},
    ],limits);
    if(!selection.complete)return stop('FAILED','DECISION_FAILED');
    if(selection.status==='ready'){
      const selected=choice.goal==='current'?'normal':choice.scenario;
      if(!facts.some(f=>f.key===selected))return stop('REJECT','POLICY_NOT_ALLOWED');
      return ok({kind:'ready',intent:{selected,revision,policy:facts.find(f=>f.key===selected)},...(invalidate?{invalidate}:{})});
    }
    if(selection.status!=='next')return stop('UNKNOWN','DECISION_UNRESOLVED');
    const key=selection.key;
    const context={scope,revision};
    const options=key==='goal'?[{id:'current',label:'Evaluate current policy',fact:facts[0]},
      {id:'compare',label:'Compare hypothetical policy',fact:null}]:
      facts.map(fact=>({id:fact.key,label:fact.id,fact}));
    const candidates=prepareCandidates({status:'complete',...context,entries:options.map(option=>({...context,id:option.id,value:option}))},context,{
      assess:entry=>entry.value.fact===null||Number.isFinite(entry.value.fact.minimumTotal)?{status:'eligible'}:{status:'unknown',reason:'POLICY_UNKNOWN'},
      project:entry=>({label:entry.value.label,priority:entry.id==='current'?10:0,
        ...(entry.id==='current'?{recommended:true,reason:'Current Reference policy; comparison is hypothetical',scope}:{}),
        cells:[entry.value.fact?.id??'Choose policy',String(entry.value.fact?.minimumTotal??'-')]}),
      comparisonLabels:['Policy','Minimum total'],
    },{maxVisited:16,maxReturned:16});
    const built=buildClarification(evidence,selection,{decisionKey:key,title:key==='goal'?'Select order goal':'Select hypothetical policy',
      actions:['submit','revise','text','no-fit','reject','cancel']},[
      {field:{id:key,label:key,kind:'choice',required:true,options:[],completeness:'incomplete'},
        evidenceKey:key,applicable:'yes',confirmation:'user',candidates:{current:context,result:candidates},
        ...(key==='goal'?{projectPrefill:observation=>({value:observation.value,source:observation.source.id+'@'+observation.source.revision})}:{})},
    ]);
    if(built.status!=='prompt')return stop('UNKNOWN','CLARIFICATION_'+built.status.toUpperCase());
    binding=built;
    return ok({kind:'clarify',state:{choice,round:state.round+1,revision},prompt:built.prompt,...(invalidate?{invalidate}:{})});
  };
  // 应用拥有启动时机；构造未执行的意图不消耗业务预算。
  return {interaction,run:()=>runInteractiveRecognitionHandling(interaction,budget,{choice:{},round:0},decide,async(intent,context)=>{
    if(context.signal.aborted)return stop('REJECT','CANCELLED');
    const current=await readPolicyFacts(context.root,context.signal);
    if(current.status!=='COMPLETE')return current;
    if(context.signal.aborted)return stop('REJECT','CANCELLED');
    if(revisionOf(current.value)!==intent.revision)return stop('UNKNOWN','POLICY_FACTS_CHANGED');
    return runOrderPolicyIn(context.root,intent.selected,[],undefined,context.signal,intent.policy);
  })};
}
