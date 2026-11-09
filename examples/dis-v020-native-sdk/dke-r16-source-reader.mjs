/** DIS v0.2 R60 — source-authenticity receipt is evidence DATA, not truth
 * or a Domain semantic/Effect authority. Original DKE R16's four raw
 * publisher files were verified upstream, not re-read inside this reader.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
export const R16_RECEIPT_BLOB='942d3e06073b27eade5c40c918996bb55a5a0d03';
export const R16_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-forge',
 commit:'2e06e1047eb1eec146a808a49aefe2d555d0923e',
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r16-full-publisher/RUN_RECEIPT_R1.json',
 gitBlob:R16_RECEIPT_BLOB
});
const GIT_BLOBS=Object.freeze({
 CF_FAQ:'91443a1ba972ab4b172adf0cf2bda0d4594b9c29',
 CF_HOW:'15370b3c521db075a3b36c72b0461fa0a0239349',
 CF_CHANGE:'8124fd2d647578345d84664b1319b878e0760259',
 GH_WEBHOOK:'0e04c366d80375dd377a2200b98962693d47dfba'
});
const SUPPORT=Object.freeze({
 S01:'VENDOR_MODE_CLASSIFICATION_CONDITIONAL',
 S02:'PRODUCT_GUIDE_LITERAL',
 S09:'PUBLISHER_TEMPLATE_UNRENDERED_NEGATIVE',
 S10:'PRODUCT_GUIDE_LITERAL'
});
const UNQUALIFIED=Object.freeze(['S03','S04','S05','S06','S07','S08','S11']);
const ALL=Object.freeze(Array.from({length:11},(_,i)=>'S'+String(i+1).padStart(2,'0')));
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha256=/^[a-f0-9]{64}$/;
const sha=/^[a-f0-9]{40}$/;
// Explicit empty maps MUST NOT silently fall back to known source data.
export function qualifyR16Receipt(receipt,{sources,selection,metadata}={}){
 if(!object(receipt)||receipt.schema!=='dke-dis/r16-native-full-original-source/1'||
    receipt.status!=='PASS_FULL_BYTES_SCOPED_TEXT_NOT_SEMANTIC_QUALIFICATION'||
    receipt.fullFiles!==4||receipt.anchoredLines!==14||
    receipt.mutantsRejected!==25||receipt.queryIds!==11||
    receipt.SAPQualified!==0||receipt.Effects!==0||
    receipt.independentSemanticOracle!==false||
    receipt.sourceOwnerApproved!==false||
    receipt.rawFullPublisherDocsCommitted!==false||
    receipt.githubTemplateRendered!==false||
    receipt.runtime?.platform!=='Linux'||
    receipt.runtime?.python!=='3.13.5'||
    receipt.scriptSha256!=='17635fd0152f3175ad506d1c26606ef36dcc9ca14c82d311f44a58db22bc69c0')
  fail('DIS_R16_RECEIPT_UNQUALIFIED');
 const actualSources=sources===undefined?receipt.sources:sources;
 if(!object(actualSources)||!equals(Object.keys(actualSources).sort(),Object.keys(GIT_BLOBS).sort()))
  fail('DIS_R16_SOURCE_ROSTER_INVALID');
 let totalAnchors=0;
 for(const [id,blob] of Object.entries(GIT_BLOBS)){
  const src=actualSources[id];
  if(!object(src)||src.gitBlob!==blob||!sha.test(src.gitBlob)||
     !sha256.test(src.sha256)||!Number.isSafeInteger(src.bytes)||src.bytes<=0||
     !Number.isSafeInteger(src.anchors)||src.anchors<=0)
   fail('DIS_R16_SOURCE_DRIFT');
  totalAnchors+=src.anchors;
 }
 if(totalAnchors!==14)fail('DIS_R16_SOURCE_ANCHOR_DRIFT');
 // Even if a caller supplies an explicit empty/forged selection or metadata,
 // fail closed; never treat falsy input as omitted.
 const selected=selection===undefined?{
  observations:receipt.boundedDocumentObservations,
  insufficient:receipt.sourceScopeInsufficient
 }:selection;
 if(!object(selected)||!Array.isArray(selected.observations)||
    !Array.isArray(selected.insufficient)||selected.observations.length!==4||
    selected.insufficient.length!==7||
    !equals(selected.observations.map(x=>x?.id).sort(),Object.keys(SUPPORT).sort())||
    !selected.observations.every(x=>SUPPORT[x.id]===x.kind)||
    !equals([...selected.insufficient].sort(),[...UNQUALIFIED].sort()))
  fail('DIS_R16_QUERY_SOURCE_SCOPE_INVALID');
 const meta=metadata===undefined?{
  sourceOwnerApproved:receipt.sourceOwnerApproved,
  independentSemanticOracle:receipt.independentSemanticOracle,
  qualifiedSap:receipt.SAPQualified,effects:receipt.Effects,
  templateRendered:receipt.githubTemplateRendered
 }:metadata;
 if(!object(meta)||!equals(meta,{
  sourceOwnerApproved:false,independentSemanticOracle:false,
  qualifiedSap:0,effects:0,templateRendered:false
 }))fail('DIS_R16_FALSE_AUTHORITY');
 const muts=receipt.mutants;
 if(!Array.isArray(muts)||muts.length!==25||
    new Set(muts.map(x=>x?.id)).size!==25||
    muts.some(x=>typeof x?.id!=='string'||x.rejected!==true)||
    !['empty_files_explicit','empty_selection_explicit','empty_metadata_explicit']
      .every(id=>muts.some(x=>x.id===id&&x.rejected===true)))
  fail('DIS_R16_NEGATIVE_GATES_INVALID');
 return Object.freeze({
  verifiedOriginalPublisherFiles:4,originalLineAnchors:14,
  rejectedMutants:25,boundedObservations:4,insufficientQueries:7,
  sourceOwnerApproved:false,independentSemanticOracle:false,sapQualified:false
 });
}
export function makeR16SourceReader(receiptText){
 if(typeof receiptText!=='string'||sourceGitBlob(receiptText)!==R16_RECEIPT_BLOB)
  fail('DIS_R16_RECEIPT_GIT_BLOB_DRIFT');
 let receipt;
 try{receipt=JSON.parse(receiptText)}catch{fail('DIS_R16_RECEIPT_JSON_INVALID')}
 const summary=qualifyR16Receipt(receipt);
 return Object.freeze({
  summary,
  query(request){
   if(!object(request)||Object.keys(request).length!==1||
      typeof request.id!=='string'||!ALL.includes(request.id))
    fail('DIS_R16_QUERY_INVALID');
   const scopeClass=SUPPORT[request.id]??'SOURCE_SCOPE_INSUFFICIENT';
   const known=Object.hasOwn(SUPPORT,request.id);
   return Object.freeze({
    status:known?'OBSERVED':'UNKNOWN',queryId:request.id,scopeClass,
    sourceAuthenticity:'UPSTREAM_NATIVE_FULL_BYTES_RECEIPT_VERIFIED',
    originalPublisherFiles:4,anchorCount:14,rejectedMutants:25,
    receiptGitBlob:R16_RECEIPT_BLOB,semanticQualification:'NOT_REVIEWED',
    sourceOwnerApproved:false,independentSemanticOracle:false,
    sapQualified:false,templateRendered:false,effectDispatched:false,
    ...(known?{evidenceRefs:['dke:r16:source-authenticity:'+request.id]}:{})
   });
  }
 });
}
