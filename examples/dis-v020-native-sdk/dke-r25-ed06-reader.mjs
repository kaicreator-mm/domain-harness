/**
 * DKE R25 first independent knowledge reader — original Tally 09F Case/Evidence.
 * Reports source-presence OBSERVED without accepting source truth.
 */
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const asId=x=>typeof x==='object'&&x!==null?x['@id']:null;
export function inspectR25(data,{cqId}){
 if(data?.schema!=='dke.r25.tally-09f-source-snapshot/1'||data.sourceQualification!=='PENDING_INDEPENDENT_REVIEW')
  fail('DKE_R25_SOURCE_NOT_QUALIFIED');
 const id=data.selectedCqs?.[cqId];
 if(!id)fail('DKE_R25_CQ_NOT_SELECTED');
 const nodes=new Map(data.records.map(x=>[x['@id'],x]));
 const kase=nodes.get(id);
 if(!kase)return{status:'UNKNOWN',cqId,sourceStatus:'ABSENT',sourceRefs:[id],evidenceRefs:[],
  reason:'NOT_IN_PINNED_SOURCE_VERSION',consumerId:'dke.r25.ed06'};
 if(kase['@type']!=='se:Case'||kase['se:lifecycle_status']!=='PENDING_REVIEW'||kase['se:synthetic']!==false)
  fail('DKE_R25_CASE_INVALID');
 const evidenceRefs=(kase['se:evidence_refs']||[]).map(asId);
 if(evidenceRefs.length===0||evidenceRefs.some(eid=>{
   const evidence=nodes.get(eid),locId=asId(evidence?.['se:source_locator_ref']);
   const loc=nodes.get(locId),source=nodes.get(asId(loc?.['se:source_ref']));
   return evidence?.['@type']!=='se:Evidence'||evidence['se:lifecycle_status']!=='PENDING_REVIEW'||
    loc?.['@type']!=='se:SourceLocator'||source?.['@type']!=='se:Source';
 }))fail('DKE_R25_EVIDENCE_CLOSURE_INVALID');
 return{status:'OBSERVED',cqId,sourceStatus:'PENDING_REVIEW',sourceRefs:[id],
  evidenceRefs,reason:'PINNED_SOURCE_RECORD_PRESENT_UNREVIEWED',consumerId:'dke.r25.ed06'};
}
