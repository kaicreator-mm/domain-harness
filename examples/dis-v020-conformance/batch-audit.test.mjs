import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditCheckedInBatches,validateRoundEvidence} from './batch-audit.mjs';

const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const checks=await read('batches/B03/manifest.json');
const round=await read('batches/B03/rounds/B03-01/round.json');
const receipt=await read('receipts/r38-b03-target-roster-ci.json');
const matrix=await read('matrix.json');
const sourceText=await readFile(new URL('../dis-v020-native-sdk/b03-target-closure.test.mjs',import.meta.url),'utf8');
const ciFile=await readFile(new URL('../../.woodpecker/dis-v020-integration.yaml',import.meta.url),'utf8');
const clone=structuredClone;
const rejects=code=>e=>e?.code===code;

test('B04-01 R41 verify B01 B02 B03 recorded 9 individually versioned exact-SHA receipts without promoting Core',async()=>{
 const audit=await auditCheckedInBatches();
 assert.equal(audit.auditedRounds,9);
 assert.equal(audit.recordedCIValid,9);
 assert.equal(audit.rows.every(r=>r.ci==='STORED_CI_3_OF_3_SUCCESS'),true);
 assert.equal(audit.rows.every(r=>r.independentSemanticOracle===false),true);
 assert.ok(audit.rows.some(r=>!r.currentBlobMatchesHistorical),
  'an older original round test may have changed in later source; do not rewrite old SHA');
 assert.ok(audit.rows.find(r=>r.id==='B02-01').currentBlobMatchesHistorical===false,
  'R35 old negative was updated in R38 for the new optional Target ABI');
});
test('B04-01 R41 negative forged original test blob or Source HEAD does not inherit a later CI PASS',()=>{
 const broken=clone(round);broken.testGitBlob='0'.repeat(40);
 assert.throws(()=>validateRoundEvidence({manifest:checks,round:broken,receipt,sourceText,ciFile,matrix}),
  rejects('BATCH_ROUND_SOURCE_DRIFT'));
 const forged=clone(receipt);forged.source.head='0'.repeat(40);
 assert.throws(()=>validateRoundEvidence({manifest:checks,round,receipt:forged,sourceText,ciFile,matrix}),
  rejects('BATCH_RECEIPT_SOURCE_MISMATCH'));
});
test('B04-01 R41 negative three CI URLs must belong to a single exact source pipeline',()=>{
 const fake=clone(receipt);fake.ci[1].url='https://ci.kaicreator.com/repos/18/pipeline/9001/2';
 const mr=clone(round);mr.checks=clone(fake.ci);
 const mm=clone(checks);mm.rounds[0].checks=clone(fake.ci);
 assert.throws(()=>validateRoundEvidence({manifest:mm,round:mr,receipt:fake,sourceText,ciFile,matrix}),
  rejects('BATCH_CI_SHA_UNRELATED'));
});
test('B04-01 R41 negative requirement receipt must be linked, and a source test must actually run in native CI',()=>{
 const fake=clone(matrix);fake.receipts=fake.receipts.filter(x=>x!==receipt.id);
 assert.throws(()=>validateRoundEvidence({manifest:checks,round,receipt,sourceText,ciFile,matrix:fake}),
  rejects('BATCH_MATRIX_RECEIPT_UNLINKED'));
 assert.throws(()=>validateRoundEvidence({manifest:checks,round,receipt,sourceText,ciFile:'',matrix}),
  rejects('BATCH_SOURCE_OR_CI_MISSING'));
});
