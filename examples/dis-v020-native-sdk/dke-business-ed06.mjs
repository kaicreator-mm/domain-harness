/**
 * DKE ED06: three real, source-pinned bounded data consumers of actual DIS v0.2
 * Public Function I/O + typed outcomes. No KDP/selected BUILD/AOT/effects.
 * Pure core: compatible with any JS executor supporting these ordinary APIs.
 */
export const CONTRACT={
 schema:'dis.v0.2.function-contract/1',version:'1.0.0',
 input:{type:'record',fields:{domain:'string',cqId:'string'},optional:[],additionalProperties:false},
 output:{type:'record',fields:{status:'string',cqId:'string',domain:'string',
   selectedScopes:'array',sourceRefs:'array',evidenceRefs:'array',reason:'string',
   sourceStatus:'string',consumerId:'string'},optional:[],additionalProperties:false},
 outcomes:{field:'status',classes:{OBSERVED:'OBSERVED',UNKNOWN:'UNKNOWN',
   FAILED:'FAILED',SUCCEEDED:'SUCCEEDED'}},
 evidence:{refField:'evidenceRefs',requiredFor:['OBSERVED','SUCCEEDED']},
 compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
};
const ensure=(condition,code)=>{if(!condition)throw Error(code)};
const readRefs=s=>[...(s.items||[]),...(s.relations||[]),...(s.gaps||[])];
const plan=(d,source,variant)=>{
 if(variant==='REVIEWER_ROOT')return source.alternatives.candidates.find(c=>c.domain===d);
 return source.strategies.results.find(c=>c.domain===d&&c.strategy===variant)?.candidate;
};
function evidenceFor(data,domain,ids){
 if(domain==='textile')return [...new Set(ids.flatMap(id=>{
   const rule=data.textile.rules.find(r=>r.id===id);
   return (rule?.sources||[]).filter(r=>data.textile.sources.some(s=>s.id===r)).map(s=>'fixture-source:'+s);
 }))];
 const map=new Map(data.graph['@graph'].map(n=>[n['@id'],n]));
 return [...new Set(ids.flatMap(id=>{
   const node=map.get(id);if(!node)return[];
   const e=node['se:evidence_refs']||node['se:SUPPORTED_BY']||[];
   return (Array.isArray(e)?e:[e]).map(v=>v['@id']).filter(Boolean)
     .filter(v=>map.get(v)?.['@type']==='se:Evidence');
 }))];
}
export function consume(data,dis,{domain,cqId,variant='REVIEWER_ROOT'}){
 const cs=data.cases.sourceData[domain];ensure(cs,'UNKNOWN_DOMAIN');
 const q=cs.cq.find(c=>c.id===cqId);ensure(q,'UNKNOWN_CQ');
 const c=plan(domain,data,variant);ensure(c,'MISSING_DECOMPOSITION');
 const scopes=c.scopes||[],map=new Map(scopes.map(s=>[s.id,s])),refs=q.refs;
 const ids=refs.map(ref=>scopes.filter(s=>readRefs(s).includes(ref)));
 ensure(ids.every(a=>a.length===1),'MISSING_OR_DUPLICATE_ELEMENT_OWNER');
 const owners=[...new Set(ids.flatMap(a=>a.map(s=>s.id)))];
 const pin=c.sourcePin||c.pin;ensure(pin?.blob===cs.sourcePin.blob,'SOURCE_PIN_DRIFT');
 const sourceMap=new Map(data.graph['@graph'].map(n=>[n['@id'],n]));
 const evidenceRefs=evidenceFor(data,domain,refs);
 // DIS refField rejects [] if present, even for UNKNOWN. A fixed Git Blob is
 // provenance of a bounded reference input, NOT accepted domain evidence.
 if(evidenceRefs.length===0){
   // A file pin is enough to trace UNKNOWN, never enough to substantiate OBSERVED.
   ensure(!(domain==='textile'&&(cqId==='CQ-X-STRUCTURE'||cqId==='CQ-X-SURFACE')),
     'TEXTILE_REFERENCE_EVIDENCE_MISSING');
   evidenceRefs.push('git-blob:'+cs.sourcePin.blob);
 }
 let status='UNKNOWN',reason,sourceStatus;
 if(domain==='tally'){
   ensure(refs.every(r=>sourceMap.has(r)),'TALLY_SOURCE_REFERENCE_MISSING');
   const rel=sourceMap.get('se:REL-TVV-0020');
   if(refs.includes(rel['@id'])){
     const ends=[rel['se:subject_ref']?.['@id'],rel['se:object_ref']?.['@id']];
     ensure(ends.every(id=>sourceMap.get(id)?.['@type']==='se:TaxonomyNode'),'TALLY_RELATION_ENDPOINT_MISSING');
     ensure(rel['se:evidence_refs'].every(e=>sourceMap.get(e['@id'])?.['@type']==='se:Evidence'),'TALLY_RELATION_EVIDENCE_MISSING');
   }
   sourceStatus='PENDING_REVIEW';reason='UNACCEPTED_GRAPH_CLAIM_OR_RELATION';
 }else{
   sourceStatus='REFERENCE';
   const rules=data.textile.rules;
   ensure(refs.filter(r=>cs.items.includes(r)).every(id=>rules.some(r=>r.id===id)),'TEXTILE_RULE_NOT_IN_FIXED_SOURCE');
   if(q.id==='CQ-X-STRUCTURE'||q.id==='CQ-X-SURFACE'){
     status='OBSERVED';reason='BOUNDED_REFERENCE_TECHNIQUE_NOT_COMMERCIAL_POLICY';
     ensure(evidenceRefs.length>0,'TEXTILE_REFERENCE_EVIDENCE_MISSING');
   }else if(q.id==='CQ-X-COMPOSE'){
     reason='DERIVED_RELATION_UNQUALIFIED_AND_TYPED_ENDPOINTS_UNMAPPED';
   }else{reason='SIX_COMMERCIAL_VALUES_UNKNOWN_NOT_QUOTED'}
 }
 const input={domain,cqId};
 ensure(dis.validateDisV020FunctionValue(CONTRACT,'input',input)===true,'DIS_INPUT_REJECTED');
 const output={status,cqId,domain,selectedScopes:owners,sourceRefs:[...refs],evidenceRefs,reason,sourceStatus,
   consumerId:'dke.ed06.local.'+domain+'.'+cqId};
 ensure(dis.validateDisV020FunctionValue(CONTRACT,'output',output)===true,'DIS_OUTPUT_REJECTED');
 const typed=dis.classifyDisV020FunctionOutcome(CONTRACT,output);
 ensure(typed.disposition===status,'DIS_TYPED_OUTCOME_MISMATCH');
 ensure(status!=='SUCCEEDED'||sourceStatus==='ACCEPTED','UNACCEPTED_SUCCESS');
 return {variant,output,typedDisposition:typed.disposition,selectedScopeCount:owners.length,actualSourceAccepted:false,
   registeredHere:true,nativeKdpConsumer:false};
}
function impact(data,domain,variant,ev){
 const c=plan(domain,data,variant),cs=data.cases.sourceData[domain];
 const expectedCQ=cs.cq.find(q=>q.id===ev.cqId);ensure(expectedCQ,'IMPACT_CQ_UNKNOWN');
 const obligation=c.sap.obligations.find(o=>o.id===ev.sapId);ensure(obligation,'IMPACT_SAP_UNKNOWN');
 const refs=[...(obligation.items||[]),...(obligation.relations||[]),...(obligation.gaps||[])];
 const direct=expectedCQ.refs.includes(ev.ref)&&refs.includes(ev.ref);
 const proposed=!direct&&ev.newSelection===true;
 ensure(direct||proposed,'IMPACT_NOT_REGISTERED_OR_PROPOSED');
 const named=readRefs;
 const scope=c.scopes.find(s=>named(s).includes(ev.ref))||
   (proposed?c.scopes.find(s=>s.id===obligation.owner):null);
 ensure(scope,'IMPACT_OWNER_UNKNOWN');
 const byId=new Map(c.scopes.map(s=>[s.id,s]));
 const lineage=[],seen=new Set();let next=scope;
 while(next){ensure(!seen.has(next.id),'IMPACT_PARENT_CYCLE');seen.add(next.id);lineage.push(next.id);next=byId.get(next.parent)}
 ensure(lineage.at(-1)===c.scopes.find(s=>s.kind==='ROOT')?.id,'IMPACT_UNROOTED');
 return{domain,variant,event:ev.id,consumer:'dke.ed06.local.'+domain+'.'+ev.cqId,
  changedRef:ev.ref,impactCQ:ev.cqId,staleSAP:ev.sapId,changeAccepted:false,
  registeredDependency:direct,dependencyProposed:proposed,owner:scope.id,ancestorCount:lineage.length,
  nativeConsumersKnown:false,externalConsumerClosure:'UNKNOWN',sapQualified:false};
}
export function runThreeRounds(data,dis){
 const results=[],negative=[];
 const must=(name,fn)=>{let ok=false,code=null;try{fn()}catch(e){ok=true;code=e.code||e.message}
   negative.push({name,rejected:ok,code});ensure(ok,'NEGATIVE_NOT_REJECTED_'+name)};
 const domains=['tally','textile'],variants=['REVIEWER_ROOT','CONTEXT','GLOBAL'];
 // Round 1 — real Tally original source as a DIS Function consumer, no forced source acceptance.
 for(const variant of variants)
  for(const q of data.cases.sourceData.tally.cq){
    const r=consume(data,dis,{domain:'tally',cqId:q.id,variant});
    ensure(r.output.status==='UNKNOWN'&&r.output.sourceStatus==='PENDING_REVIEW','TALLY_FALSE_QUALIFICATION');
    results.push({round:1,...r});
  }
 must('R1_UNKNOWN_CQ',()=>consume(data,dis,{domain:'tally',cqId:'FAKE'}));
 must('R1_DIS_INPUT_INVALID',()=>dis.validateDisV020FunctionValue(CONTRACT,'input',{domain:'tally',cqId:'CQ-T-VV',privilege:'admin'}));
 must('R1_DIS_UNDECLARED_OUTCOME',()=>dis.classifyDisV020FunctionOutcome(CONTRACT,{status:'READY',evidenceRefs:[]}));
 const altered=JSON.parse(JSON.stringify(data));
 altered.graph['@graph']=altered.graph['@graph'].filter(n=>n['@id']!=='se:NODE-SSDF-RV');
 must('R1_REAL_ENDPOINT_DELETED',()=>consume(altered,dis,{domain:'tally',cqId:'CQ-T-CROSSCUT'}));
 const missingOwner=JSON.parse(JSON.stringify(data));
 missingOwner.alternatives.candidates.find(c=>c.domain==='tally').scopes[0].relations=[];
 must('R1_OWNER_MISSING',()=>consume(missingOwner,dis,{domain:'tally',cqId:'CQ-T-CROSSCUT'}));
 // Round 2 — actual Textile rules, with unqualified composition and commercial UNKNOWN.
 for(const variant of variants)
  for(const q of data.cases.sourceData.textile.cq){
    const r=consume(data,dis,{domain:'textile',cqId:q.id,variant});
    const shouldObserved=['CQ-X-STRUCTURE','CQ-X-SURFACE'].includes(q.id);
    ensure(r.output.status===(shouldObserved?'OBSERVED':'UNKNOWN'),'TEXTILE_RELEVANCE_DRIFT');
    results.push({round:2,...r});
  }
 const observed=results.find(r=>r.round===2&&r.output.cqId==='CQ-X-STRUCTURE');
 must('R2_DIS_EVIDENCE_REQUIRED',()=>dis.classifyDisV020FunctionOutcome(CONTRACT,{...observed.output,evidenceRefs:[]}));
 const alteredTextile=JSON.parse(JSON.stringify(data));
 alteredTextile.textile.rules.find(r=>r.id==='jacquard').sources=['forged-source'];
 must('R2_REFERENCE_NOT_ATTESTED',()=>consume(alteredTextile,dis,{domain:'textile',cqId:'CQ-X-STRUCTURE'}));
 const spoofed={...observed.output,status:'SUCCEEDED',evidenceRefs:['invented:source']};
 const schemaVerdict=dis.classifyDisV020FunctionOutcome(CONTRACT,spoofed);
 ensure(schemaVerdict.disposition==='SUCCEEDED','DIS_SCHEMA_VERDICT_CHANGED');
 must('R2_DIS_NOT_A_DOMAIN_ORACLE',()=>{ensure(spoofed.status!=='SUCCEEDED'||spoofed.sourceStatus==='ACCEPTED','SOURCE_QUALIFICATION_REQUIRED')});
 // Round 3 — four source selection / hypothetical events with actual registered local consumers.
 const events=[
  {id:'TALLY_RELATION_REVIEW',domain:'tally',ref:'se:REL-TVV-0020',cqId:'CQ-T-CROSSCUT',sapId:'O-T-CROSSCUT',newSelection:false},
  {id:'TALLY_HELDOUT_CLAIM',domain:'tally',ref:data.cases.sourceData.tally.change.newItem,cqId:'CQ-T-SECURITY',sapId:'O-T-LIFECYCLE',newSelection:true},
  {id:'TEXTILE_COMPOSITION_REVIEW',domain:'textile',ref:'dke:rel-layered-methods-possible',cqId:'CQ-X-COMPOSE',sapId:'O-X-COMPOSITION',newSelection:false},
  {id:'TEXTILE_AALTO_PROPOSAL',domain:'textile',ref:data.cases.sourceData.textile.change.newRelation,cqId:'CQ-X-COMPOSE',sapId:'O-X-COMPOSITION',newSelection:true}
 ];
 const changes=[];
 for(const variant of variants)for(const ev of events)changes.push(impact(data,ev.domain,variant,ev));
 ensure(changes.length===12,'IMPACT_CASE_COUNT');
 for(const e of events){
   const x=changes.filter(c=>c.event===e.id);
   ensure(x.length===3&&new Set(x.map(c=>c.staleSAP)).size===1&&new Set(x.map(c=>c.impactCQ)).size===1,
     'INCONSISTENT_SEMANTIC_DEPENDENCIES');
 }
 must('R3_FAKE_NATIVE_CONSUMER',()=>{const x=changes[0];ensure(x.nativeConsumersKnown,'NATIVE_REGISTRY_NOT_PROVEN')});
 must('R3_FALSELY_ACCEPTED_CHANGE',()=>{const x=changes[0];ensure(x.changeAccepted,'SOURCE_REVIEW_REQUIRED')});
 const lost=JSON.parse(JSON.stringify(data));
 lost.alternatives.candidates.find(c=>c.domain==='textile').sap.obligations.find(o=>o.id==='O-X-COMPOSITION').relations=[];
 must('R3_SAP_REFERENCE_MISSING',()=>impact(lost,'textile','REVIEWER_ROOT',events[2]));
 return{
  schema:'dke.ed06.consumption/1',rounds:[
   {id:'R1_TALLY_DIS_IO',queries:results.filter(r=>r.round===1).length,unknown:results.filter(r=>r.round===1&&r.output.status==='UNKNOWN').length},
   {id:'R2_TEXTILE_DIS_IO',queries:results.filter(r=>r.round===2).length,observed:results.filter(r=>r.round===2&&r.output.status==='OBSERVED').length,unknown:results.filter(r=>r.round===2&&r.output.status==='UNKNOWN').length},
   {id:'R3_CQ_SAP_CONSUMER_STALENESS',events:events.length,consumerComparisons:changes.length}
  ],positiveCalls:results.length,actualDISContractValidation:true,
  tests:negative,negativesRejected:negative.filter(n=>n.rejected).length,
  negativeCount:negative.length,sourceQualifiers:{tally:'PENDING_REVIEW',textile:'REFERENCE',sapQualified:false},
  contractBlindSpot:'DIS_TYPED_OUTCOME_SCHEMA_ACCEPTS_SUCCEEDED_WITH_ANY_NONEMPTY_STRING_EVIDENCE;_DKE_SOURCE_AUTHORITY_MUST_ENFORCE_SEPARATELY',
  actualLocalConsumers:results.map(r=>r.output.consumerId).filter((x,i,a)=>a.indexOf(x)===i),
  changes,limitations:['No selected BUILD/KDP/physical Journal','No production DIS consumer registry','No domain expert Oracle or qualified SAP',
   'Only contract code actually executed, no native DIS AOT runtime','External Aalto relation is unaccepted proposed evidence, not producer mutation'],
  outputs:results.map(r=>({round:r.round,variant:r.variant,...r.output,typedDisposition:r.typedDisposition}))
 };
}


// R24: actual independent v0.10 Business Package entry, selected through
// the canonical BUILD and imported by KDP as sealed, pinned source bytes.
// This Package exposes source-grounded, observation-only LOCAL knowledge.
// No KDP intent/Effect, SAP acceptance, or domain authority is claimed.
export const MODULE_ID="business-dke-ed06-observation@0.0.1-demo";
export const PACKAGE_KIND='business';
export const ABI_VERSION='v08-business-abi/1';
export function getPolicy(){
 return Object.freeze({
  packageId:MODULE_ID,
  policyId:MODULE_ID+':readonly',
  domainId:"dke-ed06",
  workflowDefinition:Object.freeze({workflowKey:MODULE_ID+':observation'}),
  intentBindings:Object.freeze({}),effectBindings:Object.freeze({})
 });
}
