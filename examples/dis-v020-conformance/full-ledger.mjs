/** Full DIS 0.2 demo evidence ledger over heterogeneous B01–B20 schemas.
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
 // Older repaired rounds can record the R0 source in the manifest but the
 // R1 test's real source as the original of the ultimately qualified test.
 // The two identities are acceptable ONLY with byte-specific R0->R1 failure
 // history in BOTH independently versioned round and manifest records.
 const repairedTestOrigin=round.originCommit!==identity;
 if(repairedTestOrigin){
  // R64: original R0 and selected R1 test origins are both stored as genuine
  // failed runs in both independent machine records.
  const r64VersionedHistory=sha.test(identity)&&sha.test(round.originCommit)&&
   entry.originalR0SourceHead===identity&&round.originalR0SourceHead===identity&&
   Array.isArray(entry.history)&&Array.isArray(round.history)&&
   [entry.history,round.history].every(history=>
     history.some(h=>h.sourceHead===identity&&h.native==='FAILURE')&&
     history.some(h=>h.sourceHead===round.originCommit&&
       h.testBlob===round.testGitBlob&&h.native==='FAILURE'));
  // R66: the first trial source predates the final recompiled native test.
  // Accept final source as test origin ONLY when a versioned failed attempt
  // binds the older identity and a separate explicit source-exact SUCCESS
  // record binds the final test blob and manifest's qualified source.
  const r66FinalizedOrigin=sha.test(identity)&&sha.test(round.originCommit)&&
   round.originCommit===round.sourceHead&&
   entry.qualificationHead===round.sourceHead&&
   manifest.qualificationHead===round.sourceHead&&
   Array.isArray(round.history)&&
   round.history.some(h=>h.sourceHead===identity&&
     h.status==='NOT_QUALIFIED'&&
     ['ERROR','FAILURE'].includes(h.integration??h.native))&&
   round.history.some(h=>h.sourceHead===round.sourceHead&&
     h.testBlob===round.testGitBlob&&h.native==='SUCCESS');
  if(!r64VersionedHistory&&!r66FinalizedOrigin){
   // Preserve the pre-R67 public error for forged ordinary round origins.
   // Only an explicitly recorded original R0/R1 lineage (B18) or a
   // finalized-test-source lineage (B20) has the more specific error.
   fail(round.originCommit===round.sourceHead||
      entry.originalR0SourceHead===identity?
     'FULL_LEDGER_REPAIR_LINEAGE_INVALID':'FULL_LEDGER_ORIGINAL_SOURCE_DRIFT');
  }
 }
 // R63/R64 originally used qualificationTree (not finalTree). Do not invent
 // a later Git tree: where both names are present, require byte agreement.
 const roundTree=round.finalTree??round.qualificationTree;
 if(round.finalTree!==undefined&&round.qualificationTree!==undefined&&
    round.finalTree!==round.qualificationTree)fail('FULL_LEDGER_RECEIPT_SOURCE_DRIFT');
 if(!safe(path)||!path.endsWith('.test.mjs')||!sha.test(round.originCommit)||
    !sha.test(round.testGitBlob)||!sha.test(round.sourceHead)||
    !sha.test(roundTree)||!sha.test(identity)||
    (eblob!==undefined&&eblob!==round.testGitBlob)||
    (entry.testPath!==undefined&&entry.testPath!==path)||
    (entry.test!==undefined&&entry.test!==path))
  fail('FULL_LEDGER_ORIGINAL_SOURCE_DRIFT');
 if(entry.sourceHead!==round.sourceHead||receipt.source?.repository!=='kaicreator-mm/domain-harness'||
    receipt.source.head!==round.sourceHead||receipt.source.tree!==roundTree||
    receipt.id!==round.receipt?.match(/^receipts\/([a-z0-9.-]+)\.json$/)?.[1]||
    entry.receipt!==round.receipt||
    (receipt.testGitBlob??receipt.sourceTestBlob)!==round.testGitBlob||
    (receipt.testPath!==undefined&&receipt.testPath!==path)||
    (entry.qualificationTree!==undefined&&entry.qualificationTree!==roundTree))
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
  batch,receipt:receipt.id,sourceHead:round.sourceHead,sourceTree:roundTree,
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
