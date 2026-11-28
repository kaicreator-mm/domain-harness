import { bindWorkflowFunction, bindWorkflowRegion, createWorkflowSlot, runWorkflowRegion, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { ModelElement, StandardWorkflowOutcome, WorkflowCapability, WorkflowObservation, WorkflowRegionDefinition, WorkflowRegionProposal, WorkflowRegionView } from '@kaicreator/domain-harness';
import { assessOffers } from '../../qualification/procurement-witness/procurement.js';
import type { OfferSnapshot, Plan as Purchase, Service } from '../../qualification/procurement-witness/procurement.js';
import { WorkshopElement, validateSchedule } from '../../qualification/workshop/plan.js';
import type { Plan as Schedule, Policy, SolverElement, Task } from '../../qualification/workshop/plan.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
export interface MaintenanceRequest { readonly demand: number; readonly service: Service }
export interface MaintenanceResult { readonly purchase: Purchase; readonly schedule: Schedule; readonly sourceRevision: string }
interface Options {
  readonly offers: OfferSnapshot;
  readonly tasks: readonly Task[];
  readonly solver: SolverElement;
  readonly model?: ModelElement;
  readonly current: () => boolean;
  readonly observe?: (event: WorkflowObservation) => void;
  readonly dispositions?: (events: readonly WorkflowObservation[]) => void;
}
const ok = <T>(value:T):Outcome<T> => ({status:'COMPLETE',value});
const stop = (status:'REJECT'|'UNKNOWN'|'FAILED',code:string):Outcome<never> => ({status,reason:{code,message:'Maintenance planning unavailable'}});
const denied = (code:string) => stop('REJECT',code);
const obj = (v:unknown):v is Record<string,unknown> => typeof v==='object'&&v!==null&&!Array.isArray(v);
const int = (v:unknown):v is number => typeof v==='number'&&Number.isSafeInteger(v);
const isRequest = (v:unknown):v is MaintenanceRequest => obj(v)&&Object.keys(v).length===2&&int(v.demand)&&v.demand>=1&&v.demand<=30&&(v.service==='normal'||v.service==='urgent');
const isPurchase = (v:unknown):v is Purchase => obj(v)&&typeof v.id==='string'&&int(v.packs)&&int(v.units)&&int(v.cost)&&int(v.days);
const isResult = (v:unknown):v is MaintenanceResult => obj(v)&&isPurchase(v.purchase)&&obj(v.schedule)&&obj(v.schedule.starts)&&int(v.schedule.makespan)&&typeof v.sourceRevision==='string';
const requestSlot = createWorkflowSlot('maintenance-request',isRequest);
const purchaseSlot = createWorkflowSlot('maintenance-purchase',isPurchase);
const resultSlot = createWorkflowSlot('maintenance-result',isResult);
const decision = (v:WorkflowRegionView, action:WorkflowRegionProposal['action'], edits:WorkflowRegionProposal['edits']=[])=>ok({source:'native' as const,
  proposal:{runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision,action,edits}});
const eqRequest=(a:MaintenanceRequest,b:MaintenanceRequest)=>a.demand===b.demand&&a.service===b.service;
const limits=(depth:number,work:number)=>({maxWork:work,maxDescendantDepth:depth,maxCandidateBytes:16384,maxJsonDepth:24,maxJsonItems:2048,maxNodes:12,maxBindings:24,maxEdits:4,maxProjectionBytes:16384});
const requestSchema={type:'object',properties:{demand:{type:'integer'},service:{type:'string',enum:['normal','urgent']}},required:['demand','service'],additionalProperties:false} as const;
const purchaseSchema={type:'object',properties:{id:{type:'string'},packs:{type:'integer'},units:{type:'integer'},cost:{type:'integer'},days:{type:'integer'}},required:['id','packs','units','cost','days'],additionalProperties:false} as const;

/** Existing spare-parts and workshop domains, one bounded root. Procurement delivery gates actual repair slots.
 * All time units in this synthetic scenario are discrete business days; no purchasing effect occurs.
 */
export async function planMaintenance(request:MaintenanceRequest,options:Options):Promise<Outcome<MaintenanceResult>> {
  if(!isRequest(request))return denied('MAINTENANCE_REQUEST_INVALID');
  const confirmed=Object.freeze({...request});
  const offers=Object.freeze({revision:options.offers.revision,offers:Object.freeze(options.offers.offers.map(o=>Object.freeze({...o})))});
  const tasks=Object.freeze(options.tasks.map(t=>Object.freeze({...t,after:Object.freeze([...t.after])})));
  const knowledge={maxItems:2,equal:Object.is,current:()=>({epoch:1,context:{scope:'maintenance',revisions:new Map([['offers',offers.revision],['request','1']])}})};
  const policy=(p:Purchase):Policy=>({revision:offers.revision+'-'+p.id+'-'+p.days,horizon:12,
    closed:{repair:Array.from({length:p.days},(_,i)=>i)}});
  // Independent arithmetic and selected-snapshot binding, not trust of a model or solver output.
  const validPurchase=(p:Purchase):boolean=>{
    const o=offers.offers.find(x=>x.id===p.id);
    return !!o&&o.pack!=null&&o.price!=null&&o.ship!=null&&o.days!=null&&o.minPacks!=null&&o.maxPacks!=null&&
      p.packs>=o.minPacks&&p.packs<=o.maxPacks&&p.units===p.packs*o.pack&&p.cost===p.packs*o.price+o.ship&&p.days===o.days&&
      p.units>=confirmed.demand&&p.units<=confirmed.demand+3&&p.cost<=2000&&p.days>=0&&p.days<=(confirmed.service==='urgent'?2:5);
  };
  const validResult=(r:MaintenanceResult)=>r.sourceRevision===offers.revision&&validPurchase(r.purchase)&&
    r.schedule.revision===policy(r.purchase).revision&&validateSchedule(tasks,policy(r.purchase),r.schedule.starts,r.schedule.makespan);
  const purchase=bindWorkflowFunction<MaintenanceRequest,Purchase>({id:'parts-quote',description:'Compute an eligible minimum-cost spare-parts quote from selected facts',
    inputs:{request:requestSlot},outputs:{value:purchaseSlot},input:r=>r.read('request',requestSlot),output:(v,w)=>w.put('value',purchaseSlot,v),
    model:{schema:{type:'object',properties:{request:requestSchema},required:['request'],additionalProperties:false},describe:'confirmed request'},
    node:{id:'parts-quote',goal:'current eligible parts quote',requiredKnowledge:[],replay:'pure-read-only',
      before:v=>eqRequest(v,confirmed)&&options.current()?ok(undefined):denied('STALE_REQUEST'),
      run:v=>{const a=assessOffers(offers,v.demand,v.service);if(a.status!=='COMPLETE')return a;
        if(a.value.assessment.unknown.length)return stop('UNKNOWN','SUPPLIER_FACT_UNKNOWN');
        const chosen=[...a.value.assessment.recommended].sort((a,b)=>a.cost-b.cost||a.days-b.days||a.id.localeCompare(b.id))[0];
        return chosen&&validPurchase(chosen)?ok(chosen):denied('NO_ELIGIBLE_PARTS');},
      after:(_v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&validPurchase(a.outcome.value)?ok(undefined):denied('PARTS_POST'),
      project:()=>({effect:'none',detail:null})}});
  const schedule=bindWorkflowFunction<Purchase,MaintenanceResult>({id:'repair-solve',description:'Run the existing professional solver with delivery-gated machine availability',
    inputs:{purchase:purchaseSlot},outputs:{value:resultSlot},input:r=>r.read('purchase',purchaseSlot),output:(v,w)=>w.put('value',resultSlot,v),
    node:{id:'repair-solve',goal:'actual resource schedule',requiredKnowledge:[],replay:'pure-read-only',before:p=>validPurchase(p)&&options.current()?ok(undefined):denied('PARTS_NOT_CURRENT'),
      run:async(p,scope)=>{const actual=await new WorkshopElement(options.solver,policy(p)).runIn(scope,tasks,scope.signal);
        return actual.status!=='COMPLETE'?actual:ok({purchase:p,schedule:actual.value,sourceRevision:offers.revision});},
      after:(_p,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&validResult(a.outcome.value)?ok(undefined):denied('SCHEDULE_POST'),
      project:()=>({effect:'none',detail:null})}});
  const accepted=(v:WorkflowRegionView,id:string)=>v.progress.find(p=>p.definitionId===id&&p.state==='accepted');
  const complete=(v:WorkflowRegionView,id:string):Outcome<MaintenanceResult>=>{
    const n=accepted(v,id);if(!n)return denied('MISSING_VERIFIED_RESULT');
    const r=v.reader.read(n.instanceId+'/value',resultSlot);return r.status==='COMPLETE'&&validResult(r.value)?r:denied('INVALID_MAINTENANCE_RESULT');
  };
  const common=<I>(id:string,depth:number,work:number,capabilities:readonly WorkflowCapability[],resultId:string):Pick<WorkflowRegionDefinition<I,MaintenanceResult>,
    'id'|'goal'|'constraints'|'limits'|'capabilities'|'knowledge'|'current'|'requiredKnowledge'|'optionalKnowledge'|'plan'|'admit'|'canSkip'|'canRebind'|'complete'|'replay'>=>({
    id,goal:'delivery-constrained maintenance',constraints:['confirmed demand','actual procurement and resource availability'],
    limits:limits(depth,work),capabilities,knowledge,current:options.current,requiredKnowledge:[],optionalKnowledge:[],replay:'pure-read-only',
    plan:v=>decision(v,accepted(v,resultId)?'finish':'continue'),admit:(_v,p)=>p.edits.length===0?ok(undefined):denied('CHILD_EDIT_DENIED'),
    canSkip:()=>denied('SKIP_DENIED'),canRebind:()=>denied('REBIND_DENIED'),complete:v=>complete(v,resultId)});
  const scheduleRegion=bindWorkflowRegion<Purchase,MaintenanceResult>({id:'repair-region',description:'Delegate actual schedule to a separate bounded child region',
    inputs:{purchase:purchaseSlot},outputs:{value:resultSlot},input:r=>r.read('purchase',purchaseSlot),output:(v,w)=>w.put('value',resultSlot,v),
    model:{schema:{type:'object',properties:{purchase:purchaseSchema},required:['purchase'],additionalProperties:false},describe:'actual predecessor parts quote'},
    node:{id:'repair-region',goal:'delivery-aware repair child',requiredKnowledge:[],before:p=>validPurchase(p)?ok(undefined):denied('PARTS_REQUIRED'),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
    create:p=>ok({...common<Purchase>('repair-region',3,30_000_000,[schedule],'repair-solve'),
      requiredKnowledge:[{key:'offers',accepts:['authority']},{key:'request',accepts:['user']}],
      contextSlots:{purchase:purchaseSlot},layout:[{kind:'anchor',id:'solver',node:{alias:'solver',capability:'repair-solve',input:{purchase:{kind:'context',slot:'purchase'}}}}],
      refresh:(_i,_r,_v,w)=>{const written=w.put('purchase',purchaseSlot,p);return written.status!=='COMPLETE'?written:ok({changed:[],dependencies:[{key:'offers',dependsOn:[]},{key:'request',dependsOn:[]}],observations:[
        {key:'offers',origin:'authority',state:'known',value:offers,source:{id:'offers',scope:'maintenance',revision:offers.revision}},
        {key:'request',origin:'user',state:'known',value:confirmed,source:{id:'request',scope:'maintenance',revision:'1'}}],slotEvidence:{purchase:['offers','request']}});}})});
  const maintenance=bindWorkflowRegion<MaintenanceRequest,MaintenanceResult>({id:'maintenance-region',description:'Delegate parts procurement and repair scheduling in dependency order',
    inputs:{request:requestSlot},outputs:{value:resultSlot},input:r=>r.read('request',requestSlot),output:(v,w)=>w.put('value',resultSlot,v),
    model:{schema:{type:'object',properties:{request:requestSchema},required:['request'],additionalProperties:false},describe:'confirmed request'},
    node:{id:'maintenance-region',goal:'actual nested maintenance',requiredKnowledge:[],before:v=>eqRequest(v,confirmed)?ok(undefined):denied('STALE_REQUEST'),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
    create:v=>eqRequest(v,confirmed)?ok({...common<MaintenanceRequest>('maintenance-region',5,65_000_000,[purchase,scheduleRegion,schedule],'repair-region'),
      contextSlots:{},layout:[{kind:'gap',id:'steps',templates:[],seed:[]}],
      refresh:()=>ok({changed:[],dependencies:[],observations:[],slotEvidence:{}})}):denied('STALE_REQUEST')});
  const literal=()=>({kind:'literal' as const,value:{demand:confirmed.demand,service:confirmed.service}});
  const topology=()=>[{kind:'insert' as const,gap:'planning',node:{alias:'maintenance',capability:'maintenance-region',input:{request:literal()},
    initial:[{alias:'quote',capability:'parts-quote',input:{request:literal()}},
      {alias:'repair',capability:'repair-region',input:{purchase:{kind:'result' as const,node:'quote',slot:'value'}}}]}}];
  let generated=false;
  const definition:WorkflowRegionDefinition<MaintenanceRequest,MaintenanceResult>={...common<MaintenanceRequest>('maintenance-planning',6,100_000_000,[maintenance,purchase,scheduleRegion,schedule],'maintenance-region'),
    contextSlots:{},layout:[{kind:'gap',id:'planning',templates:[],seed:[]}],
    refresh:()=>ok({changed:[],dependencies:[],observations:[],slotEvidence:{}}),
    plan:async(v,root)=>{
      if(accepted(v,'maintenance-region'))return decision(v,'finish');
      if(generated)return denied('MAINTENANCE_TOPOLOGY_REQUIRED');
      generated=true;
      if(!options.model)return decision(v,'continue',topology());
      const meta={runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision};
      const result=await options.model.generate(root,{system:'Propose bounded workflow topology only; never invent a quote or schedule.',
        input:[{role:'user',text:'Return a single JSON object with exactly runId, regionId, planRevision, factRevision, action, edits. Copy metadata '+JSON.stringify(meta)+
          '. action continue. The confirmed request is '+JSON.stringify(confirmed)+'. Insert one maintenance-region in gap planning with request literal. Its initial array contains a parts-quote with the same request literal, then repair-region whose purchase input references the earlier quote alias slot value. Use this structure: '+JSON.stringify(topology())+
          '. No extra keys, no wrapper, no schedule or purchase output.'}],tools:[],output:{kind:'json',strict:false},maxOutputTokens:1024,requestKey:'maintenance-topology',action:'initial',reason:'bounded nested procurement and schedule'});
      if(result.status!=='COMPLETE')return result;
      return ok({source:'model' as const,proposal:result.value.json as unknown as WorkflowRegionProposal,access:{capabilities:['maintenance-region','parts-quote','repair-region'],contextSlots:[],resultSlots:[]}});
    },
    admit:(_v,p)=>{
      if(p.edits.length===0)return ok(undefined);
      const edit=p.edits[0];if(p.action!=='continue'||p.edits.length!==1||edit?.kind!=='insert'||edit.gap!=='planning'||edit.node.capability!=='maintenance-region')return denied('MAINTENANCE_EDIT_DENIED');
      const n=edit.node, q=n.initial?.[0],r=n.initial?.[1];
      const exact=(x:typeof n.input)=>Object.keys(x).length===1&&x.request?.kind==='literal'&&isRequest(x.request.value)&&eqRequest(x.request.value,confirmed);
      return exact(n.input)&&n.initial?.length===2&&q?.capability==='parts-quote'&&q.initial===undefined&&exact(q.input)&&r?.capability==='repair-region'&&r.initial===undefined&&Object.keys(r.input).length===1&&
        r.input.purchase?.kind==='result'&&r.input.purchase.node===q.alias&&r.input.purchase.slot==='value'?ok(undefined):denied('MAINTENANCE_EDIT_DENIED');
    }};
  const session=new StandardWorkflowSession({maxCalls:500,maxSteps:1000,maxDepth:10},{knowledge,current:options.current,
    limits:{maxWork:150_000_000,maxEvents:600,maxActiveScopes:24,maxNoProgress:6,maxActiveMs:90000,maxSettlementMs:2000,
      ...(options.model?{model:{maxCalls:1,maxRetries:0,maxOutputTokens:1024}}:{})},...(options.observe?{observe:options.observe}:{})});
  const outcome=await session.run(root=>runWorkflowRegion(root,definition,confirmed),{goal:'independently verified maintenance result',requiredKnowledge:[],terminalReads:0,
    validate:r=>validResult(r)?ok(undefined):denied('MAINTENANCE_FINAL_INVALID')});
  options.dispositions?.(session.dispositions());
  return outcome;
}
