/* R23: exact full Git Blob source-bound DKE EV16 Knowledge reader.
 * Read-only, same-assistant-authored logic, NOT qualified SAP or DIS native selected Function.
 * This module contains no upstream first-party graph copy or independent Semantic Critic.
 */
const PINS=Object.freeze({
 matrix:'8cab8ead10d90a440c85fec86b01fd408022ae2c',
 graph:'0f6007315fd7352fe6fd218effcfecf672cb4961',
 gate:'4afea8ce6333a25439f7ec17bf5c396ef3e1b59b'
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
 if(typeof text!=='string')ERR('R23_BYTES_REQUIRED');
 const raw=utf8Bytes(text);
 return sha1Bytes([...utf8Bytes('blob '+raw.length+'\0'),...raw]);
}
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function exactOriginal(text,pin,key){
 if(typeof text!=='string'||gitBlobUtf8Text(text)!==pin)ERR('R23_'+key+'_GIT_BLOB_MISMATCH');
 try{return JSON.parse(text)}catch{ERR('R23_'+key+'_JSON_INVALID')}
}
export function makeVerifiedEV16Reader(matrixText,graphText,gateText){
 // Raw content is authenticated INSIDE this reusable reader, not only an outer CLI.
 const m=exactOriginal(matrixText,PINS.matrix,'R8_MATRIX');
 const g=exactOriginal(graphText,PINS.graph,'TALLY_GRAPH');
 const rules=exactOriginal(gateText,PINS.gate,'SOURCE_GATE');
 if(m?.schema!=='dke.cross-domain-benchmark-selection/3'||m.version!=='R8'||m.evCrossDomain?.length!==18||
    m.evCrossDomain.reduce((n,x)=>n+x.domains.length,0)!==53||m.repairCasePlan?.length!==14)
  ERR('R23_R8_ROSTER_INVALID');
 const ev=m.evCrossDomain.find(x=>x.id==='EV16');
 if(!ev||!equal(ev.domains,['D04','D02'])||ev.executionStatus!=='NOT_RUN_R8_CROSS_DOMAIN')
  ERR('R23_EV16_SELECTION_INVALID');
 if(rules.schema!=='dke.r22.ev16-source-join-query/v1'||
    rules.refMatrix.gitBlob!==PINS.matrix||rules.sourceGraph.gitBlob!==PINS.graph||
    rules.refMatrix.selectedCells!==2||rules.qualification.fullEV16Qualified!==false||
    rules.qualification.blindSemanticCritic!=='NOT_RUN'||rules.rfc.rawFullBytesSha256!==null)
  ERR('R23_SOURCE_GATE_INVALID');
 const nodes=g?.['@graph'];
 if(!Array.isArray(nodes)||nodes.length!==807)ERR('R23_TALLY_GRAPH_ROSTER');
 const ids=nodes.map(n=>n?.['@id']);
 if(ids.includes(undefined)||new Set(ids).size!==807)ERR('R23_TALLY_GRAPH_DUPLICATE_ID');
 const typed=nodes.filter(x=>x?.['@type']==='se:RelationshipAssertion').length;
 const rfc=nodes.filter(x=>/rfc[\s_:./#-]*9111/i.test(JSON.stringify(x))).length;
 const cacheControl=nodes.filter(x=>/cache.control/i.test(JSON.stringify(x))).length;
 const caches=nodes.filter(x=>/\bcach(?:e|ing|ed)\b/i.test(JSON.stringify(x))).map(x=>x['@id']);
 if(typed!==271||rfc!==0||cacheControl!==0||caches.length!==2)
  ERR('R23_ORIGINAL_GRAPH_OBSERVATION_DRIFT');
 const allowedKeys=Object.keys(rules.defaultRequest).sort();
 const scope=Object.freeze({graphNodes:807,typedRelationships:271,directRFC9111Nodes:0,
   directCacheControlNodes:0,lexicalGenericCacheNodes:Object.freeze([...caches]),
   originalEV16Cells:2,originalR8Cells:53,sourceGraphGitBlob:PINS.graph,
   rfcSourceRawPinned:false,semanticIndependent:false,sapQualified:false,effectAuthorized:false});
 // No caller can supply graph/matrix, a fabricated trusted-hash callback, or internal arrays.
 return Object.freeze({
  summary:scope,
  query(req){
   if(!isRecord(req)||!equal(Object.keys(req).sort(),allowedKeys))
    ERR('R23_UNSELECTED_OR_EXTRA_REQUEST');
   const deny=status=>Object.freeze({status,authority:'NONE',sapQualified:false,effectAuthorized:false});
   if(req.targetEV!=='EV16')return deny('REJECTED_EV_SCOPE');
   if(req.sourceGraphCommit!==rules.sourceGraph.commit||req.sourceGraphBlob!==PINS.graph)
    return deny('REJECTED_GRAPH_SOURCE_PIN');
   if(req.assertsSourceBytePin)return deny('REJECTED_FALSE_RFC_PIN');
   if(req.assertsIndependentCritic||req.assertsSAP||req.assertsEffects)return deny('REJECTED_FALSE_AUTHORITY');
   if(req.assertsRepair)return deny('REJECTED_FALSE_PHYSICAL_OUTCOME');
   if(req.claimsNoStoreAlways)return deny('REJECTED_RFC_SCOPE_OVERCLAIM');
   if(req.usesLexicalOnly)return deny('REJECTED_LEXICAL_TRANSFER');
   if(req.declaresExplicitRFCJoin)return deny('REJECTED_UNSUPPORTED_EXPLICIT_RELATION');
   return Object.freeze({status:'UNKNOWN_NO_ASSERTED_RFC9111_RELATION',disposition:'UNKNOWN',authority:'NONE',
     evId:'EV16',domains:Object.freeze(['D04','D02']),...scope,
     lexicalGenericCacheNodes:Object.freeze([...caches]),
     sourceBytesVerified:true,procedureQualified:false,effectDispatched:false});
  }
 });
}
