/**
 * DIS/DKE R27 — bounded source-record → CQ → proposed SAP → actually
 * BUILD-selected Package/Function impact qualification.
 *
 * Inputs: immutable R25 Tally 793→807 source projections, the unmodified
 * DKE R26 Git-authored impact catalog, and two qualified actual DIS AOTs.
 * This is a bounded semantic impact STUDY, NOT a SAP authority oracle.
 */
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
const refuse=code=>{const e=new Error(code);e.code=code;throw e};
const need=(ok,code)=>{if(!ok)refuse(code)};
const ref=x=>x?.['@id'];
const original='dke-r25-tally-change',stable='dke-r24-projection';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=x=>[...x].sort();

/**
 * On failure, refuse the entire closure. A missing source dependency or
 * owner may never be silently reported as "unaffected".
 */
export function qualifyR27Impact({catalog,before,after,oldAot,newAot}){
 need(catalog?.schema==='dke.r26.registered-impact-catalog/1'&&
  catalog.normative===false&&catalog.sourceStatus==='PENDING_INDEPENDENT_REVIEW',
  'DKE_R27_UNTRUSTED_CATALOG');
 const qOld=qualifyDisV020Artifact(oldAot),qNew=qualifyDisV020Artifact(newAot);
 const pair=catalog.sourcePair,view=catalog.boundedView;
 need(pair?.repository==='kaicreator-mm/tally'&&
  pair.path==='docs/versions/v2.1.1/knowledge/generated/graph.jsonld'&&
  pair.before?.commit===before?.source?.commit&&
  pair.after?.commit===after?.source?.commit&&
  pair.before?.blob===before?.source?.gitBlob&&
  pair.after?.blob===after?.source?.gitBlob&&
  pair.before?.nodeCount===before?.source?.totalGraphNodes&&
  pair.after?.nodeCount===after?.source?.totalGraphNodes&&
  pair.before?.nodeCount===793&&pair.after?.nodeCount===807&&
  pair.before.blob!==pair.after.blob,
  'DKE_R27_SOURCE_VERSION_DRIFT');
 need(view?.repository==='kaicreator-mm/domain-harness'&&
  view.path==='examples/dis-v020-native-sdk/fixtures/dke-r25-tally-807.json'&&
  view.recordCount===14&&qNew.pins.get(original)?.origin.gitBlob===view.blob&&
  qOld.pins.get(original)?.origin.gitBlob!==view.blob&&
  qOld.pins.get(original)?.sha256!==qNew.pins.get(original)?.sha256,
  'DKE_R27_SOURCE_PIN_DRIFT');
 need(before.schema==='dke.r25.tally-09f-source-snapshot/1'&&
  after.schema===before.schema&&before.sourceQualification==='PENDING_INDEPENDENT_REVIEW'&&
  after.sourceQualification===before.sourceQualification&&
  before.records.length===0&&after.records.length===14&&
  same(before.selectedCqs,after.selectedCqs),
  'DKE_R27_SOURCE_DELTA_INVALID');
 need(oldAot.built.subjectDigest===newAot.built.subjectDigest&&
  same(oldAot.program,newAot.program)&&
  oldAot.digest!==newAot.digest,
  'DKE_R27_BUILD_SELECTION_DRIFT');
 const originalStable=qOld.pins.get(stable),newStable=qNew.pins.get(stable);
 need(originalStable&&newStable&&originalStable.sha256===newStable.sha256&&
  same(originalStable.origin,newStable.origin)&&
  qOld.sourceConsumers.get(stable)?.length===2&&
  same(qOld.sourceConsumers.get(stable),qNew.sourceConsumers.get(stable)),
  'DKE_R27_UNAFFECTED_SOURCE_UNPROVEN');
 const records=new Map();
 for(const node of after.records){
  need(node&&typeof node['@id']==='string'&&!records.has(node['@id']),
   'DKE_R27_DUPLICATE_SOURCE_RECORD');
  records.set(node['@id'],node);
 }
 const observed=new Set(),seenCQ=new Set(),seenSAP=new Set();
 const seenReaders=new Set(),seenPackages=new Set(),impacts=[];
 need(Array.isArray(catalog.registrations)&&catalog.registrations.length===2,
  'DKE_R27_CQ_REGISTRY_INCOMPLETE');
 for(const entry of catalog.registrations){
  const cqId=entry.cqId,caseId=after.selectedCqs[cqId];
  need(caseId&&caseId===entry.caseId&&!seenCQ.has(cqId),
   'DKE_R27_CQ_REGISTRY_INCOMPLETE');
  seenCQ.add(cqId);
  const sap=entry.sapCandidate;
  need(sap?.id&&typeof sap.id==='string'&&!seenSAP.has(sap.id)&&
   sap.qualified===false&&sap.sourceAuthority==='NONE'&&
   sap.oracle==='NOT_VERIFIED'&&sap.status==='PROPOSAL_ONLY',
   'DKE_R27_SAP_UNQUALIFIED');
  seenSAP.add(sap.id);
  const kase=records.get(caseId);
  need(kase?.['@type']==='se:Case'&&kase['se:lifecycle_status']==='PENDING_REVIEW'&&
   kase['se:synthetic']===false,'DKE_R27_CASE_SOURCE_INVALID');
  const refs=kase['se:evidence_refs'];
  need(Array.isArray(refs)&&refs.length>0,'DKE_R27_EVIDENCE_CLOSURE_MISSING');
  const refSeen=new Set(),sourceRefs=new Set();
  observed.add(caseId);
  for(const value of refs){
   const evid=ref(value);
   need(evid&&!refSeen.has(evid),'DKE_R27_EVIDENCE_CLOSURE_MISSING');
   refSeen.add(evid);
   const e=records.get(evid);
   need(e?.['@type']==='se:Evidence'&&e['se:lifecycle_status']==='PENDING_REVIEW',
    'DKE_R27_EVIDENCE_CLOSURE_MISSING');
   const locator=ref(e['se:source_locator_ref']),loc=records.get(locator);
   need(loc?.['@type']==='se:SourceLocator','DKE_R27_EVIDENCE_CLOSURE_MISSING');
   const sourceId=ref(loc['se:source_ref']),source=records.get(sourceId);
   need(source?.['@type']==='se:Source','DKE_R27_EVIDENCE_CLOSURE_MISSING');
   observed.add(evid);observed.add(locator);observed.add(sourceId);
   sourceRefs.add(sourceId);
  }
  need(Array.isArray(entry.readers)&&entry.readers.length===2,
   'DKE_R27_SELECTED_CONSUMERS_INCOMPLETE');
  const forCQ=new Set();
  for(const reader of entry.readers){
   const id=reader?.functionId,selected=qNew.functions.get(id),
    selectedBefore=qOld.functions.get(id);
   need(id&&!forCQ.has(id)&&selected&&selectedBefore&&
    reader.packageId===selected.element.packageId&&
    selected.element.packageId===selectedBefore.element.packageId&&
    selected.definition.kind==='knowledge'&&
    selected.definition.effect==='none'&&
    selected.definition.binding.type==='local'&&
    selected.definition.sourceDependencies?.includes(original)&&
    selected.element.packageId&&
    qNew.selected.get(reader.packageId)?.role==='business',
    'DKE_R27_SELECTED_CONSUMERS_INCOMPLETE');
   forCQ.add(id);seenReaders.add(id);seenPackages.add(reader.packageId);
  }
  impacts.push(Object.freeze({
   cqId,caseId,sapProposal:sap.id,changedSourceRefs:Object.freeze(sorted(sourceRefs)),
   affectedFunctions:Object.freeze(sorted(forCQ)),
   affectedPackages:Object.freeze(sorted(entry.readers.map(r=>r.packageId))),
   sourceStatus:'PENDING_INDEPENDENT_REVIEW',sapQualified:false,
   semanticAuthority:'NONE',effectAuthority:'NONE'
  }));
 }
 need(observed.size===14&&records.size===14,
  'DKE_R27_ORPHAN_OR_MISSING_SOURCE_RECORD');
 const consumers=qNew.sourceConsumers.get(original);
 need(consumers?.length===2&&same(sorted(seenReaders),sorted(consumers))&&
  same(consumers,qOld.sourceConsumers.get(original))&&
  seenPackages.size===2,'DKE_R27_SELECTED_CONSUMERS_INCOMPLETE');
 const unchanged=catalog.stableObservation;
 need(unchanged?.cqId==='CQ-T-CROSSCUT'&&
  unchanged.recordId==='se:REL-TVV-0020'&&
  unchanged.source===stable&&unchanged.sapId==='O-T-CROSSCUT'&&
  unchanged.qualified===false&&unchanged.oracle==='NOT_VERIFIED'&&
  same(sorted(unchanged.readers),sorted(qNew.sourceConsumers.get(stable))),
  'DKE_R27_STABLE_CQ_CLOSURE_INVALID');
 return Object.freeze({
  schema:'dis.r27.bounded-selected-impact/1',
  previousAotDigest:oldAot.digest,candidateAotDigest:newAot.digest,
  changedSourceIds:Object.freeze([original]),
  addedRecordIds:Object.freeze(sorted(observed)),
  impacts:Object.freeze(impacts),
  staleFunctions:Object.freeze(sorted(seenReaders)),
  affectedPackages:Object.freeze(sorted(seenPackages)),
  stableCqIds:Object.freeze([unchanged.cqId]),
  qualifiedSAPs:Object.freeze([]),registeredSelectedClosure:'BOUNDED_ONLY',
  globalAotReselectionRequired:true,
  activeProcessRevoked:false,independentOracle:'NOT_VERIFIED',
  authority:'NONE',effectsAllowed:false
 });
}
