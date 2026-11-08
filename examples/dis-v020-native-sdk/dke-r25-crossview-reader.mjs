/**
 * DKE R25 independent crossview reader — scans the original Case source tree
 * separately from ED06's keyed lookup. Never asserts incident truth.
 */
const refuse=code=>{const e=new Error(code);e.code=code;throw e};
const ref=x=>x?.['@id'];
export function inspectR25(data,{cqId}){
 if(data?.schema!=='dke.r25.tally-09f-source-snapshot/1'||
    data.sourceQualification!=='PENDING_INDEPENDENT_REVIEW')
  refuse('DKE_R25_SOURCE_NOT_QUALIFIED');
 const caseId=data.selectedCqs?.[cqId];
 if(!caseId)refuse('DKE_R25_CQ_NOT_SELECTED');
 const cases=data.records.filter(x=>x['@type']==='se:Case'&&x['@id']===caseId);
 if(cases.length>1)refuse('DKE_R25_CASE_NOT_UNIQUE');
 if(cases.length===0)return{status:'UNKNOWN',cqId,sourceStatus:'ABSENT',sourceRefs:[caseId],
  evidenceRefs:[],reason:'NOT_IN_PINNED_SOURCE_VERSION',consumerId:'dke.r25.crossview'};
 const kase=cases[0];
 if(kase['se:lifecycle_status']!=='PENDING_REVIEW'||kase['se:synthetic']!==false)
  refuse('DKE_R25_CASE_INVALID');
 const evidenceRefs=(kase['se:evidence_refs']||[]).map(ref);
 const evidence=data.records.filter(x=>evidenceRefs.includes(x['@id'])&&x['@type']==='se:Evidence');
 if(!evidenceRefs.length||evidence.length!==evidenceRefs.length||
    new Set(evidenceRefs).size!==evidenceRefs.length||
    evidence.some(e=>{
     if(e['se:lifecycle_status']!=='PENDING_REVIEW')return true;
     const locs=data.records.filter(l=>l['@type']==='se:SourceLocator'&&l['@id']===ref(e['se:source_locator_ref']));
     return locs.length!==1||data.records.filter(s=>s['@type']==='se:Source'&&s['@id']===ref(locs[0]['se:source_ref'])).length!==1;
    }))refuse('DKE_R25_EVIDENCE_CLOSURE_INVALID');
 return{status:'OBSERVED',cqId,sourceStatus:'PENDING_REVIEW',sourceRefs:[caseId],
  evidenceRefs,reason:'PINNED_SOURCE_RECORD_PRESENT_UNREVIEWED',consumerId:'dke.r25.crossview'};
}
