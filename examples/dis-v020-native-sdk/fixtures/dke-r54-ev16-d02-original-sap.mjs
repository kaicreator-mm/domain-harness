// EV16:D02 original Source→Claim→child Element SAP/CQ runner.
// Bounded real source execution; ONLY an independent final R8 review can qualify the cell.
import {executeSelectedConsumer} from "./ev16-selected-consumer-r0.mjs";
const SOURCE_GRAPH="0f6007315fd7352fe6fd218effcfecf672cb4961";
const C1_GRAPH="c3015c4178467fdcf87e39dfe18fa6a9b317c6b4";
const SAP_R2="c4ea2cc7c165ae34871f7e4b70c1b1203ffd49a2";
const SAP_SOURCE_PINS={graph:SOURCE_GRAPH,scope:"d5747c057c92bc357cc68053e43d96b36427e02c",rfc9110:"19a88abcb4df0744df2d55c6d1af53125b6d9bd2",rfc9111:"cef95c761dfcbc6f649019efa2cf5f97dc5f9020"};
const SAP_COMPOSITION={mode:"BOUNDED_SOURCE_CQ_PREFLIGHT_ONLY",crossPublisherAuthority:"NOT_PUBLISHER_ENTAILED",parentOutcome:"UNKNOWN",ownerReviewDecision:"NOT_RUN",sapQualified:false,effectAuthorized:false,r8Qualified:false};
const ELEMENT={REQ:"dke:ev16.d02.se-requirements-child",VV:"dke:ev16.d02.se-verification-child",PARENT:"dke:ev16.d02.se-requirements-vv-child",D04:"dke:ev16.d04.http-cache-child",ROOT:"dke:ev16.root-composition"};
const BASIS={
 REQ:{claim:"se:CLM-REQ-FUNCTIONAL-DOC-METHODS",evidence:"se:EVD-REQ-FUNCTIONAL-REQ-METHODS",locator:"se:LOC-CS2023-SE-REQ-KU",scope:"dke:requirements"},
 VV:{claim:"se:CLM-TVV-0001",evidence:"se:EVD-TVV-0003",locator:"se:LOC-CS2023-SE-VALIDATION-KU",scope:"dke:verification"}
};
const ROWS=[
 ["REQ_POS","REQ","POS","CS2023_REQUIREMENTS_TEACHING","SCOPED_UNQUALIFIED_EDUCATIONAL_OBSERVATION"],
 ["REQ_NEG","REQ","NEG","REQUIREMENTS_UNIFORM_METHOD","UNKNOWN_UNSUPPORTED_TALLY_DECISIONMODEL"],
 ["REQ_UNKNOWN","REQ","UNKNOWN","REQUIREMENTS_UNIFORM_METHOD","UNKNOWN_UNSUPPORTED_TALLY_DECISIONMODEL"],
 ["VV_POS","VV","POS","CS2023_VV_TEACHING","SCOPED_UNQUALIFIED_EDUCATIONAL_OBSERVATION"],
 ["VV_NEG","VV","NEG","VV_AUTOMATIC_BUSINESS_ACCEPTANCE","UNKNOWN_NOT_ENTAILED_BY_CURRICULUM"],
 ["VV_UNKNOWN","VV","UNKNOWN","VV_AUTOMATIC_BUSINESS_ACCEPTANCE","UNKNOWN_NOT_ENTAILED_BY_CURRICULUM"],
 ["HTTP_404_NEG","D04","NEG","RFC404_PERMANENCE","REFUTED_CATEGORICAL_ASSERTION"],
 ["HTTP_410_NEG","D04","NEG","RFC410_PERMANENCE","REFUTED_CATEGORICAL_ASSERTION"],
 ["HTTP_REQUEST_NO_STORE_NEG","D04","NEG","REQUEST_NO_STORE_PRIVACY","REFUTED_CATEGORICAL_ASSERTION"],
 ["HTTP_RESPONSE_NO_STORE_NEG","D04","NEG","RESPONSE_NO_STORE_PRIVACY","REFUTED_CATEGORICAL_ASSERTION"],
 ["ROOT_HTTP_UNKNOWN","ROOT","UNKNOWN","HTTP_404_ENTAILS_VV_FAILURE","UNKNOWN_CROSS_PUBLISHER_ENTAILMENT"],
 ["ROOT_SSDF_UNKNOWN","ROOT","UNKNOWN","NIST_CS2023_PUBLISHER_MANDATE","UNKNOWN_ANALYST_DERIVED_RELATION"]
];
const block=why=>({schema:"dke.ev16.d02.original-child-sap/1",status:"BLOCK",why,executed:false,qualifiedSap:false,qualifiedR8:false,rows:[]});
function bytes(s){const r=[];for(let i=0;i<s.length;i++){let x=s.codePointAt(i);if(x>65535)i++;if(x<128)r.push(x);else if(x<2048)r.push(192|x>>>6,128|x&63);else if(x<65536)r.push(224|x>>>12,128|(x>>>6)&63,128|x&63);else r.push(240|x>>>18,128|(x>>>12)&63,128|(x>>>6)&63,128|x&63)}return r}
function sapSha(s){
 const body=bytes(s),p=bytes("blob "+body.length+"\0"),n=body.length+p.length,N=Math.ceil((n+9)/64)*64,u=new Uint8Array(N);
 u.set(p);u.set(body,p.length);u[n]=128;const bits=n*8;for(let i=0;i<8;i++)u[N-1-i]=Math.floor(bits/2**(8*i))&255;
 let h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
 const rot=(v,k)=>v<<k|v>>>(32-k),w=new Int32Array(80);
 for(let off=0;off<N;off+=64){
  for(let i=0;i<16;i++)w[i]=(u[off+i*4]<<24)|(u[off+i*4+1]<<16)|(u[off+i*4+2]<<8)|u[off+i*4+3];
  for(let i=16;i<80;i++)w[i]=rot(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
  let a=h0,b=h1,c=h2,d=h3,e=h4;
  for(let i=0;i<80;i++){
   let f,k;if(i<20){f=b&c|~b&d;k=0x5a827999}
   else if(i<40){f=b^c^d;k=0x6ed9eba1}
   else if(i<60){f=b&c|b&d|c&d;k=0x8f1bbcdc}
   else{f=b^c^d;k=0xca62c1d6}
   const t=(rot(a,5)+f+e+k+w[i])|0;e=d;d=c;c=rot(b,30);b=a;a=t;
  }
  h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;
 }
 return [h0,h1,h2,h3,h4].map(v=>(v>>>0).toString(16).padStart(8,"0")).join("");
}
const rid=x=>x?.["@id"];
function executeOriginalChildSap(input){
 try{
  if(!input||Object.getPrototypeOf(input)!==Object.prototype)return block("NONPLAIN_INPUT");
  const names=Reflect.ownKeys(input);
  if(names.some(k=>typeof k!=="string")||
     names.slice().sort().join(",")!=="c1GraphRaw,graphRaw,rfc9110,rfc9111,sapScopeRaw,scopeRaw")return block("INPUT_SHAPE");
  const desc=Object.getOwnPropertyDescriptors(input),r={};
  for(const key of names){if(!Object.hasOwn(desc[key],"value")||typeof desc[key].value!=="string")return block("ACCESSOR_OR_TYPE");r[key]=desc[key].value}
  if(sapSha(r.graphRaw)!==SOURCE_GRAPH||sapSha(r.c1GraphRaw)!==C1_GRAPH||sapSha(r.sapScopeRaw)!==SAP_R2)
   return block("SOURCE_OR_SAP_EXACT_BLOB_DRIFT");
  const graph=JSON.parse(r.graphRaw),newGraph=JSON.parse(r.c1GraphRaw),sap=JSON.parse(r.sapScopeRaw);
  if(graph["@graph"]?.length!==807||newGraph["@graph"]?.length!==809||sap.qualification?.elementApproved!==false)return block("WRONG_GRAPH_OR_SAP_SCOPE");
  const orig=new Map(graph["@graph"].map(x=>[x["@id"],x])),latest=new Map(newGraph["@graph"].map(x=>[x["@id"],x]));
  for(const key of ["REQ","VV"]){
   const x=BASIS[key],claim=orig.get(x.claim),e=orig.get(x.evidence),loc=orig.get(x.locator);
   if(!claim||!e||!loc||claim["se:review_status"]!=="PENDING"||
      claim["se:lifecycle_status"]!=="PENDING_REVIEW"||
      rid(claim["se:SUPPORTED_BY"])!==x.evidence||
      rid(e["se:source_locator_ref"])!==x.locator||
      rid(loc["se:source_ref"])!=="se:SRC-CS2023"||
      !sap.scopes.some(y=>y.id===x.scope&&y.claims?.includes(x.claim)))
    return block("ORIGINAL_CLAIM_EVIDENCE_SCOPE_"+key);
  }
  const requests=ROWS.map(x=>({queryId:x[3],mode:"READ_ONLY_KNOWLEDGE",requestedEffects:false}));
  const originalBundle={graphRaw:r.graphRaw,graph,scopeRaw:r.scopeRaw,scope:JSON.parse(r.scopeRaw),
   rfc9110:r.rfc9110,rfc9111:r.rfc9111,pins:{...SAP_SOURCE_PINS},composition:{...SAP_COMPOSITION}};
  const response=executeSelectedConsumer(originalBundle,requests);
  if(response.status!=="READ_ONLY_SELECTED_CONSUMPTION_NOT_QUALIFIED"||
     response.sourceCheck!=="ORIGINAL_FOUR_GIT_BLOBS_MATCH_4_OF_4"||
     response.responses?.length!==ROWS.length||response.qualifiedR8Cells!==0||
     response.sapQualified!==false||response.root?.qualified!==false)
   return block("ORIGINAL_FOUR_SOURCE_PRECONDITION");
  // A NEG result must include an active adversarial falsifier. Observing
  // UNKNOWN twice is not a distinct negative proof, so never treat those
  // two rows as fully exercised without source-forgery rejection evidence.
  function adversarialNegative(area){
   const forged=JSON.parse(r.graphRaw),nodes=forged["@graph"];
   if(area==="REQ"){
    const dm=nodes.find(x=>x["@id"]==="se:DM-REQ-FUNCTIONAL-DOC-METHOD");
    if(!dm||!Array.isArray(dm["se:constraints"]))return false;
    dm["se:constraints"]=["All projects MUST adopt the same one format, purported publisher mandate"];
   }else{
    const vv=nodes.find(x=>x["@id"]===BASIS.VV.claim);
    if(!vv||vv["se:lifecycle_status"]!=="PENDING_REVIEW")return false;
    vv["se:lifecycle_status"]="ACCEPTED";
   }
   const queryId=area==="REQ"?"REQUIREMENTS_UNIFORM_METHOD":"VV_AUTOMATIC_BUSINESS_ACCEPTANCE";
   const outcome=executeSelectedConsumer({...originalBundle,graph:forged},[
    {queryId,mode:"READ_ONLY_KNOWLEDGE",requestedEffects:false}
   ]);
   return outcome.status==="BLOCK";
  }
  const negativeFalsifiers={REQ:adversarialNegative("REQ"),VV:adversarialNegative("VV")};
  const rows=ROWS.map((spec,i)=>{
   const [id,area,kind,queryId,expected]=spec,value=response.responses[i],match=value?.status===expected&&
    value?.requestedId===queryId&&value?.ownerElement===ELEMENT[area]&&
    value?.qualifiedSap===false&&value?.qualifiedR8===false;
   const forgedNegative=kind==="NEG"&&(area==="REQ"||area==="VV")
    ?negativeFalsifiers[area]:null;
   const pass=!!match&&(forgedNegative===null||forgedNegative===true);
   return {id,area,kind,queryId,element:ELEMENT[area],outcome:value?.status,
    negativeControl:forgedNegative===null?"NOT_APPLICABLE":forgedNegative?
     "FORGED_ORIGINAL_SOURCE_PROJECTION_BLOCKED":"FAILED",pass};
  });
  const modified=[...orig.keys()].filter(id=>latest.has(id)&&JSON.stringify(orig.get(id))!==JSON.stringify(latest.get(id)));
  const required=["se:CASE-09F-GH-DB-FAILOVER","se:DM-REQ-FUNCTIONAL-DOC-METHOD","se:PAT-REQ-USER-STORY-SPECIFICATION"];
  const c1Known=JSON.stringify(modified.slice().sort())===JSON.stringify(required.slice().sort())&&
   ["REQ","VV"].every(key=>JSON.stringify(orig.get(BASIS[key].claim))===JSON.stringify(latest.get(BASIS[key].claim)));
  rows.push({id:"REQ_STALE_C1",area:"REQ",kind:"STALE",element:ELEMENT.REQ,
   outcome:c1Known?"STALE_ONLY_IF_C1_ADOPTED":"FAIL",pass:c1Known});
  rows.push({id:"VV_C1_DIRECT_UNCHANGED",area:"VV",kind:"STALE",element:ELEMENT.VV,
   outcome:c1Known?"DIRECT_CLAIM_UNCHANGED_PARENT_REVIEW":"FAIL",pass:c1Known});
  const parent=response.d02?.elementId===ELEMENT.PARENT&&
   response.d02?.childElementIds?.includes(ELEMENT.REQ)&&response.d02?.childElementIds?.includes(ELEMENT.VV)&&
   response.d02?.outcome==="UNKNOWN"&&response.d02?.qualified===false&&
   response.root?.outcome==="UNKNOWN"&&response.root?.qualified===false;
  rows.push({id:"D02_PARENT_UNKNOWN",area:"PARENT",kind:"UNKNOWN",element:ELEMENT.PARENT,
   outcome:parent?"PARENT_NOT_AUTOMATICALLY_QUALIFIED":"FAIL",pass:!!parent});
  const rel=orig.get("se:REL-TVV-0020");
  const global=rel?.["se:lifecycle_status"]==="PENDING_REVIEW"&&rid(rel["se:predicate"])==="se:CROSS_CUTS";
  rows.push({id:"GLOBAL_NOT_NORMATIVE",area:"GLOBAL",kind:"UNKNOWN",element:ELEMENT.ROOT,
   outcome:global?"CROSS_CUTS_PENDING_NOT_PUBLISHER_MANDATE":"FAIL",pass:!!global});
  const passed=rows.filter(x=>x.pass).length;
  return {schema:"dke.ev16.d02.original-child-sap/1",
   status:passed===rows.length?"BOUNDED_ORIGINAL_SAP_OBSERVATIONS_EXECUTED_REVIEW_PENDING":"FAIL",
   frozenGraphGitBlob:SOURCE_GRAPH,c1ComparisonGitBlob:C1_GRAPH,sapCandidateGitBlob:SAP_R2,
   scopeMap:{[ELEMENT.REQ]:BASIS.REQ.scope,[ELEMENT.VV]:BASIS.VV.scope},
   records:rows,total:rows.length,passed,failed:rows.length-passed,
   sourceChangedIds:modified,c1Impact:{REQ:"STALE_ON_ADOPTION",VV:"DIRECT_CLAIM_UNCHANGED",PARENT:"REVIEW_REQUIRED"},
   qualifiedSap:false,qualifiedR8:false,originalR8:"NOT_RUN",
   parentOutcome:"UNKNOWN",rootOutcome:"UNKNOWN",globalOutcome:"UNKNOWN",
   independentFinalReview:"NOT_RUN",effectAuthorized:false,
   limitation:"Original Git source-backed SAP observations only; no formal independent original R8 or publisher/Source Owner qualification"};
 }catch(e){return block("FAILED_CLOSED_"+String(e?.message||e).slice(0,70))}
}
export {executeOriginalChildSap};
