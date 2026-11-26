import { extname } from 'node:path';
import { InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision, prepareCandidates, ClarificationElement, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';
import type { InteractionPrompt, InteractionEvent, InteractionDecision, EvidenceObservation, NativeWorkflowContext, WorkflowLimits } from '@kaicreator/domain-harness';
import { ArchiveElement, type Asset, type Result } from './archive.js';
import { FixityElement, ImageElement, VideoElement, type Policy, type MediaInfo } from './media.js';
import type { Receipt } from './catalog.js';
import type { RegistrationElement } from './client.js';

type Key = 'scope' | 'policy' | 'first' | 'second' | 'firstHash' | 'secondHash';
type Selection = Readonly<{first?:string;second?:string}>;
export type ArchiveInput = string | Selection;
export type ArchiveFacts = Readonly<{tenant:string;revision:string;policy:Policy;files:readonly Readonly<{id:string;tenant:string;path:string}>[]}>;
type File = ArchiveFacts['files'][number];
type Checked = Readonly<{file:File;hash:string;info:MediaInfo}>;
type Intent = Readonly<{facts:ArchiveFacts;pair:readonly [Checked,Checked]}>;
type State = Readonly<{selection:Selection;round:number;prior?:Intent;proposal?:readonly Asset[];offered?:ReadonlyMap<string,string>;snapshot?:string}>;
export type ArchiveProposal = readonly Readonly<{id:string;original:string;derivative:string;revision:string;source:Readonly<MediaInfo>;output:Readonly<MediaInfo>}>[];
export type ArchiveAttempt = Readonly<{tenant:string;asset:Asset;registration:Result<Receipt>;readback?:Result<Receipt>;readbackSkipped?:'NOT_REQUESTED'|'CANCELLED'|'REGISTRATION_NOT_COMPLETE'|'BUDGET'|'STALE_CONTEXT'}>;
const ok=<T>(value:T):Result<T>=>({status:'COMPLETE',value});
const stop=(status:'REJECT'|'ASK'|'UNKNOWN'|'FAILED',code:string):Result<never>=>({status,reason:{code,message:code}});
const bounds={maxItems:32,maxDependencies:32};
const enough=(root:NativeWorkflowContext,calls:number,steps:number,depth=0)=>{const r=root.remaining();return r.calls>=calls&&r.steps>=steps&&r.maxDescendantDepth>=depth;};
const id=(value:string)=>/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(value)&&value!=='constructor'&&value!=='prototype';
function parse(input:ArchiveInput):Selection|undefined {
  if(typeof input!=='string')return input;
  const m=/^归档(?: ([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})(?: ([A-Za-z0-9][A-Za-z0-9_.:-]{0,127}))?)?$/u.exec(input);
  return m?{...(m[1]?{first:m[1]}:{}),...(m[2]?{second:m[2]}:{})}:undefined;
}
/** Trusted host supplies immutable scope/available-file snapshots, not client-submitted paths or policy. */
export function archiveInteractively(limits:WorkflowLimits,input:ArchiveInput,readFacts:()=>ArchiveFacts|undefined,video:VideoElement,staging:string,
  owner: (tenant:string,asset:Asset)=>Promise<RegistrationElement|undefined>,
  options:Readonly<{review?:boolean;readback?:boolean;onPrompt?:(prompt:InteractionPrompt,interaction:InteractionElement)=>void}>={}) {
  const fixity=new FixityElement(),image=new ImageElement();
  let attempt:ArchiveAttempt|undefined;let cleanupFailed=false;const proposals:ArchiveProposal[]=[];
  const interaction=new InteractionElement(options.onPrompt===undefined?undefined:{onPrompt:options.onPrompt});
  const validFacts=(f:ArchiveFacts)=>/^[A-Za-z0-9_-]{1,64}$/u.test(f.tenant)&&id(f.revision)&&id(f.policy.revision)&&f.files.length<=16&&Array.from({length:f.files.length},(_,i)=>Object.hasOwn(f.files,i)).every(Boolean)&&new Set(f.files.map(x=>x.id)).size===f.files.length&&f.files.every(x=>id(x.id));
  const sameFacts=(f:ArchiveFacts)=>{try{const current=readFacts();return current!==undefined&&current.tenant===f.tenant&&current.revision===f.revision&&current.policy.revision===f.policy.revision&&JSON.stringify(current)===JSON.stringify(f);}catch{return false;}};
  const check=async(file:File,p:Policy,signal:AbortSignal):Promise<Result<Checked>>=>{
    if(signal.aborted)return stop('REJECT','CANCELLED');
    const ext=extname(file.path).toLowerCase();if(!['.png','.jpg','.jpeg','.mp4'].includes(ext))return stop('REJECT','UNSUPPORTED_MEDIA');
    try{const hash=await fixity.digest(file.path,p.maxBytes);const element=ext==='.mp4'?video:image;if(signal.aborted)return stop('REJECT','CANCELLED');const info=await element.inspect(file.path);
      if(Math.max(info.seconds,info.containerSeconds??0)>p.maxSeconds)return stop('REJECT','DURATION_LIMIT');
      if(signal.aborted)return stop('REJECT','CANCELLED');await element.verify(file.path);if(signal.aborted)return stop('REJECT','CANCELLED');if(await fixity.digest(file.path,p.maxBytes)!==hash)return stop('UNKNOWN','SOURCE_CHANGED');return ok({file,hash,info});
    }catch(error){return stop(error instanceof Error&&['FILE_LIMIT','IMAGE_FORMAT','VIDEO_CONTAINER'].includes(error.message)?'REJECT':'UNKNOWN','MEDIA_EVIDENCE_UNAVAILABLE');}
  };
  const invalidatePlan=(key:'first'|'second')=>invalidateEvidence<Key|'plan'>(['scope','policy','first','second','firstHash','secondHash','plan'],[key],[{key:'scope',dependsOn:[]},{key:'policy',dependsOn:[]},{key:'first',dependsOn:[]},{key:'second',dependsOn:['first']},{key:'firstHash',dependsOn:['first']},{key:'secondHash',dependsOn:['second']},{key:'plan',dependsOn:['firstHash','secondHash','policy']}],bounds);
  const decide=async(state:Readonly<State>,event:InteractionEvent<Key>,root:NativeWorkflowContext,signal:AbortSignal):Promise<Result<InteractionDecision<State,Intent,Key>>>=>{
    const facts=readFacts();if(!facts)return stop('UNKNOWN','SCOPE_UNKNOWN');if(!validFacts(facts))return stop('REJECT','FACTS_INVALID');
    if(state.snapshot!==undefined&&state.snapshot!==JSON.stringify(facts))return stop('UNKNOWN','STALE_FILE_SET');
    if(state.prior&&!sameFacts(state.prior.facts))return stop('UNKNOWN','STALE_FILE_SET');
    let selected=state.selection;let invalidated:readonly string[]|undefined;
    if(event.kind==='initial'&&state.proposal){
      const stale=invalidatePlan('second');
      if(!stale.complete||!stale.stale.includes('plan'))return stop('FAILED','INVALIDATION_FAILED');invalidated=stale.stale;
    }else if(event.kind==='initial'&&!state.proposal){const parsed=parse(input);if(!parsed)return stop('UNKNOWN','UNSUPPORTED_INPUT');selected=parsed;}
    else if(event.kind==='response'){
      const mapped=event.clarification;if(!mapped)return stop('FAILED','CLARIFICATION_BINDING');
      if(mapped.status==='other'){
        if(event.response.action!=='revise'||!('text' in event.response))return stop('ASK','NO_MATCHING_FILE');
        const parsed=parse(event.response.text);if(!parsed)return stop('UNKNOWN','UNSUPPORTED_REVISION');selected=parsed;
        const stale=invalidatePlan('first');
        if(!stale.complete||!stale.stale.includes('plan'))return stop('FAILED','INVALIDATION_FAILED');invalidated=stale.stale;
      }else for(const item of mapped.values){if(typeof item.value!=='string'||!['first','second'].includes(item.key))return stop('REJECT','INVALID_CHOICE');selected=item.key==='first'?(selected.first===undefined||selected.first===item.value?{...selected,first:item.value}:{first:item.value}):{...selected,second:item.value};}
    }
    const available=facts.files.filter(f=>f.tenant===facts.tenant);
    const checked=new Map<string,Result<Checked>>();
    // This bounded read-only analysis is already entered; A drains it on cancellation and prevents Handling.
    for(const file of available){if(signal.aborted)return stop('REJECT','CANCELLED');const result=await root.invokeOutcome(()=>check(file,facts.policy,signal));if(signal.aborted)return stop('REJECT','CANCELLED');if(result.status==='FAILED')return result;checked.set(file.id,result);}
    if(!sameFacts(facts))return stop('UNKNOWN','STALE_FILE_SET');
    // A response cannot bind to different bytes than those offered, including the retained first selection.
    for(const key of [selected.first,selected.second])if(key!==undefined){const result=checked.get(key);if(!result)return stop('REJECT','FILE_SCOPE');if(result.status!=='COMPLETE')return result;
      if(state.offered?.has(key)&&state.offered.get(key)!==result.value.hash)return stop('UNKNOWN','SOURCE_CHANGED');
      if(state.prior?.pair.some(old=>old.file.id===key&&old.hash!==result.value.hash))return stop('UNKNOWN','SOURCE_CHANGED');
      if(event.kind==='response'&&!state.offered?.has(key))return stop('UNKNOWN','UNOBSERVED_FILE');}
    const first=selected.first===undefined?undefined:checked.get(selected.first),second=selected.second===undefined?undefined:checked.get(selected.second);
    if(first?.status==='COMPLETE'&&second?.status==='COMPLETE'&&first.value.hash===second.value.hash)return stop('REJECT','DUPLICATE_CONTENT');
    const source={id:'facts',scope:facts.tenant,revision:facts.revision},user={id:'user',scope:facts.tenant,revision:String(state.round)};
    const observations:EvidenceObservation<Key,string>[]=[{key:'scope',state:'known',origin:'authority',value:facts.tenant,source},{key:'policy',state:'known',origin:'authority',value:facts.policy.revision,source}];
    if(selected.first!==undefined)observations.push({key:'first',state:'known',origin:'user',value:selected.first,source:user});
    if(selected.second!==undefined)observations.push({key:'second',state:'known',origin:'user',value:selected.second,source:user});
    if(first?.status==='COMPLETE')observations.push({key:'firstHash',state:'known',origin:'authority',value:first.value.hash,source});
    if(second?.status==='COMPLETE')observations.push({key:'secondHash',state:'known',origin:'authority',value:second.value.hash,source});
    const evidence=resolveEvidence<Key,string>([{key:'scope',accepts:['authority']},{key:'policy',accepts:['authority']},{key:'first',accepts:['user']},{key:'second',accepts:['user']},{key:'firstHash',accepts:['authority']},{key:'secondHash',accepts:['authority']}],observations,{scope:facts.tenant,revisions:new Map([['facts',facts.revision],['user',String(state.round)]])},{equal:(_k,a,b)=>a===b},32);
    if(!evidence.complete)return stop('FAILED','EVIDENCE_FAILED');const has=(key:Key)=>evidence.items.some(row=>row.key===key&&row.status==='resolved');
    const selection=selectNextDecision<Key>([{key:'scope',dependsOn:[],applicable:'yes',required:'yes',satisfied:has('scope')?'yes':'unknown',priority:40},{key:'policy',dependsOn:['scope'],applicable:'yes',required:'yes',satisfied:has('policy')?'yes':'unknown',priority:30},{key:'first',dependsOn:['scope','policy'],applicable:'yes',required:'yes',satisfied:has('first')&&has('firstHash')?'yes':'no',priority:20},{key:'second',dependsOn:['first'],applicable:'yes',required:'yes',satisfied:has('second')&&has('secondHash')?'yes':'no',priority:10}],bounds);
    if(!selection.complete)return stop('FAILED','DECISION_FAILED');const key=selection.status==='next'?selection.key:'second';
    const context={scope:facts.tenant,revision:`${facts.revision}:${state.round}:${key}`};
    const candidates=prepareCandidates({status:'complete',...context,entries:available.map(file=>({...context,id:file.id,value:checked.get(file.id)!}))},context,{
      assess:entry=>entry.value.status==='COMPLETE'?((key==='second'&&first?.status==='COMPLETE'&&entry.value.value.hash===first.value.hash||key==='first'&&second?.status==='COMPLETE'&&entry.value.value.hash===second.value.hash)?{status:'excluded',reason:'DUPLICATE_CONTENT'}:{status:'eligible'}):{status:entry.value.status==='REJECT'?'excluded':'unknown',reason:entry.value.reason.code},
      comparisonLabels:['Kind','Dimensions','Seconds'],project:entry=>{if(entry.value.status!=='COMPLETE')throw Error('NOT_ELIGIBLE');const info=entry.value.value.info;return {label:entry.id,priority:0,cells:[info.kind,`${info.width}×${info.height}`,String(info.seconds)]};},
    },{maxVisited:16,maxReturned:16});
    const built=ClarificationElement.prepare(evidence,selection,{decisionKey:key,title:`Select ${key} media`,...(state.proposal?{description:`Computed access copies: ${state.proposal.map(a=>`${a.output.width}×${a.output.height}`).join(', ')}. Select the second file or revise the pair.`}:{}),actions:['submit','revise','no-fit','cancel']},[{field:{kind:'choice',id:key,label:key,required:true,options:[],completeness:'incomplete'},evidenceKey:key,applicable:'yes',confirmation:'user',candidates:{current:context,result:candidates}}]);
    if(built.status==='ready'&&first?.status==='COMPLETE'&&second?.status==='COMPLETE')return ok({kind:'ready',intent:{facts,pair:[first.value,second.value]},...(invalidated?{invalidate:invalidated}:{})});
    if(built.status!=='prompt')return stop(built.status==='failed'?'FAILED':'UNKNOWN','CLARIFICATION_'+built.status.toUpperCase());
    const offered=new Map<string,string>();for(const [file,result] of checked)if(result.status==='COMPLETE')offered.set(file,result.value.hash);
    return ok({kind:'clarify',state:{...state,selection:selected,round:state.round+1,offered,snapshot:JSON.stringify(facts)},clarification:built.clarification,...(invalidated?{invalidate:invalidated}:{})});
  };
  const result=runInteractiveRecognitionHandling<State,Intent,Receipt,Key>(interaction,limits,{selection:{},round:0},decide,async(initial,scope)=>{
    let intent=initial;let plan:Extract<Awaited<ReturnType<ArchiveElement['planIn']>>,{status:'COMPLETE'}>['value']|undefined;
    // 清理失败单独记录，不让 finally 覆盖已经得到的业务结果或原始异常。
    const disposePlan=async():Promise<boolean>=>{
      if(!plan)return true;
      try{await plan.dispose();plan=undefined;return true;}
      catch{cleanupFailed=true;return false;}
    };
    try{
      const makePlan=async()=>{
        if(scope.signal.aborted||!sameFacts(intent.facts))return stop('UNKNOWN','STALE_OR_CANCELLED');
        if(!enough(scope.root,19,23,2))return stop('FAILED','MEDIA_PLAN_BUDGET');
        const p=await new ArchiveElement(video,intent.facts.policy,staging).planIn(scope.root,intent.pair.map(x=>x.file.path),scope.signal);
        if(p.status!=='COMPLETE')return p;plan=p.value;
        if(plan.assets.some((a,i)=>a.original!==intent.pair[i]!.hash||a.revision!==intent.facts.policy.revision))return stop('UNKNOWN','SOURCE_CHANGED');
        proposals.push(Object.freeze(plan.assets.map((a,i)=>Object.freeze({id:intent.pair[i]!.file.id,original:a.original,derivative:a.derivative,revision:a.revision,source:Object.freeze({...a.source}),output:Object.freeze({...a.output})}))));return ok(plan);
      };
      const first=await makePlan();if(first.status!=='COMPLETE')return first;
      if(options.review){const next=await scope.resolve<State,Intent,Key>({selection:{first:intent.pair[0].file.id},round:100,prior:intent,proposal:first.value.assets,snapshot:JSON.stringify(intent.facts)},decide);
        if(next.status!=='COMPLETE')return next;const changed=next.value.pair.some((x,i)=>x.hash!==intent.pair[i]!.hash);intent=next.value;
        if(changed){if(!await disposePlan())return stop('FAILED','MEDIA_CLEANUP_FAILED');const revised=await makePlan();if(revised.status!=='COMPLETE')return revised;}}
      if(scope.signal.aborted||!sameFacts(intent.facts))return stop('UNKNOWN','STALE_OR_CANCELLED');
      const group=options.readback===false?4:5;if(!enough(scope.root,group,group))return stop('FAILED','MEDIA_REGISTRATION_BUDGET');
      const original=plan!.assets[0]!;const asset=Object.freeze({...original,source:Object.freeze({...original.source}),output:Object.freeze({...original.output})});const tenant=intent.facts.tenant;
      // Independent Owner decides whether to supply a client for this exact asset; user expression never grants approval.
      const authorized=await scope.root.invokeOutcome(async()=>ok(await owner(tenant,asset)));if(authorized.status!=='COMPLETE')return authorized;
      if(!authorized.value)return stop('ASK','APPROVAL_REQUIRED');
      for(const checked of intent.pair){if(scope.signal.aborted||!sameFacts(intent.facts))return stop('UNKNOWN','STALE_OR_CANCELLED');const hash=await scope.root.invoke(()=>fixity.digest(checked.file.path,intent.facts.policy.maxBytes));if(hash.status!=='COMPLETE')return hash;if(hash.value!==checked.hash)return stop('UNKNOWN','SOURCE_CHANGED');}
      if(scope.signal.aborted||!sameFacts(intent.facts))return stop('UNKNOWN','STALE_OR_CANCELLED');
      const registration=await authorized.value.registerIn(scope.root,tenant,asset);
      attempt=Object.freeze({tenant,asset,registration});
      if(registration.status!=='COMPLETE'){attempt=Object.freeze({...attempt,readbackSkipped:'REGISTRATION_NOT_COMPLETE'});return registration;}
      if(options.readback===false||scope.signal.aborted||!sameFacts(intent.facts)||!enough(scope.root,1,1)){
        attempt=Object.freeze({...attempt,readbackSkipped:options.readback===false?'NOT_REQUESTED':scope.signal.aborted?'CANCELLED':!sameFacts(intent.facts)?'STALE_CONTEXT':'BUDGET'});return registration;
      }
      const readback=await authorized.value.readbackIn(scope.root,tenant,asset);attempt=Object.freeze({...attempt,readback});return registration;
    }finally{await disposePlan();}
  });
  return Object.freeze({interaction,result,observed:()=>attempt,proposals:()=>Object.freeze([...proposals]),cleanupFailed:()=>cleanupFailed});
}
