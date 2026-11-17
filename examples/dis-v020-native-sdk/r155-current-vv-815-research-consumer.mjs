/* R155: current-source 815-node two-leg VV research consumer reader.
 * Isolated and separately versioned on purpose (R156 addendum): the frozen
 * 807-node R23 reader keeps its own scope; this module pins the *current*
 * Tally v2.1.2 candidate graph and the Forge selected two-leg repin and
 * rejects anything else. Read-only research currentness only — never
 * qualified SAP, Oracle, R8 cell, Host, Effect, or Release evidence.
 * This module contains no upstream first-party graph copy and no runtime
 * network access; callers materialize permitted org-owned bytes from pinned
 * upstream Git and this reader authenticates them by exact Git Blob identity.
 */
const PINS=Object.freeze({
 graph:'a49ddf58a0c4a5b25ebdd4018c8234f64e6365e0',
 forgeSelected:'63d671aa270df0eff649cd34a5f6258f4c9cbc21',
 tallyHead:'580b3ace16b4c28dbb1ff1b0a018d66896a3418d',
 forgeHead:'4e7b34075a00426fb9207f33de8115e1e670a934',
 // Distinct historical frozen scope; explicitly NOT consumed by this reader.
 frozen807Graph:'0f6007315fd7352fe6fd218effcfecf672cb4961'
});
const BINDING=Object.freeze({
 id:'se:SCB-CS2023-VV-R1',selectedCq:'CS2023_VV_TEACHING',
 ownerElement:'dke:ev16.d02.se-verification-child',sapRef:'dke:sap.cs2023.vv-distinction',
 claim:'se:CLM-TVV-0001',claimDigest:'090f49a4d44bb0fb7a23408e3ca57b4dfc27a80a4a1fa94c8f87680c2f7afb97',
 sectionEvidence:'se:EVD-TVV-0003',sectionLocator:'se:LOC-CS2023-SE-VALIDATION-KU',
 sectionLocatorDigest:'9878731436bd96e09ad1d4cf3a7529952d5a3f4660963c016b18d6d751f43947',
 sectionPrintedPage:246,sectionPdfZeroBasedPage:245,
 supportRelation:'se:REL-TVV-0024',outcomeEvidence:'se:EVD-TVV-0016',
 outcomeLocator:'se:LOC-CS2023-SE-VALIDATION-LO2',
 outcomeLocatorDigest:'1b75df53c55436f51a406e957291f778b8a7eea42760b4115dd14901a1cbab56',
 outcomePrintedPage:248,outcomePdfZeroBasedPage:247,
 siblingCrossCut:'se:REL-TVV-0020'
});
const ERR=code=>{const e=new Error(code);e.code=code;throw e};
function utf8Bytes(s){
 const a=[];
 for(let i=0;i<s.length;i++){
  const p=s.codePointAt(i);
  if(p>65535)i++;
  if(p<128)a.push(p);
  else if(p<2048)a.push(192|(p>>6),128|(p&63));
  else if(p<65536)a.push(224|(p>>12),128|((p>>6)&63),128|(p&63));
  else a.push(240|(p>>18),128|((p>>12)&63),128|((p>>6)&63),128|(p&63));
 }
 return a;
}
const rot=(a,n)=>(a<<n)|(a>>>(32-n));
function sha1Bytes(raw){
 const bytes=raw.slice(),n=bytes.length,high=Math.floor(n*8/0x100000000),low=(n*8)>>>0;
 bytes.push(128);
 while(bytes.length%64!==56)bytes.push(0);
 for(let s of [high,low])for(let shift of [24,16,8,0])bytes.push((s>>>shift)&255);
 let h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;
 for(let off=0;off<bytes.length;off+=64){
  const w=new Array(80);
  for(let i=0;i<16;i++){const p=off+i*4;w[i]=((bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3])>>>0}
  for(let i=16;i<80;i++)w[i]=rot(w[i-3]^w[i-8]^w[i-14]^w[i-16],1)>>>0;
  let a=h0,b=h1,c=h2,d=h3,e=h4;
  for(let i=0;i<80;i++){
   let f,k;
   if(i<20){f=(b&c)|(~b&d);k=0x5A827999}
   else if(i<40){f=b^c^d;k=0x6ED9EBA1}
   else if(i<60){f=(b&c)|(b&d)|(c&d);k=0x8F1BBCDC}
   else{f=b^c^d;k=0xCA62C1D6}
   const t=(rot(a,5)+f+e+k+w[i])>>>0;
   e=d;d=c;c=rot(b,30)>>>0;b=a;a=t;
  }
  h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;
 }
 return [h0,h1,h2,h3,h4].map(x=>x.toString(16).padStart(8,'0')).join('');
}
export function gitBlobUtf8Text(text){
 if(typeof text!=='string')ERR('R155_BYTES_REQUIRED');
 const raw=utf8Bytes(text);
 return sha1Bytes([...utf8Bytes('blob '+raw.length+'\0'),...raw]);
}
const isPlainRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
 &&Object.getPrototypeOf(x)===Object.prototype;
