/** DIS v0.2 C4: read-only batch/round evidence integrity on checked-in Git.
 * This validates stored source and CI *claims*, not live Woodpecker state.
 * Historical proof stays attached to its original exact SHA even when a
 * newer branch modifies a test; such drift is explicitly surfaced.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base='docs/standards/domain-intelligence/DIS-0.2.0/conformance';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const SHA=/^[a-f0-9]{40}$/;
const CONTEXTS=[
 'ci/woodpecker/pr/dis-v020-integration',
 'ci/woodpecker/pr/verify-min-node',
 'ci/woodpecker/pr/verify'
];
const blob=text=>{
 const bytes=Buffer.from(text,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
};
const safe=path=>typeof path==='string'&&path.length>0&&
 !path.startsWith('/')&&!path.includes('\\')&&!path.split('/').includes('..');
export function validateRoundEvidence({manifest,round,receipt,sourceText,ciFile,matrix}){
 const id=round?.roundId,entry=manifest?.rounds?.find(x=>x.batchRoundId===id);
 if(!entry||manifest.status!=='VERIFIED'||round.status!=='VERIFIED'||entry.status!=='VERIFIED'||
    manifest.schema!=='dis.v0.2.demo-batch/1'||manifest.version!=='0.2.0'||
    !SHA.test(manifest.qualificationHead)||!SHA.test(manifest.qualificationTree))
  fail('BATCH_ROUND_NOT_QUALIFIED');
 const path=round.testPath??entry.testPath??entry.test;
 const recId=round.receipt?.match(/^receipts\/([a-z0-9.-]+)\.json$/)?.[1];
 const orig=round.originCommit;
 if(!safe(path)||!path.endsWith('.test.mjs')||path!==entry.testPath&&path!==entry.test||
    !SHA.test(orig)||orig!==(entry.originalSourceHead??entry.originSourceHead)||
    !SHA.test(round.testGitBlob)||round.testGitBlob!==(entry.qualifyingTestGitBlob??entry.testGitBlob)||
    !recId||entry.receipt!==round.receipt||receipt.id!==recId)
  fail('BATCH_ROUND_SOURCE_DRIFT');
 const receiptBlob=receipt.testGitBlob??receipt.sourceTestBlob;
 if(receipt.status!=='SUCCESS'||receipt.disVersion!=='0.2.0'||
    receipt.source?.repository!=='kaicreator-mm/domain-harness'||
    receipt.source.head!==round.sourceHead||receipt.source.head!==entry.sourceHead||
    receipt.source.head!==manifest.qualificationHead||
    receipt.source.tree!==round.finalTree||receipt.source.tree!==manifest.qualificationTree||
    receiptBlob!==round.testGitBlob||
    receipt.casePath!==undefined&&receipt.casePath!==path||
    receipt.testPath!==undefined&&receipt.testPath!==path)
  fail('BATCH_RECEIPT_SOURCE_MISMATCH');
 for(const [checks,code] of [[entry.checks,'BATCH_CI_MANIFEST_DRIFT'],[round.checks,'BATCH_CI_ROUND_DRIFT'],[receipt.ci,'BATCH_CI_RECEIPT_INVALID']]){
  if(!Array.isArray(checks)||checks.length!==3||new Set(checks.map(x=>x.context)).size!==3||
     checks.some(x=>x.state!=='SUCCESS')||
     checks.some((x,i)=>x.context!==CONTEXTS[i]))
    fail(code);
 }
 if(JSON.stringify(entry.checks)!==JSON.stringify(receipt.ci)||JSON.stringify(round.checks)!==JSON.stringify(receipt.ci))
  fail('BATCH_CI_INCONSISTENT');
 const matched=receipt.ci.map((x,i)=>{
  const parsed=x.url?.match(/^https:\/\/ci\.kaicreator\.com\/repos\/18\/pipeline\/(\d+)\/([123])$/);
  if(!parsed||Number(parsed[2])!==i+1)fail('BATCH_CI_URL_INVALID');
  return parsed[1];
 });
 if(new Set(matched).size!==1)fail('BATCH_CI_SHA_UNRELATED');
 if(!matrix?.receipts?.includes(receipt.id)||
    !matrix.requirements?.some(x=>x.receiptIds?.includes(receipt.id)))
  fail('BATCH_MATRIX_RECEIPT_UNLINKED');
 if(typeof sourceText!=='string'||!sourceText.includes('test(')||
    typeof ciFile!=='string'||!ciFile.includes(' '+path))
  fail('BATCH_SOURCE_OR_CI_MISSING');
 if(orig!==receipt.source.head&&!JSON.stringify(round.history??[]).includes(orig))
  fail('BATCH_HISTORICAL_REPLAY_UNRECORDED');
 return Object.freeze({id,batch:manifest.batchId,receiptId:receipt.id,
  testedAt:receipt.source.head,originalCommit:orig,
  recordedTestGitBlob:receiptBlob,currentTestGitBlob:blob(sourceText),
  currentBlobMatchesHistorical:blob(sourceText)===receiptBlob,
  ciPipeline:matched[0],ci:"STORED_CI_3_OF_3_SUCCESS",
  independentSemanticOracle:false});
}
export async function auditCheckedInBatches(ids=['B01','B02','B03']){
 const text=async path=>{
  if(!safe(path))fail('BATCH_FILE_PATH_INVALID');
  return readFile(join(root,path),'utf8');
 };
 const json=async path=>JSON.parse(await text(path));
 const matrix=await json(base+'/matrix.json');
 const ciFile=await text('.woodpecker/dis-v020-integration.yaml');
 const rows=[];
 for(const batchId of ids){
  if(!/^B0[1-9]$/.test(batchId))fail('BATCH_ID_INVALID');
  const dir=base+'/batches/'+batchId;
  const manifest=await json(dir+'/manifest.json');
  if(manifest.batchId!==batchId||manifest.rounds.length!==3)fail('BATCH_MANIFEST_INVALID');
  for(const entry of manifest.rounds){
   const round=await json(dir+'/rounds/'+entry.batchRoundId+'/round.json');
   if(!safe(round.receipt))fail('BATCH_RECEIPT_PATH_INVALID');
   const receipt=await json(base+'/'+round.receipt);
   const path=round.testPath??entry.testPath??entry.test;
   rows.push(validateRoundEvidence({
    manifest,round,receipt,matrix,
    sourceText:await text(path),ciFile
   }));
  }
 }
 return Object.freeze({schema:'dis.v0.2.batch-source-audit/1',auditedRounds:rows.length,
  recordedCIValid:rows.length,
  currentBlobDrifts:rows.filter(x=>!x.currentBlobMatchesHistorical),
  rows});
}
