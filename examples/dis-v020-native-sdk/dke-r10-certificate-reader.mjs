/** DIS 0.2 B10/R56: verify DKE R10 original full SAT countermodel
 * certificate as immutable DATA and expose a non-authoritative Knowledge read.
 * Exhaustive replay proves only conditional propositional consistency, never
 * independently approved source facts, SAP or an Effect authorization.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
export const R10_UPSTREAM_COMMIT='bbeceb44cdc9b38ac5d50e591f28ef914f828709';
export const R10_CERT_BLOB='c77442b32c3ca49df303db99d8678a6cbcc8ce89';
export const R10_INPUT_BLOB='426c7d165c19b7aa459de82d5d776962dba13fb0';
export const R10_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-forge',commit:R10_UPSTREAM_COMMIT,
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r10-replayable-cert/R10_01_CERTIFICATE.json',
 gitBlob:R10_CERT_BLOB
});
const deny=c=>{const e=new Error(c);e.code=c;throw e};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const keys=x=>Object.keys(x).sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const OUTCOME=Object.freeze({ENTAILED:'OBSERVED',REFUTED:'OBSERVED',UNDERDETERMINED:'UNKNOWN'});
export function verifyFullR10Certificate(input,certificate){
 if(input?.schema!=='dke.r8.r9.symbolic-formal-input/1'||
    certificate?.schema!=='dke.r8.r10.complete-sat-world-certificate/1'||
    certificate.sourceInputGitBlob!==R10_INPUT_BLOB||
    certificate.historicalR9ReceiptGitBlob!=='7387ca838e37d314e28a33e35ef21ba2f4358730')
  deny('DIS_R10_CERT_SOURCE_INVALID');
 if(certificate.qualification?.sourceInterpretationIndependent!==false||
    certificate.qualification?.reviewerIndependent!==false||
    certificate.qualification?.qualifiedSap!==0||
    certificate.qualification?.effects!==0||
    certificate.qualification?.nativeDisSdkInvoked!==false||
    input.qualification?.qualifiedSap!==false||
    input.qualification?.independentSemanticReviewer!==false)
  deny('DIS_R10_CERT_FALSE_AUTHORITY');
 if(!record(input.facts)||!Array.isArray(input.challenges)||
    !Array.isArray(input.exclusiveModes)||!Array.isArray(certificate.cases))
  deny('DIS_R10_CERT_SHAPE_INVALID');
 const symbols=[...new Set([...Object.keys(input.facts),
  ...input.challenges.map(c=>c.atom),...input.exclusiveModes.flat()])].sort();
 if(symbols.length!==11||!same(symbols,certificate.symbols)||
    input.challenges.length!==11||certificate.cases.length!==11)
  deny('DIS_R10_CERT_SYMBOLS_INVALID');
 const satisfies=w=>Object.entries(input.facts).every(([k,v])=>w[k]===v)&&
  input.exclusiveModes.every(([a,b])=>!(w[a]&&w[b]));
 const worlds=[];
 for(let bits=0;bits<2**symbols.length;bits++){
  const w=Object.fromEntries(symbols.map((s,i)=>[s,!!(bits&(1<<(symbols.length-i-1)))]));
  if(satisfies(w))worlds.push(w);
 }
 if(worlds.length!==64||certificate.satisfyingWorldCount!==64)
  deny('DIS_R10_CERT_MODELS_INVALID');
 const seen=new Set(),count={ENTAILED:0,REFUTED:0,UNDERDETERMINED:0};
 let pos=0,neg=0;
 for(let i=0;i<11;i++){
  const c=input.challenges[i],r=certificate.cases[i];
  if(!r||r.id!==c.id||seen.has(r.id)||r.atom!==c.atom||
     r.qualifiedSap!==false||r.effectAllowed!==false)deny('DIS_R10_CERT_CASE_INVALID');
  seen.add(r.id);
  const hasPos=worlds.some(w=>w[r.atom]),hasNeg=worlds.some(w=>!w[r.atom]);
  const verdict=hasPos&&hasNeg?'UNDERDETERMINED':hasPos?'ENTAILED':hasNeg?'REFUTED':'INCONSISTENT';
  if(verdict!==c.expected||r.verdict!==verdict||!Object.hasOwn(OUTCOME,verdict))
   deny('DIS_R10_CERT_VERDICT_INVALID');
  count[verdict]++;
  for(const [field,needed,polarity] of [['positiveWorld',hasPos,true],['negativeWorld',hasNeg,false]]){
   const witness=r[field];
   if(!needed){if(witness!==null)deny('DIS_R10_CERT_SPURIOUS_WITNESS');continue;}
   if(!record(witness)||!same(keys(witness),symbols)||
      Object.values(witness).some(v=>typeof v!=='boolean')||
      !satisfies(witness)||witness[r.atom]!==polarity)
    deny('DIS_R10_CERT_WITNESS_INVALID');
   if(polarity)pos++;else neg++;
  }
 }
 if(!same(count,{ENTAILED:2,REFUTED:2,UNDERDETERMINED:7})||pos!==9||neg!==9)
  deny('DIS_R10_CERT_COVERAGE_INVALID');
 return Object.freeze({
  result:'COMPLETE_REPLAYED_CONDITIONAL',
  variables:11,assignments:2048,satisfyingWorlds:64,
  witnesses:18,positiveWitnesses:9,negativeWitnesses:9,
  unknown:7,qualifiedSap:false,independentSemanticOracle:false
 });
}
export function makeR10KnowledgeReader(inputText,certificateText){
 if(typeof inputText!=='string'||sourceGitBlob(inputText)!==R10_INPUT_BLOB||
    typeof certificateText!=='string'||sourceGitBlob(certificateText)!==R10_CERT_BLOB)
  deny('DIS_R10_SOURCE_BLOB_DRIFT');
 let input,cert;
 try{input=JSON.parse(inputText);cert=JSON.parse(certificateText)}
 catch{deny('DIS_R10_SOURCE_FORMAT_INVALID')}
 const proof=verifyFullR10Certificate(input,cert);
 const selected=new Map(cert.cases.map(x=>[x.id,x]));
 return Object.freeze({
  summary:proof,
  query(request){
   if(!record(request)||Object.keys(request).length!==1||
      typeof request.id!=='string'||!selected.has(request.id))
    deny('DIS_R10_QUERY_UNSELECTED');
   const c=selected.get(request.id),status=OUTCOME[c.verdict];
   return Object.freeze({
    status,queryId:c.id,verdict:c.verdict,
    evidenceCompleteness:'COMPLETE_REPLAYED_CONDITIONAL',
    formalInputGitBlob:R10_INPUT_BLOB,certificateGitBlob:R10_CERT_BLOB,
    proofWitnesses:(c.positiveWorld?1:0)+(c.negativeWorld?1:0),
    logicalSupport:c.verdict==='ENTAILED',
    qualified:false,independentSemanticOracle:false,effectDispatched:false,
    ...(status==='UNKNOWN'?{}:{evidenceRefs:['dke:r10:conditional-certificate:'+c.id]})
   });
  }
 });
}
