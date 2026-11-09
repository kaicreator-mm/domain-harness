/** Full DIS 0.2 demo evidence ledger over heterogeneous B01–B12 schemas.
 * This is a READ-ONLY consistency audit of stored source/CI receipts.
 * GitHub live statuses/independent SAP are separate proof obligations.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base='docs/standards/domain-intelligence/DIS-0.2.0/conformance';
const sha=/^[a-f0-9]{40}$/;
const contexts=['ci/woodpecker/pr/dis-v020-integration',
 'ci/woodpecker/pr/verify-min-node','ci/woodpecker/pr/verify'];
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const safe=p=>typeof p==='string'&&p.length>0&&!p.startsWith('/')&&
 !p.includes('\\')&&!p.split('/').includes('..');
const blob=data=>{const b=Buffer.from(data,'utf8');return createHash('sha1')
 .update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')};
const read=async path=>{if(!safe(path))fail('FULL_LEDGER_PATH_INVALID');
 return readFile(join(root,path),'utf8')};
const json=async path=>JSON.parse(await read(path));
const clone=x=>JSON.parse(JSON.stringify(x));
const receiptsEquiv=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const expectedUrl=/^https:\/\/ci\.kaicreator\.com\/repos\/18\/pipeline\/([0-9]+)\/([123])$/;
export function validateFullRound({batch,manifest,entry,round,receipt,sourceText,ciText,matrix}){
 if(manifest?.batchId!==batch||manifest?.schema!=='dis.v0.2.demo-batch/1'||
    manifest.version!=='0.2.0'||manifest.status!=='VERIFIED'||
    entry.status!=='VERIFIED'||round.status!=='VERIFIED'||
    receipt.status!=='SUCCESS'||receipt.disVersion!=='0.2.0')
  fail('FULL_LEDGER_UNQUALIFIED_ROUND');
 const path=round.testPath??entry.testPath??entry.test;
 const identity=entry.originalSourceHead??entry.originSourceHead;
 const eblob=entry.qualifyingTestGitBlob??entry.testGitBlob;
 if(!safe(path)||!path.endsWith('.test.mjs')||!sha.test(round.originCommit)||
    !sha.test(round.testGitBlob)||!sha.test(round.sourceHead)||
    !sha.test(round.finalTree)||!sha.test(identity)||
    round.originCommit!==identity||
    (eblob!==undefined&&eblob!==round.testGitBlob)||
    (entry.testPath!==undefined&&entry.testPath!==path)||
    (entry.test!==undefined&&entry.test!==path))
  fail('FULL_LEDGER_ORIGINAL_SOURCE_DRIFT');
 if(entry.sourceHead!==round.sourceHead||receipt.source?.repository!=='kaicreator-mm/domain-harness'||
    receipt.source.head!==round.sourceHead||receipt.source.tree!==round.finalTree||
    receipt.id!==round.receipt?.match(/^receipts\/([a-z0-9.-]+)\.json$/)?.[1]||
    entry.receipt!==round.receipt||
    (receipt.testGitBlob??receipt.sourceTestBlob)!==round.testGitBlob||
    (receipt.testPath!==undefined&&receipt.testPath!==path)||
    (entry.qualificationTree!==undefined&&entry.qualificationTree!==round.finalTree))
  fail('FULL_LEDGER_RECEIPT_SOURCE_DRIFT');
 for(const checks of [entry.checks,round.checks,receipt.ci]){
  if(!Array.isArray(checks)||checks.length!==3||
    checks.some((c,i)=>c.context!==contexts[i]||c.state!=='SUCCESS'))
   fail('FULL_LEDGER_CI_CONTEXT_INVALID');
 }
 if(!receiptsEquiv(entry.checks,receipt.ci)||!receiptsEquiv(round.checks,receipt.ci))
  fail('FULL_LEDGER_CI_RECORD_DRIFT');
 const urls=receipt.ci.map(x=>x.url?.match(expectedUrl));
 if(urls.some(x=>!x)||new Set(urls.map(x=>x[1])).size!==1||
    new Set(urls.map(x=>x[2])).size!==3)
  fail('FULL_LEDGER_CI_SOURCE_MIXED');
 if(!matrix?.receipts?.includes(receipt.id)||
    !matrix?.requirements?.some(q=>q.receiptIds?.includes(receipt.id)))
  fail('FULL_LEDGER_MATRIX_UNLINKED');
 if(typeof sourceText!=='string'||!sourceText.includes('test(')||
    !ciText.includes(' '+path))
  fail('FULL_LEDGER_TEST_NOT_IN_NATIVE_CI');
 return Object.freeze({id:entry.batchRoundId,round:entry.globalRoundId??round.globalRoundId,
  batch,receipt:receipt.id,sourceHead:round.sourceHead,sourceTree:round.finalTree,
  originalSourceHead:round.originCommit,originalTestGitBlob:round.testGitBlob,
  currentTestGitBlob:blob(sourceText),sourceMatchesCurrent:blob(sourceText)===round.testGitBlob,
  pipeline:urls[0][1],ci:'STORED_EXACT_SOURCE_CI_3_OF_3_SUCCESS',semanticSAP:'NOT_INFERRED'});
}
export async function auditFullDisLedger({stopBefore='B13'}={}){
 if(!/^B[0-9]{2}$/.test(stopBefore))fail('FULL_LEDGER_BOUND_INVALID');
 const matrix=await json(base+'/matrix.json'),ciText=await read('.woodpecker/dis-v020-integration.yaml');
 const folders=(await readdir(join(root,base,'batches'))).filter(x=>/^B\d{2}$/.test(x)).sort();
 const scoped=folders.filter(x=>x<stopBefore);
 if(!scoped.length)fail('FULL_LEDGER_SCOPE_EMPTY');
 const rows=[],seen=new Set(),seenReceipts=new Set();
 for(const batch of scoped){
  const dir=base+'/batches/'+batch,manifest=await json(dir+'/manifest.json');
  if(manifest?.batchId!==batch||manifest.status!=='VERIFIED'||
     !Array.isArray(manifest.rounds)||manifest.rounds.length<1||
     manifest.verifiedRounds!==undefined&&manifest.verifiedRounds!==manifest.rounds.length)
   fail('FULL_LEDGER_BATCH_INCOMPLETE');
  const isHead=manifest.qualificationHead,isTree=manifest.qualificationTree;
  if(!sha.test(isHead)||!sha.test(isTree))fail('FULL_LEDGER_BATCH_QUALIFIER_MISSING');
  let batchQualificationObserved=false;
  for(const entry of manifest.rounds){
   if(!/^B\d{2}-\d{2}$/.test(entry.batchRoundId)||entry.batchRoundId.slice(0,3)!==batch||
      seen.has(entry.batchRoundId))fail('FULL_LEDGER_DUPLICATE_OR_BAD_ID');
   seen.add(entry.batchRoundId);
   const round=await json(dir+'/rounds/'+entry.batchRoundId+'/round.json');
   const receipt=await json(base+'/'+round.receipt);
   const testPath=round.testPath??entry.testPath??entry.test;
   const row=validateFullRound({batch,manifest,entry,round,receipt,sourceText:await read(testPath),ciText,matrix});
   if(seenReceipts.has(row.receipt))fail('FULL_LEDGER_DUPLICATE_RECEIPT');
   seenReceipts.add(row.receipt);rows.push(row);
   if(row.sourceHead===isHead&&row.sourceTree===isTree)batchQualificationObserved=true;
  }
  if(!batchQualificationObserved)fail('FULL_LEDGER_BATCH_QUALIFIER_MISMATCH');
 }
 const core=matrix.requirements.filter(x=>x.profile==='core');
 const optional=matrix.requirements.filter(x=>x.profile==='optional-profile');
 const gov=matrix.requirements.filter(x=>x.profile==='governance');
 return Object.freeze({schema:'dis.v0.2.full-ledger-readback/1',
  auditedBatches:scoped.length,auditedRounds:rows.length,storedExactCIValid:rows.length,
  currentBlobMismatch:rows.filter(x=>!x.sourceMatchesCurrent).map(x=>x.id),
  coreVerified:core.filter(x=>x.state==='VERIFIED').length,
  corePartial:core.filter(x=>x.state==='PARTIAL').length,
  optionalNotRun:optional.filter(x=>x.state==='NOT_RUN').length,
  governanceNotRun:gov.filter(x=>x.state==='NOT_RUN').length,
  versionFreezeEligible:false,independentSemanticSAP:'NOT_CLAIMED',
  rows});
}
