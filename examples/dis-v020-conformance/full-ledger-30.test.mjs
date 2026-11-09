/** DIS v0.2 B17/R63: extend R59's original 26-round retrospective source
 * ledger to all 30 completed B01-B16 rounds, including independent repairs.
 * Historical stored CI is distinct from current GitHub/semantic SAP approval.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditFullDisLedger,validateFullRound} from './full-ledger.mjs';
const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const file=async path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const gitBlob=s=>{const b=Buffer.from(s,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')};
const clone=structuredClone;
const reject=code=>e=>e?.code===code;
async function r62(){
 const manifest=await read('batches/B16/manifest.json'),
  round=await read('batches/B16/rounds/B16-01/round.json'),
  receipt=await read(round.receipt),
  matrix=await read('matrix.json'),
  sourceText=await file(round.testPath),
  ciText=await file('.woodpecker/dis-v020-integration.yaml');
 return {batch:'B16',manifest,entry:manifest.rounds[0],round,receipt,matrix,sourceText,ciText};
}
test('R63 every B01-B16 source-qualified round (30/30) has unique historical Git+3-context CI receipt and matrix link, without SAP promotion',async()=>{
 const a=await auditFullDisLedger({stopBefore:'B17'});
 assert.equal(a.auditedBatches,16);
 assert.equal(a.auditedRounds,30);
 assert.equal(a.storedExactCIValid,30);
 assert.equal(new Set(a.rows.map(x=>x.id)).size,30);
 assert.equal(new Set(a.rows.map(x=>x.receipt)).size,30);
 assert.equal(a.rows[0].id,'B01-01');
 assert.equal(a.rows.at(-1).id,'B16-01');
 for(const id of ['B13','B14','B15','B16'])
  assert.equal(a.rows.filter(x=>x.batch===id).length,1);
 const r16=a.rows.find(x=>x.id==='B16-01');
 assert.equal(r16.sourceHead,'e16362004f3f40f763a733e2a3973d025898a26d');
 assert.equal(r16.originalTestGitBlob,'2a61a0ed371ea500ec05cc2e277dec5d25c4bd78');
 assert.equal(r16.pipeline,'2344');
 assert.equal(r16.sourceMatchesCurrent,true);
 assert.ok(a.currentBlobMismatch.includes('B15-01'), 'R61 historical success source intentionally differs from separately qualified repaired source');
 assert.equal(a.coreVerified,9);
 assert.equal(a.corePartial,7);
 assert.equal(a.optionalNotRun,4);
 assert.equal(a.governanceNotRun,1);
 assert.equal(a.independentSemanticSAP,'NOT_CLAIMED');
 assert.equal(a.versionFreezeEligible,false);
});
test('R63 preserve R61 exact original CI separately from genuine R61-R1 immutable isolated-reader repair',async()=>{
 const m=await read('batches/B15/manifest.json'),
  r=await read('batches/B15/rounds/B15-01/round.json'),
  receipt=await read(r.receipt);
 assert.equal(m.status,'VERIFIED');
 assert.equal(r.testGitBlob,'3cb38ab938a531ae30ef00770488e086e63dff95');
 assert.equal(r.sourceHead,'2d331ec0aa38464808d419318422a86fa60c6d7a');
 assert.equal(receipt.source.head,r.sourceHead);
 assert.ok(receipt.ci.every(x=>x.url.includes('/pipeline/2331/')));
 const reader=await file('examples/dis-v020-native-sdk/dke-r17-guide-reader.mjs');
 const testCode=await file('examples/dis-v020-native-sdk/b15-r17-guide-compatibility.test.mjs');
 assert.equal(gitBlob(reader),'a599be27036b85194d1e64a88c87959987b16059');
 assert.equal(gitBlob(testCode),'13b316ceac51227caa0c66c15ac430879fafa55e');
 assert.notEqual(gitBlob(testCode),r.testGitBlob);
 assert.ok(testCode.includes('immutable detached impact arrays across requests'));
});
test('R63 exact R62 revised 10-node graph edge checks and later #2344 CI are consistent across B16 manifest round and receipt',async()=>{
 const x=await r62();
 const y=validateFullRound(x);
 assert.equal(y.id,'B16-01');
 assert.equal(y.sourceMatchesCurrent,true);
 assert.equal(x.manifest.qualificationHead,x.round.sourceHead);
 assert.equal(x.manifest.qualificationTree,x.round.finalTree);
 assert.equal(x.round.finalTree,x.receipt.source.tree);
 assert.deepEqual(x.entry.checks,x.round.checks);
 assert.deepEqual(x.round.checks,x.receipt.ci);
 assert.equal(x.round.checks.length,3);
 assert.ok(x.round.checks.every(c=>c.state==='SUCCESS'&&c.url.includes('/pipeline/2344/')));
 assert.equal(gitBlob(await file('examples/dis-v020-native-sdk/dke-r18-impact-reader.mjs')),
  '0a51feffaec5119dff2bb3176fb00ae93bca7ed5');
 assert.ok(x.sourceText.includes('GRAPH_EDGE_SET_DRIFT'));
 assert.equal(x.receipt.upstreamDke.runnerPackageGitBlob,'aca65f96917b5643b18b479b8aa019bb8d2dc24a');
});
test('R63 stale R62 standalone round or mismatched qualifying HEAD/TREE is rejected despite a green batch manifest',async()=>{
 const a=clone(await r62());a.round.status='CI_PENDING';
 assert.throws(()=>validateFullRound(a),reject('FULL_LEDGER_UNQUALIFIED_ROUND'));
 const b=clone(await r62());b.round.sourceHead='f'.repeat(40);
 assert.throws(()=>validateFullRound(b),reject('FULL_LEDGER_RECEIPT_SOURCE_DRIFT'));
 const c=clone(await r62());c.receipt.source.tree='f'.repeat(40);
 assert.throws(()=>validateFullRound(c),reject('FULL_LEDGER_RECEIPT_SOURCE_DRIFT'));
 const d=clone(await r62());d.round.testGitBlob='f'.repeat(40);
 assert.throws(()=>validateFullRound(d),reject('FULL_LEDGER_ORIGINAL_SOURCE_DRIFT'));
});
test('R63 forged Woodpecker source pipeline / missing matrix receipt / fake native test are rejected',async()=>{
 const a=clone(await r62());a.receipt.ci[1].url='https://ci.kaicreator.com/repos/18/pipeline/9999/2';
 a.entry.checks=clone(a.receipt.ci);a.round.checks=clone(a.receipt.ci);
 assert.throws(()=>validateFullRound(a),reject('FULL_LEDGER_CI_SOURCE_MIXED'));
 const b=clone(await r62());b.matrix.receipts=b.matrix.receipts.filter(x=>x!==b.receipt.id);
 assert.throws(()=>validateFullRound(b),reject('FULL_LEDGER_MATRIX_UNLINKED'));
 const c=clone(await r62());c.ciText='';
 assert.throws(()=>validateFullRound(c),reject('FULL_LEDGER_TEST_NOT_IN_NATIVE_CI'));
});
