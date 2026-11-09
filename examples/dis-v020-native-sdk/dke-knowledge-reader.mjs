/** DIS 0.2 B08-01: read-only bridge from an actual DKE-generated
 * two-version Git-receipt. This is provenance data consumption, NOT an
 * independent domain semantic Oracle, approval or Execution/Effect authority.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';

export const DKE_RECEIPT_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-forge',
 commit:'880a24e8949d34901b8d8a2a04f691df4bfd08e2',
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r6-d02-real-version/EXECUTION_RECEIPT.json',
 gitBlob:'62a992b9d22332aefcbbcbb02cccb55f5ab25427'
});
export const DKE_OLD_GRAPH_BLOB='2d4498dfa5f90bcf57cc81e9c155fb9ede31bf00';
export const DKE_NEW_GRAPH_BLOB='0f6007315fd7352fe6fd218effcfecf672cb4961';
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const isArrayOfStrings=a=>Array.isArray(a)&&a.every(x=>typeof x==='string'&&x.length>0);
const unapproved=(r)=>{
 if(r.qualifiedSap!==0||r.sapQualified!==0||r.domainOwnerApproved!==false||
    r.independentSemanticOracle!==false||r.effectsIssued!==0||
    r.allPreviousClaimsPENDING!==true||r.newCasesAndEvidencePENDING!==true)
  fail('DKE_SAP_AUTHORITY_UNVERIFIED');
};
export function makeDkeCandidateKnowledge(sourceText,origin=DKE_RECEIPT_ORIGIN){
 if(typeof sourceText!=='string'||!obj(origin)||
    Object.keys(DKE_RECEIPT_ORIGIN).some(k=>origin[k]!==DKE_RECEIPT_ORIGIN[k])||
    sourceGitBlob(sourceText)!==DKE_RECEIPT_ORIGIN.gitBlob)
  fail('DKE_SOURCE_GIT_BLOB_DRIFT');
 let r;
 try{r=JSON.parse(sourceText)}catch{fail('DKE_RECEIPT_FORMAT_INVALID')}
 if(!obj(r)||r.schema!=='dke.r8.d02.actual-git-version-evolution-receipt/1'||
    r.origin?.oldSourceGitBlob!==DKE_OLD_GRAPH_BLOB||
    r.origin?.newSourceGitBlob!==DKE_NEW_GRAPH_BLOB||
    r.oldQueryCount!==466||r.totalQueryCount!==485||
    r.newNodeQueries!==14||r.newCaseEvidenceSourceQueries!==5||
    r.consumedNewEntriesOnlyInNewVersion!==19||
    r.incrementalVersusCleanExactEqual!==true||
    !Array.isArray(r.sourceTraces)||r.sourceTraces.length!==5)
  fail('DKE_RECEIPT_FORMAT_INVALID');
 unapproved(r);
 const traces=new Map();
 for(const t of r.sourceTraces){
  if(typeof t?.id!=='string'||!t.id.startsWith('CHAIN:')||
     !isArrayOfStrings(t.linkedSourcePath)||t.linkedSourcePath.length!==4||
     t.linkedSourcePath.some((id,i)=>!id.startsWith(['se:CASE-','se:EVD-','se:LOC-','se:SRC-'][i]))||
     t.qualified!==false||t.reviewState!=='CONTENT_PARTIAL_VERIFIED'||traces.has(t.id))
   fail('DKE_SOURCE_TRACE_INVALID');
  traces.set(t.id,Object.freeze({
   id:t.id,linkedSourcePath:Object.freeze([...t.linkedSourcePath]),
   reviewState:t.reviewState,qualified:false
  }));
 }
 // AOT/caller may select a known producer trace, but cannot fabricate a
 // positive SAP acceptance, change a locked Tally source revision or Effect.
 return Object.freeze({
  query(input){
   if(!obj(input)||typeof input.queryId!=='string'||!['old','new'].includes(input.sourceVersion))
    fail('DKE_QUERY_INVALID');
   const trace=traces.get(input.queryId);
   const found=input.sourceVersion==='new'&&trace!==undefined;
   return Object.freeze({
    status:found?'SOURCE_TRACE_FOUND':'SOURCE_TRACE_UNAVAILABLE',
    reviewState:found?trace.reviewState:'UNKNOWN',
    qualified:false,
    sourceVersion:input.sourceVersion,
    sourceGraphGitBlob:input.sourceVersion==='new'?DKE_NEW_GRAPH_BLOB:DKE_OLD_GRAPH_BLOB,
    sourceGitBlob:DKE_RECEIPT_ORIGIN.gitBlob,
    sourcePath:found?[...trace.linkedSourcePath]:[],
    evidenceRefs:found?[trace.id]:[],
    effectDispatched:false
   });
  }
 });
}
