/** B21/R67: comprehensive B01–B20 original-source receipt audit; historical
 * Git+CI readbacks are not fresh independent semantic proof or current CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditFullDisLedger,validateFullRound} from './full-ledger.mjs';
const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const repo=new URL('../../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const text=async path=>readFile(new URL(path,repo),'utf8');
const clone=structuredClone;
const reject=code=>e=>e?.code===code;

async function roundFixture(batch){
 const manifest=await json('batches/'+batch+'/manifest.json'),entry=manifest.rounds[0],
  round=await json('batches/'+batch+'/rounds/'+entry.batchRoundId+'/round.json'),
  receipt=await json(round.receipt);
 return {batch,manifest,entry,round,receipt,
  sourceText:await text(round.testPath),ciText:await text('.woodpecker/dis-v020-integration.yaml'),
  matrix:await json('matrix.json')};
}
test('R67 all 34 original B01-B20 scoped rounds retain independent named 3-context stored receipts and Matrix links',async()=>{
 const r=await auditFullDisLedger({stopBefore:'B21'});
 assert.equal(r.auditedBatches,20);
 assert.equal(r.auditedRounds,34);
 assert.equal(r.storedExactCIValid,34);
 assert.equal(new Set(r.rows.map(x=>x.id)).size,34);
 assert.equal(new Set(r.rows.map(x=>x.receipt)).size,34);
 assert.deepEqual(r.rows.slice(-4).map(x=>x.id),['B17-01','B18-01','B19-01','B20-01']);
 assert.deepEqual(r.rows.slice(-4).map(x=>x.pipeline),['2348','2355','2357','2364']);
 assert.ok(r.rows.every(x=>x.ci==='STORED_EXACT_SOURCE_CI_3_OF_3_SUCCESS'));
 assert.ok(r.rows.every(x=>x.semanticSAP==='NOT_INFERRED'));
 const live=(await json('matrix.json')).requirements;
 assert.deepEqual([r.coreVerified,r.corePartial,r.optionalNotRun,r.governanceNotRun],[
  live.filter(x=>x.profile==='core'&&x.state==='VERIFIED').length,
  live.filter(x=>x.profile==='core'&&x.state==='PARTIAL').length,
  2,1
 ]);
 assert.equal(r.versionFreezeEligible,false);assert.equal(r.independentSemanticSAP,'NOT_CLAIMED');
});
test('R67 preserves pre-existing B13 ordinary forged source origin rejection code',async()=>{
 const a=await roundFixture('B12');
 assert.equal(a.entry.originalSourceHead,a.round.originCommit);
 const mutated=clone(a);mutated.round.originCommit='0'.repeat(40);
 assert.throws(()=>validateFullRound(mutated),reject('FULL_LEDGER_ORIGINAL_SOURCE_DRIFT'));
});
test('R67 R64 R0->R1 repaired test origin cannot be forged without BOTH historical failure pedigrees',async()=>{
 const r=await roundFixture('B18');
 assert.equal(validateFullRound(r).sourceHead,'ab78c52d9b6717c6badb27b4542736f47c69bc42');
 assert.notEqual(r.entry.originalSourceHead,r.round.originCommit);
 const x=clone(r);x.entry.history=x.entry.history.filter(h=>h.sourceHead!==r.round.originCommit);
 assert.throws(()=>validateFullRound(x),reject('FULL_LEDGER_REPAIR_LINEAGE_INVALID'));
 const y=clone(r);y.round.history=y.round.history.filter(h=>h.sourceHead!==r.entry.originalSourceHead);
 assert.throws(()=>validateFullRound(y),reject('FULL_LEDGER_REPAIR_LINEAGE_INVALID'));
 const z=clone(r);z.round.originCommit='a'.repeat(40);
 assert.throws(()=>validateFullRound(z),reject('FULL_LEDGER_REPAIR_LINEAGE_INVALID'));
});
test('R67 R63 qualificationTree aliases finalTree only when actual source SHA and Tree agree',async()=>{
 const r=await roundFixture('B17');
 assert.equal(r.round.finalTree,undefined);
 assert.equal(validateFullRound(r).sourceTree,r.receipt.source.tree);
 const t=clone(r);t.round.finalTree='f'.repeat(40);
 assert.throws(()=>validateFullRound(t),reject('FULL_LEDGER_RECEIPT_SOURCE_DRIFT'));
 const p=clone(r);p.round.qualificationTree='0'.repeat(40);
 assert.throws(()=>validateFullRound(p),reject('FULL_LEDGER_RECEIPT_SOURCE_DRIFT'));
});
test('R67 R66 finalized origin is accepted only with original FAILURE and final identical test-blob SUCCESS',async()=>{
 const x=await roundFixture('B20');
 assert.equal(validateFullRound(x).pipeline,'2364');
 assert.notEqual(x.entry.originalSourceHead,x.round.originCommit);
 const noFailure=clone(x);
 noFailure.round.history=noFailure.round.history.filter(h=>h.sourceHead!==x.entry.originalSourceHead);
 assert.throws(()=>validateFullRound(noFailure),reject('FULL_LEDGER_REPAIR_LINEAGE_INVALID'));
 const noSuccess=clone(x);
 noSuccess.round.history=noSuccess.round.history.filter(h=>h.sourceHead!==x.round.originCommit);
 assert.throws(()=>validateFullRound(noSuccess),reject('FULL_LEDGER_REPAIR_LINEAGE_INVALID'));
 const swapped=clone(x);swapped.entry.qualificationHead='f'.repeat(40);
 assert.throws(()=>validateFullRound(swapped),reject('FULL_LEDGER_REPAIR_LINEAGE_INVALID'));
});
test('R67 R66 newest original B20 proof cannot inherit mixed CI, source or Matrix link',async()=>{
 const r=await roundFixture('B20');
 assert.equal(validateFullRound(r).pipeline,'2364');
 const x=clone(r);
 x.receipt.ci[1].url='https://ci.kaicreator.com/repos/18/pipeline/2373/2';
 x.round.checks=clone(x.receipt.ci);x.entry.checks=clone(x.receipt.ci);
 assert.throws(()=>validateFullRound(x),reject('FULL_LEDGER_CI_SOURCE_MIXED'));
 const y=clone(r);y.receipt.source.tree='0'.repeat(40);
 assert.throws(()=>validateFullRound(y),reject('FULL_LEDGER_RECEIPT_SOURCE_DRIFT'));
 const z=clone(r);z.matrix.receipts=z.matrix.receipts.filter(id=>id!==r.receipt.id);
 assert.throws(()=>validateFullRound(z),reject('FULL_LEDGER_MATRIX_UNLINKED'));
});
