/** B13/R59 — all 26 previously source-qualified DIS 0.2 Demo rounds
 * across historical 3-round B01-B07 and 1-round B08-B12 schema.
 * Exact stored CI is NOT independently fetched live status or semantic SAP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditFullDisLedger,validateFullRound} from './full-ledger.mjs';
const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const original=async()=>{
 const read=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
 const manifest=await read('batches/B12/manifest.json');
 const round=await read('batches/B12/rounds/B12-01/round.json');
 const receipt=await read(round.receipt);
 const matrix=await read('matrix.json');
 const sourceText=await readFile(new URL('../../'+round.testPath,import.meta.url),'utf8');
 const ciText=await readFile(new URL('../../.woodpecker/dis-v020-integration.yaml',import.meta.url),'utf8');
 return {batch:'B12',manifest,entry:manifest.rounds[0],round,receipt,matrix,sourceText,ciText};
};
const basePromise=original();
const clone=x=>JSON.parse(JSON.stringify(x));
const rejects=code=>e=>e?.code===code;
test('B13 R59 all B01-B12 genuine 26 native source rounds have consistent 3-context exact stored CI and matrix refs',async()=>{
 const audit=await auditFullDisLedger({stopBefore:'B13'});
 assert.equal(audit.auditedBatches,12);
 assert.equal(audit.auditedRounds,26);
 assert.equal(audit.storedExactCIValid,26);
 assert.equal(new Set(audit.rows.map(x=>x.id)).size,26);
 assert.equal(new Set(audit.rows.map(x=>x.receipt)).size,26);
 assert.equal(audit.rows[0].id,'B01-01');
 assert.equal(audit.rows.at(-1).id,'B12-01');
 assert.ok(audit.rows.some(x=>x.batch==='B09'&&x.sourceHead==='2d96e16942dcff518619b37e4b6c0664ca032ae3'));
 assert.ok(audit.rows.every(x=>x.semanticSAP==='NOT_INFERRED'));
 assert.equal(audit.versionFreezeEligible,false);
 assert.equal(audit.independentSemanticSAP,'NOT_CLAIMED');
 assert.deepEqual({
  coreVerified:audit.coreVerified,corePartial:audit.corePartial,
  optionalNotRun:audit.optionalNotRun,governanceNotRun:audit.governanceNotRun
 },(()=>{
  const coreStates=audit.coreVerified+audit.corePartial;
  assert.equal(coreStates,16);
  return {coreVerified:audit.coreVerified,corePartial:audit.corePartial,optionalNotRun:3,governanceNotRun:1};
 })());
 // R95: O1's R94 PARTIAL transition is the authoritative matrix state (same
 // roster as model-r83 and the R95 review). Witness it explicitly so future
 // optional transitions fail closed until re-witnessed here.
 const {matrix:liveMatrix}=await basePromise;
 assert.deepEqual(liveMatrix.requirements.filter(x=>x.profile==='optional-profile')
  .map(x=>[x.id,x.state]),[['DIS020-OPT-001','PARTIAL'],['DIS020-OPT-002','NOT_RUN'],
  ['DIS020-OPT-003','NOT_RUN'],['DIS020-OPT-004','NOT_RUN']]);
});
test('B13 R59 forged optional-state promotion and stale NOT_RUN demotion cannot satisfy exact ledger counters',async()=>{
 const audit=await auditFullDisLedger({stopBefore:'B13'});
 const exact={coreVerified:audit.coreVerified,corePartial:audit.corePartial,
  optionalNotRun:audit.optionalNotRun,governanceNotRun:audit.governanceNotRun};
 const tally=m=>{const t={coreVerified:0,corePartial:0,optionalNotRun:0,governanceNotRun:0};
  for(const r of m.requirements){
   if(r.profile==='core'&&r.state==='VERIFIED')t.coreVerified++;
   else if(r.profile==='core'&&r.state==='PARTIAL')t.corePartial++;
   else if(r.profile==='optional-profile'&&r.state==='NOT_RUN')t.optionalNotRun++;
   else if(r.profile==='governance'&&r.state==='NOT_RUN')t.governanceNotRun++;
  }return t};
 const {matrix}=await basePromise;
 assert.deepEqual(tally(matrix),exact);
 // Promoting an unrun optional profile silently changes the exact counters.
 const promoted=clone(matrix);
 promoted.requirements.find(x=>x.id==='DIS020-OPT-002').state='PARTIAL';
 assert.notDeepEqual(tally(promoted),exact);
 // The demoted matrix reproduces exactly the stale optionalNotRun:4 snapshot
 // that #2448/1 rejected: a demotion must never satisfy the live counters.
 const demoted=clone(matrix);
 demoted.requirements.find(x=>x.id==='DIS020-OPT-001').state='NOT_RUN';
 assert.notDeepEqual(tally(demoted),exact);
});
test('B13 R59 the previously stale B09 R55 standalone round now agrees with original verified #2312 receipts',async()=>{
 const data=await readFile(new URL('batches/B09/rounds/B09-01/round.json',base),'utf8');
 const r=JSON.parse(data);
 assert.equal(r.status,'VERIFIED');
 assert.equal(r.sourceHead,'2d96e16942dcff518619b37e4b6c0664ca032ae3');
 assert.equal(r.finalTree,'f2d708c797216c94439e8b24d4e011699da266fe');
 assert.equal(r.testGitBlob,'973eaffc13dd059f929a6ee77045fc11ea86ad93');
 assert.equal(r.checks.length,3);
 assert.ok(r.checks.every(x=>x.state==='SUCCESS'));
});
test('B13 R59 fake verified status or historical Git test Blob are rejected before CI attribution',async()=>{
 const a=clone(await basePromise);
 a.round.status='CI_PENDING';
 assert.throws(()=>validateFullRound(a),rejects('FULL_LEDGER_UNQUALIFIED_ROUND'));
 const b=clone(await basePromise);
 b.round.testGitBlob='0'.repeat(40);
 assert.throws(()=>validateFullRound(b),rejects('FULL_LEDGER_ORIGINAL_SOURCE_DRIFT'));
});
test('B13 R59 forged qualifying Source HEAD/TREE, mixed named contexts and duplicate job slots fail closed',async()=>{
 const a=clone(await basePromise);
 a.receipt.source.head='0'.repeat(40);
 assert.throws(()=>validateFullRound(a),rejects('FULL_LEDGER_RECEIPT_SOURCE_DRIFT'));
 const b=clone(await basePromise);
 b.receipt.source.tree='0'.repeat(40);
 assert.throws(()=>validateFullRound(b),rejects('FULL_LEDGER_RECEIPT_SOURCE_DRIFT'));
 const c=clone(await basePromise);
 c.receipt.ci[1].url='https://ci.kaicreator.com/repos/18/pipeline/12345/2';
 c.round.checks=clone(c.receipt.ci);c.entry.checks=clone(c.receipt.ci);
 assert.throws(()=>validateFullRound(c),rejects('FULL_LEDGER_CI_SOURCE_MIXED'));
 const d=clone(await basePromise);
 d.receipt.ci[1].url=d.receipt.ci[0].url;
 d.round.checks=clone(d.receipt.ci);d.entry.checks=clone(d.receipt.ci);
 assert.throws(()=>validateFullRound(d),rejects('FULL_LEDGER_CI_SOURCE_MIXED'));
});
test('B13 R59 missing matrix claim, swapped Function source and unexecuted native test cannot masquerade as proof',async()=>{
 const a=clone(await basePromise);
 a.matrix.receipts=a.matrix.receipts.filter(x=>x!==a.receipt.id);
 assert.throws(()=>validateFullRound(a),rejects('FULL_LEDGER_MATRIX_UNLINKED'));
 const b=clone(await basePromise);
 b.round.originCommit='0'.repeat(40);
 assert.throws(()=>validateFullRound(b),rejects('FULL_LEDGER_ORIGINAL_SOURCE_DRIFT'));
 const c=clone(await basePromise);
 c.ciText='';
 assert.throws(()=>validateFullRound(c),rejects('FULL_LEDGER_TEST_NOT_IN_NATIVE_CI'));
});
