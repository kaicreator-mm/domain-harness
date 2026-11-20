/** R33 original GO triage → DIS v0.2 read-only Knowledge Function adapter.
 * Selected actual original DKE producer receipt is DATA; this module is LOCAL source code.
 * Full source permission and semantic truth are not implied by a matching Git blob.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
export const DKE_R33_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-forge',
 commit:'9104928912cc808ee76658968c3a1febe3afd799',
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r33-go-ic-source-triage/RUN_RECEIPT_R33_R1.json',
 gitBlob:'8e77f2a2b518c2cf5151b8f2b1e6707287ed33f6'
});
const CLASS_NAMES=Object.freeze(['QUARANTINE_FATAL','REVIEW_SOFT','STRUCTURAL_CANDIDATE']);
const TARGET=Object.freeze({QUARANTINE_FATAL:233,REVIEW_SOFT:3769,STRUCTURAL_CANDIDATE:906474});
const ROW_HASHES=Object.freeze({
 QUARANTINE_FATAL:'0e9a875ecf88c40e477067d4f09298b8df4fed33384dd011d662ce4f301ec949',
 REVIEW_SOFT:'2bf208ced4ee4a347f211861ab4461a5d467ee2a285ea23505b13140c085aeb9',
 STRUCTURAL_CANDIDATE:'d92a9b806568966e37f52f40f2c99fabe03bb5f10e964283638d8b2db846323f'
});
const SOURCE_GZIP='a0afba19dfb1f8fa996bc1bdcd61fd0c9bd4cf0d2bf2509d09ac86993c0e70a2';
const error=code=>{const e=new Error(code);e.code=code;throw e;};
const valid=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function makeR33OriginalGoReader(sourceText,origin=DKE_R33_ORIGIN){
 if(typeof sourceText!=='string'||!valid(origin)||Object.entries(DKE_R33_ORIGIN).some(([k,v])=>origin[k]!==v)||
    sourceGitBlob(sourceText)!==DKE_R33_ORIGIN.gitBlob)error('DKE_R33_RECEIPT_GIT_BLOB_DRIFT');
 let p;try{p=JSON.parse(sourceText)}catch{error('DKE_R33_RECEIPT_FORMAT');}
 const run=p?.runOutput,res=run?.results;
 if(p?.receiptVersion!=='R33-R1'||p?.exitCode!==0||p?.verdict!=='SOURCE_SCOPED_DISPOSITIONS_COMPUTED'||
  p?.qualification!=='NOT_QUALIFIED'||p?.fixtureSuite?.passed!==13||p?.fixtureSuite?.total!==13||
  p?.sourceIdentity?.gzipSha256!==SOURCE_GZIP||p?.sourceIdentity?.gzipBytes!==12109254||
  run?.source?.gzipSha256!==SOURCE_GZIP||run?.status!=='SOURCE_SCOPED_DISPOSITIONS_COMPUTED'||
  run?.source?.r32GateGitBlob!=='4cb132e06969fe60a28aa7ce376aa8d112309e37'||
  res?.rows!==910476||!same(res.counts,TARGET)||!same(res.canonicalRowSha256,ROW_HASHES)||
  res?.hardReasons?.WITH_FROM_REQUIRED_IC!==228||res.hardReasons.RELATION_ASPECT_INVALID!==2||
  res.hardReasons.IC_WITH_FROM_GO_SELF_REFERENCE!==3||
  res?.softEvidence?.IPI!==3736||res.softEvidence.IGI!==19||
  res.softEvidence.ISS!==12||res.softEvidence.ISM!==2||
  p?.runOutput?.qualification?.sapQualified!==0||
  p.runOutput.qualification.independentCritic!=='NOT_RUN'||
  p.runOutput.qualification.disEffects!=='NONE'||
  p?.determinism?.byteIdenticalOutput!==true)
  error('DKE_R33_ORIGINAL_TRIAGE_SCOPE_INVALID');
 return Object.freeze({
  query(input){
   if(!valid(input)||Object.keys(input).length!==1||
      !CLASS_NAMES.includes(input.disposition))error('DKE_R33_SELECTION_INVALID');
   const tier=input.disposition;
   return Object.freeze({
    status:'UNKNOWN',selectedDisposition:tier,
    sourceState:'SOURCE_SCOPED_ONLY_UNREVIEWED',
    originalAnnotationRows:res.rows,selectedRows:TARGET[tier],
    tierCanonicalSha256:ROW_HASHES[tier],sourceGzipSha256:SOURCE_GZIP,
    receiptGitBlob:DKE_R33_ORIGIN.gitBlob,
    independentCritic:false,sapQualified:false,effectDispatched:false
   });
  }
 });
}
