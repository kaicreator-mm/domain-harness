/**
 * R23 independent cross-Element audit reader.
 *
 * This distinct LOCAL reader consumes only pinned DKE source projections;
 * it is NOT a domain Oracle, not a selected Business Package, and never
 * generates a KDP permit or a semantic ReviewDecision.
 */
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const owned=s=>[...(s.items||[]),...(s.relations||[]),...(s.gaps||[])];
const ids=value=>value==null?[]:Array.isArray(value)?value.flatMap(ids):[typeof value==='object'?value['@id']:value].filter(Boolean);
export const SUPPORTED=Object.freeze({
 tally:Object.freeze({cqId:'CQ-T-CROSSCUT',sapId:'O-T-CROSSCUT',sourceStatus:'PENDING_REVIEW'}),
 textile:Object.freeze({cqId:'CQ-X-COMPOSE',sapId:'O-X-COMPOSITION',sourceStatus:'REFERENCE'})
});
export function readCrossview(data,{domain,cqId}){
 const mode=SUPPORTED[domain];
 if(!mode||cqId!==mode.cqId)fail('DKE_CROSSVIEW_UNSUPPORTED_CQ');
 const source=data?.cases?.sourceData?.[domain];
 const candidate=data?.alternatives?.candidates?.find(x=>x.domain===domain);
 if(!source||!candidate||candidate.sourcePin?.blob!==source.sourcePin?.blob||
   candidate.sourceStatus!==mode.sourceStatus)fail('DKE_CROSSVIEW_SOURCE_PIN_INVALID');
 if(candidate.sap?.qualified!==false||candidate.sap?.oracle!=='NOT_VERIFIED'||
   candidate.qualifications?.accepted!==false)fail('DKE_CROSSVIEW_FALSE_QUALIFICATION');
 const cq=source.cq.find(q=>q.id===cqId);
 const obligation=candidate.sap.obligations.find(o=>o.id===mode.sapId);
 if(!cq||!obligation||obligation.relevance!=='KNOWLEDGE_ONLY'||!obligation.owner)
  fail('DKE_CROSSVIEW_SAP_INVALID');
 const refs=cq.refs,or=owned(obligation);
 if(!refs.length||refs.some(r=>!or.includes(r))||or.some(r=>!refs.includes(r)))
  fail('DKE_CROSSVIEW_CQ_SAP_MISMATCH');
 const scopes=candidate.scopes,sm=new Map(scopes.map(s=>[s.id,s]));
 const cqOwners=scopes.filter(s=>s.cq.includes(cqId));
 if(cqOwners.length!==1)fail('DKE_CROSSVIEW_CQ_OWNER_MISSING');
 const descendant=(id,parent)=>{
  const seen=new Set();
  while(id && sm.has(id)&&!seen.has(id)){if(id===parent)return true;seen.add(id);id=sm.get(id).parent;}
  return false;
 };
 const selectedScopes=[];
 for(const ref of refs){
  const ownedBy=scopes.filter(s=>owned(s).includes(ref));
  if(ownedBy.length!==1||!descendant(ownedBy[0].id,cqOwners[0].id)||
     !descendant(ownedBy[0].id,obligation.owner))
   fail('DKE_CROSSVIEW_OWNER_INVALID');
  if(!selectedScopes.includes(ownedBy[0].id))selectedScopes.push(ownedBy[0].id);
 }
 let evidenceRefs=[];
 if(domain==='tally'){
  const graph=new Map(data.graph?.['@graph']?.map(n=>[n['@id'],n]));
  const relation=graph.get('se:REL-TVV-0020');
  const ends=[...ids(relation?.['se:subject_ref']),...ids(relation?.['se:object_ref'])];
  evidenceRefs=ids(relation?.['se:evidence_refs']);
  if(relation?.['@type']!=='se:RelationshipAssertion'||
     relation['se:lifecycle_status']!=='PENDING_REVIEW'||
     ends.length!==2||!ends.every(e=>graph.get(e)?.['@type']==='se:TaxonomyNode')||
     evidenceRefs.length!==2||!evidenceRefs.every(e=>graph.get(e)?.['@type']==='se:Evidence'))
   fail('DKE_CROSSVIEW_REAL_RELATION_INVALID');
 }else{
  if(data.textile?.authority!=='REFERENCE'||
     !source.relationMetadata?.some(r=>r.id==='dke:rel-layered-methods-possible'&&r.kind==='DERIVED_INFERENCE_PENDING_ORACLE')||
     data.textile?.rules?.length!==3)
   fail('DKE_CROSSVIEW_REFERENCE_RELATION_INVALID');
  // This is only source traceability of a pending inference, not attested
  // evidence that the DKE-derived Relation is a raw source fact.
  evidenceRefs=['git-blob:'+source.sourcePin.blob];
 }
 return {
  status:'UNKNOWN',domain,cqId,selectedScopes,sourceRefs:[...refs],
  evidenceRefs,reason:'CROSS_ELEMENT_INVARIANT_PENDING_INDEPENDENT_ORACLE',
  sourceStatus:mode.sourceStatus,consumerId:'dke.r23.crossview.'+domain
 };
}
