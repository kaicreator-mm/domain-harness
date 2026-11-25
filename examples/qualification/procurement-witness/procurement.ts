import { InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision,
  prepareCandidates, buildClarification, mapClarificationResponse, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';
import type { InteractionPrompt, InteractionEvent, InteractionDecision, InteractionField, EvidenceObservation,
  ClarificationPreparation, ClarificationField, StandardWorkflowOutcome, NativeWorkflowContext, WorkflowLimits } from '@kaicreator/domain-harness';

export type Service = 'normal' | 'urgent';
export interface Offer { readonly id: string; readonly pack?: number | null; readonly price?: number | null; readonly maxPacks?: number | null; readonly minPacks?: number | null; readonly ship?: number | null; readonly days?: number | null }
export interface OfferSnapshot { readonly revision: string; readonly offers: readonly Offer[] }
export interface Request { readonly demand: number; readonly service?: Service; readonly plan?: string }
export interface Plan { readonly id: string; readonly packs: number; readonly units: number; readonly cost: number; readonly days: number }
export interface Assessment { readonly eligible: readonly Plan[]; readonly recommended: readonly Plan[]; readonly unknown: readonly string[] }
export interface ProcurementResult extends Assessment { readonly selected: Plan; readonly revision: string; readonly demand: number; readonly service: Service }
type Key = 'demand' | 'service' | 'plan' | 'offers';
type Value = string | number;
type Outcome<T> = StandardWorkflowOutcome<T>;
type State = { readonly request: Request };
type Intent = { readonly request: Required<Request>; readonly fingerprint: string };
type KnownOffer = Offer & { readonly pack:number; readonly price:number; readonly maxPacks:number; readonly minPacks:number; readonly ship:number; readonly days:number };
type Candidate = { readonly kind:'unknown'; readonly offer:Offer } | { readonly kind:'known'; readonly offer:KnownOffer; readonly packs:number; readonly units:number; readonly cost:number };
const ok = <T>(value:T):Outcome<T> => ({status:'COMPLETE',value});
const stop = (status:'REJECT'|'ASK'|'UNKNOWN'|'FAILED',code:string):Outcome<never> => ({status,reason:{code,message:code}});
const bounds = {maxItems:16,maxDependencies:32};
const scope = 'spare-parts';
const integer = (v:unknown,min:number,max:number):v is number => typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const validDemand = (d:unknown) => integer(d,1,30);
const deadline = (s:Service) => s==='urgent'?2:5;
const planKey = (id:string,packs:number) => id+':'+packs;
const parse = (input:string|Request):Request|undefined => {
  if(typeof input!=='string')return input;
  const m=/^补货 ([0-9]+)(?: (normal|urgent))?(?: ([A-Za-z0-9_-]+:[0-9]+))?$/u.exec(input);
  return m?{demand:Number(m[1]),...(m[2]?{service:m[2] as Service}:{}),...(m[3]?{plan:m[3]}:{})}:undefined;
};
const validOffer = (o:Offer) => /^[A-Za-z0-9_-]{1,32}$/u.test(o.id)
  &&(o.pack==null||integer(o.pack,1,10000))&&(o.price==null||integer(o.price,0,1000000))
  &&(o.maxPacks==null||integer(o.maxPacks,1,64))&&(o.minPacks==null||integer(o.minPacks,1,64))&&(o.ship==null||integer(o.ship,0,1000000))
  &&(o.days==null||integer(o.days,0,365));
const knownOffer = (o:Offer):o is KnownOffer => o.pack!=null&&o.price!=null&&o.maxPacks!=null&&o.minPacks!=null&&o.ship!=null&&o.days!=null;
const assess = (c:Candidate,demand:number,service:Service) => {
  if(c.kind==='unknown')return {status:'unknown',reason:'SUPPLIER_FACT_UNKNOWN'} as const;
  if(c.packs<c.offer.minPacks||c.units<demand||c.units>demand+3||c.cost>2000||c.offer.days>deadline(service))return {status:'excluded',reason:'HARD_CONSTRAINT'} as const;
  return {status:'eligible'} as const;
};
const toPlan = (c:Candidate):Plan => {if(c.kind!=='known')throw Error('UNKNOWN_PLAN');return {id:c.offer.id,packs:c.packs,units:c.units,cost:c.cost,days:c.offer.days};};
/** Domain arithmetic and constraints; common candidate screening/projection belongs to SDK. */
export function assessOffers(facts:OfferSnapshot,demand:number,service:Service) {
  if(!validDemand(demand)||!['normal','urgent'].includes(service)||facts.offers.length>32)return stop('REJECT','INVALID_INPUT');
  if(new Set(facts.offers.map(o=>o.id)).size!==facts.offers.length)return stop('FAILED','SUPPLIER_CONFLICT');
  if(!facts.offers.every(validOffer))return stop('REJECT','INVALID_OFFER');
  const current={scope,revision:facts.revision};
  const entries=facts.offers.flatMap(offer=>{
    if(!knownOffer(offer))return [{...current,id:offer.id+':unknown',value:{kind:'unknown',offer} as Candidate}];
    return Array.from({length:offer.maxPacks},(_,i)=>{
      const packs=i+1;
      return {...current,id:planKey(offer.id,packs),value:{kind:'known',offer,packs,units:packs*offer.pack,cost:packs*offer.price+offer.ship} as Candidate};
    });
  });
  const minimum=entries.reduce((m,e)=>e.value.kind==='known'&&assess(e.value,demand,service).status==='eligible'?Math.min(m,e.value.cost):m,Infinity);
  const result=prepareCandidates({status:'complete',...current,entries},current,{
    assess:e=>assess(e.value,demand,service),
    project:e=>{const p=toPlan(e.value);return {label:p.id+' / '+p.packs+' packs',priority:-p.cost,
      recommended:p.cost===minimum,reason:'Lowest known eligible landed cost; '+facts.revision,
      cells:[p.id,String(p.packs),String(p.units),String(p.cost),String(p.days)]};},
    comparisonLabels:['Supplier','Packs','Units','Landed cents','Days']
  },{maxVisited:2048,maxReturned:256});
  if(result.status==='failed')return stop('FAILED',result.reason);
  const eligible=result.entries.map(e=>toPlan(e.value));
  const recommended=result.entries.filter(e=>result.options.some(o=>o.id===e.id&&o.recommended===true)).map(e=>toPlan(e.value));
  const unknown=facts.offers.filter(o=>!knownOffer(o)).map(o=>o.id);
  return ok({assessment:{eligible,recommended,unknown},result,current});
}
export function startProcurement(input:string|Request,readFacts:()=>OfferSnapshot,limits:WorkflowLimits,onPrompt?:(p:InteractionPrompt,i:InteractionElement)=>void) {
  let prompt:InteractionPrompt|undefined;
  let prepared:Extract<ClarificationPreparation<Key>,{status:'prompt'}>|undefined;
  let snapshot:string|undefined;
  let handling=0;
  const interaction=new InteractionElement({onPrompt:p=>{prompt=p;onPrompt?.(p,interaction);}});
  const decide=async(state:Readonly<State>,event:InteractionEvent,root:NativeWorkflowContext,signal:AbortSignal):Promise<Outcome<InteractionDecision<State,Intent>>>=>{
    if(signal.aborted)return stop('REJECT','CANCELLED');
    const fetched=await root.invoke(readFacts);
    if(fetched.status!=='COMPLETE')return fetched;
    const facts=fetched.value;
    const identity=JSON.stringify(facts);
    if(snapshot!==undefined&&snapshot!==identity)return stop('UNKNOWN','OFFER_REVISION_CHANGED');
    snapshot=identity;
    let request=state.request;
    if(event.kind==='response'){
      if(!prompt||!prepared)return stop('FAILED','MISSING_BINDING');
      const mapped=mapClarificationResponse(prepared,prompt,event);
      if(mapped.status==='failed')return stop('REJECT','INVALID_RESPONSE');
      if(mapped.status==='other'){
        if(event.response.action==='no-fit')return stop('ASK','NO_FIT');
        if(event.response.action==='revise'&&'text' in event.response){
          const revised=parse(event.response.text);
          if(!revised)return stop('REJECT','INVALID_REVISION');
          const invalidated=invalidateEvidence<Key>(['demand','service','plan','offers'],['demand','service'],[
            {key:'demand',dependsOn:[]},{key:'service',dependsOn:[]},{key:'offers',dependsOn:[]},{key:'plan',dependsOn:['demand','service','offers']}
          ],bounds);
          if(!invalidated.complete||!invalidated.stale.includes('plan'))return stop('FAILED','INVALIDATION_FAILED');
          request={demand:revised.demand,...(revised.service?{service:revised.service}:{})};
        }else return stop('REJECT','UNSUPPORTED_RESPONSE');
      }else{
        for(const v of mapped.values){
          if(v.key==='service'&&(v.value==='normal'||v.value==='urgent'))request={...request,service:v.value};
          else if(v.key==='plan'&&typeof v.value==='string')request={...request,plan:v.value};
          else return stop('REJECT','INVALID_RESPONSE');
        }
      }
    }
    if(!validDemand(request.demand)||request.service!==undefined&&!['normal','urgent'].includes(request.service))return stop('REJECT','INVALID_INPUT');
    if(new Set(facts.offers.map(o=>o.id)).size!==facts.offers.length)return stop('FAILED','SUPPLIER_CONFLICT');
    const source={id:'offers',scope,revision:facts.revision},user={id:'user',scope,revision:'request'};
    const observations:EvidenceObservation<Key,Value>[]=[
      {key:'offers',origin:'authority',source,state:'known',value:facts.revision},
      {key:'demand',origin:'user',source:user,state:'known',value:request.demand}
    ];
    if(request.service!==undefined)observations.push({key:'service',origin:'user',source:user,state:'known',value:request.service});
    if(request.plan!==undefined)observations.push({key:'plan',origin:'user',source:user,state:'known',value:request.plan});
    const evidence=resolveEvidence<Key,Value>([
      {key:'offers',accepts:['authority']},{key:'demand',accepts:['user']},{key:'service',accepts:['user']},{key:'plan',accepts:['user']}
    ],observations,{scope,revisions:new Map([['offers',facts.revision],['user','request']])},{equal:(_k,a,b)=>a===b},16);
    if(!evidence.complete)return stop('FAILED','EVIDENCE_FAILED');
    const has=(key:Key)=>evidence.items.some(r=>r.key===key&&r.status==='resolved');
    const selection=selectNextDecision<Key>([
      {key:'offers',dependsOn:[],applicable:'yes',required:'yes',satisfied:has('offers')?'yes':'unknown',priority:40},
      {key:'demand',dependsOn:[],applicable:'yes',required:'yes',satisfied:has('demand')?'yes':'no',priority:30},
      {key:'service',dependsOn:['demand'],applicable:'yes',required:'yes',satisfied:has('service')?'yes':'no',priority:20},
      {key:'plan',dependsOn:['offers','service'],applicable:'yes',required:'yes',satisfied:has('plan')?'yes':'no',priority:10}
    ],bounds);
    if(!selection.complete)return stop('FAILED','DECISION_FAILED');
    const assessed=request.service===undefined?undefined:assessOffers(facts,request.demand,request.service);
    if(assessed&&assessed.status!=='COMPLETE')return assessed;
    const candidate=assessed?.value;
    if(request.plan&&candidate?.assessment.unknown.some(id=>request.plan!.startsWith(id+':')))return stop('UNKNOWN','SELECTED_SUPPLIER_FACT_UNKNOWN');
    if(candidate?.result.status==='unknown')return stop('UNKNOWN','CANDIDATES_UNKNOWN');
    if(candidate?.result.status==='empty')return stop('ASK','NO_FIT');
    if(selection.status==='ready'){
      if(!candidate||!request.service||!request.plan||!candidate.result.entries.some(e=>e.id===request.plan))return stop('REJECT','ILLEGAL_PLAN');
      return ok({kind:'ready',intent:{request:{demand:request.demand,service:request.service,plan:request.plan},fingerprint:identity}});
    }
    if(selection.status!=='next')return stop('UNKNOWN','DECISION_UNRESOLVED');
    const key=selection.key;
    let field:InteractionField;
    let mapping:ClarificationField<Key,Value>;
    if(key==='service'){
      const current={scope,revision:facts.revision};
      const services=prepareCandidates({status:'complete',...current,entries:(['normal','urgent'] as const).map(value=>({...current,id:value,value}))},current,{
        assess:()=>({status:'eligible'}),project:e=>({label:e.id,priority:0,cells:[String(deadline(e.value))]}),comparisonLabels:['Deadline days']
      },{maxVisited:2,maxReturned:2});
      field={id:'service',kind:'choice',label:'Service',required:true,options:[],completeness:'complete'};
      mapping={field,evidenceKey:key,applicable:'yes',confirmation:'user',candidates:{current,result:services}};
    }else if(key==='plan'&&candidate){
      field={id:'plan',kind:'choice',label:'Supplier / pack count',required:true,options:[],completeness:'complete'};
      mapping={field,evidenceKey:key,applicable:'yes',confirmation:'user',candidates:{current:candidate.current,result:candidate.result}};
    }else return stop('FAILED','UNEXPECTED_DECISION');
    const built=buildClarification(evidence,selection,{decisionKey:key,title:key==='service'?'Choose delivery deadline':'Choose a legal plan',
      description:candidate&&!candidate.result.complete?'Incomplete supplier evidence; no global recommendation.':'Explicit selection required.',
      actions:['submit','revise','no-fit','cancel']},[mapping]);
    if(built.status!=='prompt')return stop('FAILED','CLARIFICATION_'+('reason' in built?built.reason:built.status));
    prepared=built;
    return ok({kind:'clarify',state:{request},prompt:built.prompt});
  };
  const initial=parse(input);
  const result=initial?runInteractiveRecognitionHandling<State,Intent,ProcurementResult>(interaction,limits,{request:initial},decide,async(intent,s)=>{
    // Same root, explicit final check of authoritative facts; no purchasing operation.
    if(s.signal.aborted)return stop('REJECT','CANCELLED');
    const checked=await s.root.invoke(readFacts);
    if(checked.status!=='COMPLETE')return checked;
    if(JSON.stringify(checked.value)!==intent.fingerprint)return stop('UNKNOWN','OFFER_REVISION_CHANGED');
    if(s.signal.aborted)return stop('REJECT','CANCELLED');
    const remaining=s.root.remaining();
    if(remaining.calls<1||remaining.steps<2||remaining.maxDescendantDepth<1)return stop('FAILED','PLAN_BUDGET');
    return s.root.child(0,child=>child.invokeOutcome(()=>{
      handling++;
      const r=assessOffers(checked.value,intent.request.demand,intent.request.service);
      if(r.status!=='COMPLETE')return r;
      const selected=r.value.assessment.eligible.find(p=>planKey(p.id,p.packs)===intent.request.plan);
      if(!selected)return stop('REJECT','ILLEGAL_PLAN');
      return ok({...r.value.assessment,selected,revision:checked.value.revision,demand:intent.request.demand,service:intent.request.service});
    }));
  }):Promise.resolve(stop('REJECT','UNSUPPORTED_INPUT'));
  return {interaction,result,handled:()=>handling};
}
