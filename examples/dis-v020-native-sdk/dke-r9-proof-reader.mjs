/** DKE R9 same-model conditional symbolic PROOF, imported as immutable
 * provenance DATA and consumed via actual DIS native Knowledge Function.
 * The SAT engine is external; results are conditional on same-model facts,
 * not independent semantic truth or a permit to execute an Effect.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';

export const R9_UPSTREAM_COMMIT='7aa5cf4afa625c19e9d9a59667d85b67d5bc1401';
export const R9_ROOT='docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r9-symbolic-source-scope/';
export const R9_INPUT_BLOB='426c7d165c19b7aa459de82d5d776962dba13fb0';
export const R9_PROOF_BLOB='7387ca838e37d314e28a33e35ef21ba2f4358730';
export const R9_DATA_ORIGINS=Object.freeze({
 input:Object.freeze({repository:'kaicreator-mm/domain-forge',commit:R9_UPSTREAM_COMMIT,path:R9_ROOT+'FORMAL_INPUT.json',gitBlob:R9_INPUT_BLOB}),
 proof:Object.freeze({repository:'kaicreator-mm/domain-forge',commit:R9_UPSTREAM_COMMIT,path:R9_ROOT+'R9_FORMAL_RECEIPT.json',gitBlob:R9_PROOF_BLOB})
});
const OUTCOMES=Object.freeze({ENTAILED:'OBSERVED',REFUTED:'OBSERVED',UNDERDETERMINED:'UNKNOWN'});
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const json=(s,code)=>{try{return JSON.parse(s)}catch{fail(code)}};
export function makeR9ConditionalProofReader(inputText,proofText){
 if(sourceGitBlob(inputText)!==R9_INPUT_BLOB||sourceGitBlob(proofText)!==R9_PROOF_BLOB)
  fail('DKE_R9_SOURCE_GIT_BLOB_DRIFT');
 const input=json(inputText,'DKE_R9_INPUT_INVALID'),proof=json(proofText,'DKE_R9_PROOF_INVALID');
 if(input.schema!=='dke.r8.r9.symbolic-formal-input/1'||proof.schema!=='dke.r8.r9.native-symbolic-source-proof/1'||
    proof.status!=='PASS_BOUNDED_FORMAL_SOURCE_SCOPE'||
    proof.frozenInputGitBlob!==R9_INPUT_BLOB||
    proof.variables!==11||proof.consistentWorlds!==64||
    proof.qualification?.sourceFactsAndAxiomsAuthoredBySameAssistant!==true||
    proof.qualification?.independentSemanticCritic!==false||
    proof.qualification?.qualifiedSap!==0||
    proof.qualification?.externalEffects!==0||
    input.qualification?.qualifiedSap!==false||
    input.qualification?.independentSemanticReviewer!==false||
    input.qualification?.sourceFactSelectionAuthoredByCurrentAssistant!==true||
    !object(input.publisherGitBlobs)||Object.keys(input.publisherGitBlobs).length!==4)
  fail('DKE_R9_FORMAL_AUTHORITY_INVALID');
 if(!Array.isArray(input.challenges)||input.challenges.length!==11||
    !Array.isArray(proof.cases)||proof.cases.length!==11||
    proof.outcomes?.ENTAILED!==2||proof.outcomes?.REFUTED!==2||proof.outcomes?.UNDERDETERMINED!==7)
  fail('DKE_R9_RESULT_INCONSISTENT');
 const lookup=new Map(),count={ENTAILED:0,REFUTED:0,UNDERDETERMINED:0};
 for(const c of input.challenges){
  const row=proof.cases.find(x=>x.id===c.id);
  if(typeof c.id!=='string'||!/^(S0[1-9]|S1[01])$/.test(c.id)||lookup.has(c.id)||
     !row||row.atom!==c.atom||row.verdict!==c.expected||
     !Object.hasOwn(OUTCOMES,row.verdict)||row.qualifiedSap!==false||
     row.effectAllowed!==false)
   fail('DKE_R9_CASE_INVALID');
  if(row.verdict==='UNDERDETERMINED'){
   if(row.satisfiablePositive!==true||row.satisfiableNegative!==true||
      !Array.isArray(row.countermodels)||row.countermodels.length!==2||
      row.countermodels[0].value!==true||row.countermodels[1].value!==false)
    fail('DKE_R9_COUNTERMODEL_INVALID');
  }else if(row.verdict==='ENTAILED'&&row.satisfiableNegative!==false||
           row.verdict==='REFUTED'&&row.satisfiablePositive!==false)
   fail('DKE_R9_PROOF_CONTRADICTION');
  count[row.verdict]++;
  lookup.set(c.id,Object.freeze({id:c.id,atom:c.atom,verdict:row.verdict}));
 }
 if(Object.keys(count).some(k=>count[k]!==proof.outcomes[k]))
  fail('DKE_R9_RESULT_INCONSISTENT');
 return Object.freeze({
  query(request){
   if(!object(request)||Object.keys(request).length!==1||typeof request.id!=='string'||
      !lookup.has(request.id))fail('DKE_R9_UNSELECTED_OR_FORGED_CALL');
   const c=lookup.get(request.id),status=OUTCOMES[c.verdict],unknown=status==='UNKNOWN';
   const sourceRefs=Object.entries(input.publisherGitBlobs).map(([k,v])=>k+':git-blob:'+v);
   return Object.freeze({
    status,queryId:c.id,verdict:c.verdict,proposition:c.atom,
    propositionLogicallySupported:c.verdict==='ENTAILED',
    sourceStatus:'ORIGINAL_PUBLISHER_GIT_DOCS_SAME_MODEL_FACTS_UNQUALIFIED',
    formalInputGitBlob:R9_INPUT_BLOB,formalProofGitBlob:R9_PROOF_BLOB,
    sourceRefs,
    ...(unknown?{}:{evidenceRefs:['dke:r9:conditional-proof:'+c.id]}),
    qualified:false,independentSemanticOracle:false,effectDispatched:false
   });
  }
 });
}