const refId=x=>isPlainRecord(x)&&typeof x['@id']==='string'&&Object.keys(x).length===1?x['@id']:null;
export function validateCurrentGraphStructure(g){
 if(!isPlainRecord(g)||!Array.isArray(g['@graph']))ERR('R155_GRAPH_SHAPE_INVALID');
 const nodes=g['@graph'];
 if(nodes.length!==815)ERR('R155_CURRENT_GRAPH_ROSTER_815');
 const ids=nodes.map(n=>isPlainRecord(n)?n['@id']:undefined);
 if(ids.some(id=>typeof id!=='string'))ERR('R155_GRAPH_ID_INVALID');
 if(new Set(ids).size!==815)ERR('R155_GRAPH_DUPLICATE_ID');
 const byId=new Map(nodes.map(n=>[n['@id'],n]));
 const typed=t=>nodes.filter(n=>n['@type']===t);
 if(typed('se:RelationshipAssertion').length!==272||
    typed('se:KnowledgeClaim').length!==106||
    typed('se:Evidence').length!==144)ERR('R155_GRAPH_ROSTER_DRIFT');
 const claims=typed('se:KnowledgeClaim');
 if(claims.some(c=>c['se:review_status']!=='PENDING'||
    c['se:record_version']!=='0.1.0'))ERR('R155_CLAIM_REVIEW_DECISION_OBSERVED');
 const claim=byId.get(BINDING.claim);
 if(claim?.['@type']!=='se:KnowledgeClaim')ERR('R155_CLAIM_RECORD_INVALID');
 // p246 SECTION leg: the original claim keeps exactly one direct SUPPORTED_BY
 // edge to the section evidence; any added/moved direct support is forged.
 if(JSON.stringify(claim['se:SUPPORTED_BY'])!==JSON.stringify({'@id':BINDING.sectionEvidence})||
    JSON.stringify(claim['se:evidence_refs'])!==JSON.stringify({'@id':BINDING.sectionEvidence}))
  ERR('R155_CLAIM_DIRECT_SUPPORT_FORGED');
 if(claim['se:lifecycle_status']!=='PENDING_REVIEW')ERR('R155_CLAIM_LIFECYCLE_DRIFT');
 const sectionEvidence=byId.get(BINDING.sectionEvidence);
 if(sectionEvidence?.['@type']!=='se:Evidence'||
    refId(sectionEvidence['se:source_locator_ref'])!==BINDING.sectionLocator)
  ERR('R155_SECTION_EVIDENCE_INVALID');
 // Separate p248 PAGE leg: PENDING_REVIEW assertion, synthetic:false.
 const support=byId.get(BINDING.supportRelation);
 if(support?.['@type']!=='se:RelationshipAssertion')ERR('R155_OUTCOME_SUPPORT_INVALID');
 if(refId(support['se:predicate'])!=='se:SUPPORTED_BY'||
    refId(support['se:subject_ref'])!==BINDING.claim||
    refId(support['se:object_ref'])!==BINDING.outcomeEvidence||
    JSON.stringify(support['se:evidence_refs'])!==JSON.stringify({'@id':BINDING.outcomeEvidence}))
  ERR('R155_OUTCOME_SUPPORT_EDGE_DRIFT');
 if(support['se:lifecycle_status']!=='PENDING_REVIEW')ERR('R155_OUTCOME_SUPPORT_NOT_PENDING');
 if(support['se:synthetic']!==false)ERR('R155_OUTCOME_SUPPORT_SYNTHETIC');
 const outcomeEvidence=byId.get(BINDING.outcomeEvidence);
 if(outcomeEvidence?.['@type']!=='se:Evidence'||
    refId(outcomeEvidence['se:source_locator_ref'])!==BINDING.outcomeLocator||
    outcomeEvidence['se:extraction_status']!=='EXTRACTED_PENDING_REVIEW'||
    outcomeEvidence['se:synthetic']!==false)ERR('R155_OUTCOME_EVIDENCE_INVALID');
 const sectionLocator=byId.get(BINDING.sectionLocator);
 const outcomeLocator=byId.get(BINDING.outcomeLocator);
 if(sectionLocator?.['@type']!=='se:SourceLocator'||
    sectionLocator['se:record_version']!=='0.1.1'||
    outcomeLocator?.['@type']!=='se:SourceLocator'||
    outcomeLocator['se:record_version']!=='0.1.0')ERR('R155_LOCATOR_RECORDS_INVALID');
 // Exactly one selected binding and its scope stays candidate research only.
 const bindings=typed('se:SelectedCqSourceBinding');
 if(bindings.length!==1||bindings[0]['@id']!==BINDING.id)ERR('R155_BINDING_ROSTER_INVALID');
 const scb=bindings[0];
 if(scb['se:binding_scope']!=='SELECTED_CQ_RESEARCH_CANDIDATE_ONLY_NOT_FROZEN_R8_CELL'||
    scb['se:professional_oracle_status']!=='NOT_ATTESTED'||
    scb['se:publication_permission']!=='NOT_GRANTED_BY_THIS_OWNER_DECISION'||
    scb['se:claim_lifecycle_effect']!=='NONE_ORIGINAL_AND_CANDIDATE_CLAIM_REMAIN_PENDING'||
    scb['se:lifecycle_status']!=='ACTIVE'||
    scb['se:positive_cq']!==BINDING.selectedCq||
    scb['se:candidate_element_attribution']!==BINDING.ownerElement||
    scb['se:outcome_anchor_type']!=='PAGE'||scb['se:section_anchor_type']!=='SECTION'||
    scb['se:section_printed_page']!=='246'||scb['se:section_pdf_zero_based_page']!=='245'||
    scb['se:outcome_printed_page']!=='248'||scb['se:outcome_pdf_zero_based_page']!=='247')
  ERR('R155_BINDING_SCOPE_INVALID');
 if(scb['se:claim_digest_sha256']!==BINDING.claimDigest||
    scb['se:section_locator_digest_sha256']!==BINDING.sectionLocatorDigest||
    scb['se:outcome_locator_digest_sha256']!==BINDING.outcomeLocatorDigest)
  ERR('R155_BINDING_DIGEST_DRIFT');
 const chain=new Set([BINDING.id,BINDING.claim,BINDING.sectionEvidence,
  BINDING.supportRelation,BINDING.outcomeEvidence,BINDING.sectionLocator,BINDING.outcomeLocator]);
 // Non-normative sibling: present, CROSS_CUTS, pending, and outside the chain.
 const sibling=byId.get(BINDING.siblingCrossCut);
 if(sibling?.['@type']!=='se:RelationshipAssertion'||
    refId(sibling['se:predicate'])!=='se:CROSS_CUTS'||
    sibling['se:lifecycle_status']!=='PENDING_REVIEW')ERR('R155_SIBLING_CROSS_CUT_DRIFT');
 const chainText=JSON.stringify(scb);
 if(chainText.includes(BINDING.siblingCrossCut)||
    [...chain].some(id=>id!==BINDING.id&&JSON.stringify(byId.get(id)).includes(BINDING.siblingCrossCut)))
  ERR('R155_SIBLING_POISONED_BINDING_CHAIN');
 return {nodes:815,claims:106,claimsPending:106,relationshipAssertions:272,
  evidence:144,selectedBindings:1,reviewDecisions:0};
}
export function validateForgeSelectedStructure(f){
 if(!isPlainRecord(f))ERR('R155_FORGE_SHAPE_INVALID');
 if(f.schema!=='dke.ev16.d02.vv-selected-cq.two-leg-source-repin/1')ERR('R155_FORGE_SCHEMA_INVALID');
 if(f.state!=='PREPARED_UNQUALIFIED'||
    f.evidenceTier!=='PUBLIC_SOURCE_BACKED_CANDIDATE_NOT_PROFESSIONAL_ORACLE')
  ERR('R155_FORGE_STATE_NOT_UNQUALIFIED');
 const p=f.producer;
 if(!isPlainRecord(p)||p.repo!=='kaicreator-mm/tally'||p.pr!==399||
    p.exactHead!==PINS.tallyHead||p.candidateGraphGitBlob!==PINS.graph||
    p.candidateNodes!==815||p.reviewDecisions!==0||
    p.frozenGraphGitBlob!==PINS.frozen807Graph)ERR('R155_FORGE_PRODUCER_INVALID');
 const scope=f.repinScope;
 if(!isPlainRecord(scope)||scope.selectedCq!==BINDING.selectedCq||
    scope.bindingId!==BINDING.id||
    scope.bindingScope!=='SELECTED_CQ_RESEARCH_CANDIDATE_ONLY_NOT_FROZEN_R8_CELL')
  ERR('R155_FORGE_REPIN_SCOPE_INVALID');
 const vv=f.vvObligationRef;
 if(!isPlainRecord(vv)||vv.ownerElement!==BINDING.ownerElement||
    vv.sap!==BINDING.sapRef)ERR('R155_FORGE_OBLIGATION_INVALID');
 const b=f.selectedCqSourceBinding;
 if(!isPlainRecord(b))ERR('R155_FORGE_BINDING_SECTION_INVALID');
 if(b.claim?.id!==BINDING.claim||b.claim?.canonicalSha256!==BINDING.claimDigest||
    b.claim?.reviewStatus!=='PENDING')ERR('R155_FORGE_CLAIM_LEG_INVALID');
 if(b.sectionLeg?.anchorType!=='SECTION'||b.sectionLeg?.evidence?.id!==BINDING.sectionEvidence||
    b.sectionLeg?.locator?.id!==BINDING.sectionLocator||
    b.sectionLeg?.locator?.canonicalSha256!==BINDING.sectionLocatorDigest||
    b.sectionLeg?.locator?.printedPage!==246)ERR('R155_FORGE_SECTION_LEG_INVALID');
 if(b.outcomeLeg?.anchorType!=='PAGE'||b.outcomeLeg?.evidence?.id!==BINDING.outcomeEvidence||
    b.outcomeLeg?.locator?.id!==BINDING.outcomeLocator||
    b.outcomeLeg?.locator?.canonicalSha256!==BINDING.outcomeLocatorDigest||
    b.outcomeLeg?.locator?.printedPage!==248)ERR('R155_FORGE_OUTCOME_LEG_INVALID');
 return {forgeState:f.state,producerTallyHead:PINS.tallyHead};
}
export function makeCurrentVv815Reader(graphText,forgeText){
 // Raw bytes are authenticated INSIDE this reader before any structure is read.
 if(typeof graphText!=='string'||gitBlobUtf8Text(graphText)!==PINS.graph)
  ERR('R155_CURRENT_GRAPH_GIT_BLOB_MISMATCH');
 if(typeof forgeText!=='string'||gitBlobUtf8Text(forgeText)!==PINS.forgeSelected)
  ERR('R155_FORGE_SELECTED_GIT_BLOB_MISMATCH');
 let g,f;
 try{g=JSON.parse(graphText)}catch{ERR('R155_CURRENT_GRAPH_JSON_INVALID')}
 try{f=JSON.parse(forgeText)}catch{ERR('R155_FORGE_SELECTED_JSON_INVALID')}
 const roster=validateCurrentGraphStructure(g);
 validateForgeSelectedStructure(f);
 const value=Object.freeze({
  status:'UNKNOWN',subject:BINDING.id,selectedCq:BINDING.selectedCq,
  ownerElementId:BINDING.ownerElement,bindingId:BINDING.id,sapRef:BINDING.sapRef,
  sourceGraphGitBlob:PINS.graph,forgeSelectedGitBlob:PINS.forgeSelected,
  producerTallyHead:PINS.tallyHead,producerForgeHead:PINS.forgeHead,
  currentness:'OBSERVED_RESEARCH_ONLY',
  bindingScope:'SELECTED_CQ_RESEARCH_CANDIDATE_ONLY_NOT_FROZEN_R8_CELL',
  professionalOracleStatus:'NOT_ATTESTED',
  publicationPermission:'NOT_GRANTED_BY_THIS_OWNER_DECISION',
  claimReviewStatus:'PENDING',outcomeSupportStatus:'PENDING_REVIEW',
  sectionAnchorType:'SECTION',sectionEvidenceId:BINDING.sectionEvidence,
  sectionLocatorId:BINDING.sectionLocator,sectionPrintedPage:246,
  sectionPdfZeroBasedPage:245,
  outcomeAnchorType:'PAGE',outcomeSupportRelationId:BINDING.supportRelation,
  outcomeEvidenceId:BINDING.outcomeEvidence,outcomeLocatorId:BINDING.outcomeLocator,
  outcomePrintedPage:248,outcomePdfZeroBasedPage:247,
  siblingCrossCutObserved:'NON_NORMATIVE_PENDING_REVIEW_OUTSIDE_BINDING_CHAIN',
  sourceBytesVerified:true,claimQualified:false,qualifiedSap:false,
  parentQualified:false,rootQualified:false,oracleAttested:false,
  effectDispatched:false
 });
 const summary=Object.freeze({
  currentnessVerified:true,graphNodes:815,frozen807GraphDistinct:PINS.frozen807Graph,
  staleGraphPolicy:'ANY_NON_815_ROSTER_OR_BLOB_REJECTED',
  producerTallyHead:PINS.tallyHead,producerForgeHead:PINS.forgeHead,
  graphGitBlob:PINS.graph,forgeSelectedGitBlob:PINS.forgeSelected,
  selectedBinding:BINDING.id,reviewDecisions:0,
  claimPending:106,relationshipAssertions:272,evidenceRecords:144,
  siblingCrossCut:BINDING.siblingCrossCut,
  authority:'NONE',sapQualified:false,oracleAttested:false,effectAuthorized:false
 });
 // No caller can supply graph/forge bytes, a trusted-hash callback, or
 // internal records; the request is exactly one own string-keyed property.
 return Object.freeze({
  summary,pins:PINS,binding:BINDING,value,
  validateCurrentGraphStructure:()=>validateCurrentGraphStructure(g),
  validateForgeSelectedStructure:()=>validateForgeSelectedStructure(f),
  query(req){
   // Snapshot the ONE declared own data property exactly once. A getter,
   // Proxy trap, inherited key, symbol or injected authority field can
   // neither select a different binding nor mint qualification; raw trap
   // errors and hostile values all collapse to one fail-closed code.
   let subject;
   try{
    if(!isPlainRecord(req))ERR('R155_BINDING_REQUEST_INVALID');
    const keys=Reflect.ownKeys(req);
    if(keys.length!==1||keys[0]!=='subject')ERR('R155_BINDING_REQUEST_INVALID');
    const own=Object.getOwnPropertyDescriptor(req,'subject');
    if(!own||!Object.hasOwn(own,'value')||typeof own.value!=='string'||
       own.value!==BINDING.id)ERR('R155_BINDING_REQUEST_INVALID');
    subject=own.value;
   }catch{ERR('R155_BINDING_REQUEST_INVALID')}
   if(this.validateCurrentGraphStructure().reviewDecisions!==0||
      g['@graph'].length!==815)ERR('R155_CURRENT_SOURCE_PRECONDITION');
   return value;
  }
 });
}
