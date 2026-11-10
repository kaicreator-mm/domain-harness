import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCheckedInMatrix,validateVersionMatrix} from './validate.mjs';
const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const matrix=JSON.parse(await readFile(new URL('matrix.json',base),'utf8'));
const baseline=JSON.parse(await readFile(new URL('receipts/r9.5-baseline.json',base),'utf8'));
const clone=x=>structuredClone(x);
const rejects=code=>e=>e?.code===code;
test('version matrix accounts for all 16 core requirements without inventing an unrun gap',async()=>{
 const result=await validateCheckedInMatrix();
 assert.equal(result.requirements,21);
 const core=['VERIFIED','PARTIAL','NOT_RUN','OUT_OF_SCOPE']
   .reduce((n,s)=>n+(result.tallies['core:'+s]??0),0);
 assert.equal(core,16);
 assert.ok((result.tallies['core:PARTIAL']??0)+(result.tallies['core:NOT_RUN']??0)>0);
 assert.ok((result.tallies['optional-profile:NOT_RUN']??0)>0);
});
test('machine validator rejects a VERIFIED requirement without positive or negative proof',async()=>{
 const v=clone(matrix);v.requirements[0].negative=[];
 await assert.rejects(validateVersionMatrix(v,{'r9.5-baseline':baseline}),rejects('MATRIX_UNSUPPORTED_VERIFIED'));
});
test('machine validator rejects a claimed old PASS with a missing or failed receipt',async()=>{
 const receipts={'r9.5-baseline':{...baseline,status:'FAIL'}};
 await assert.rejects(validateVersionMatrix(clone(matrix),receipts),rejects('MATRIX_RECEIPT_INVALID'));
});
test('machine validator rejects invented test names or silently changed required scope',async()=>{
 const v=clone(matrix);v.requirements[0].positive[0].case='fictional non-existent native proof';
 await assert.rejects(validateVersionMatrix(v,{'r9.5-baseline':baseline}),rejects('MATRIX_CASE_NOT_FOUND'));
});
// R64 regression: the R63 closeout once appended free-text summary rows to
// CORE-016 evidence; prose without a runnable {path,case} anchor must stay
// fail-closed instead of silently counting as machine-checkable proof.
test('machine validator rejects free-text evidence rows without path and case anchors',async()=>{
 const receipts=Object.fromEntries(await Promise.all(matrix.receipts.map(async rid=>[
  rid,JSON.parse(await readFile(new URL('receipts/'+rid+'.json',base),'utf8'))
 ])));
 const v=clone(matrix);
 v.requirements.find(x=>x.id==='DIS020-CORE-016').positive
   .push('R63 prose summary of a historical ledger replay without a runnable test anchor');
 await assert.rejects(validateVersionMatrix(v,receipts),rejects('MATRIX_CASE_INVALID'));
});
test('version conformance is incomplete until all applicable MUST requirements are verified',async()=>{
 const r=await validateCheckedInMatrix();
 const complete=!(r.tallies['core:PARTIAL']||r.tallies['core:NOT_RUN']);
 assert.equal(complete,false);
});

test('blocked R11 integration receipt cannot qualify a VERIFIED requirement',async()=>{
 const blocked=JSON.parse(await readFile(new URL('receipts/r11-integration-blocked.json',base),'utf8'));
 const v=clone(matrix);
 v.requirements[0].receiptIds=['r11-integration-blocked'];
 await assert.rejects(validateVersionMatrix(v,{'r11-integration-blocked':blocked}),rejects('MATRIX_RECEIPT_INVALID'));
});

// R21: content-scoped receipt keeps a real engine CI error visible without
// allowing either native integration or generic verification to be skipped.
test('R21 semantic receipt permits engine-only ERROR but fails closed on native and general content checks',async()=>{
 const id='r21-native-dke-semantic-ci';
 const receipts=Object.fromEntries(await Promise.all(matrix.receipts.map(async rid=>[
  rid,JSON.parse(await readFile(new URL('receipts/'+rid+'.json',base),'utf8'))
 ])));
 assert.equal(receipts[id].qualification,'DIS_SEMANTIC_ONLY');
 assert.equal(receipts[id].ci.find(x=>x.context==='ci/woodpecker/pr/verify-min-node').state,'ERROR');
 const valid=await validateVersionMatrix(clone(matrix),receipts);
 assert.equal(valid.requirements,21);
 for(const context of ['ci/woodpecker/pr/dis-v020-integration','ci/woodpecker/pr/verify']){
  const forged=clone(receipts);
  forged[id].ci.find(x=>x.context===context).state='FAILURE';
  await assert.rejects(validateVersionMatrix(clone(matrix),forged),rejects('MATRIX_RECEIPT_INVALID'));
 }
});


// R28: audited exact-SHA R27 Woodpecker result becomes machine-checkable
// evidence without promoting the incomplete SAP/Oracle Core requirement.
test('R28 R27 exact-source native receipt is referenced only as bounded PARTIAL evidence',async()=>{
 const id='r27-native-impact-ci';
 assert.ok(matrix.receipts.includes(id));
 const receipts=Object.fromEntries(await Promise.all(matrix.receipts.map(async rid=>[
  rid,JSON.parse(await readFile(new URL('receipts/'+rid+'.json',base),'utf8'))
 ])));
 const receipt=receipts[id];
 assert.equal(receipt.status,'SUCCESS');
 assert.equal(receipt.source.head,'349b58f985970aeeaf77621a4451154e4cd6a353');
 assert.equal(receipt.source.tree,'d310878eeb2127adbfc4fa9d2bb368446e6d203b');
 assert.deepEqual(receipt.ci.map(x=>x.context).sort(),[
  'ci/woodpecker/pr/dis-v020-integration',
  'ci/woodpecker/pr/verify',
  'ci/woodpecker/pr/verify-min-node'
 ]);
 assert.ok(receipt.ci.every(x=>x.state==='SUCCESS'));
 for(const core of ['003','005','016']){
  const r=matrix.requirements.find(x=>x.id==='DIS020-CORE-'+core);
  assert.equal(r.state,'PARTIAL','R27 scoped evidence is not full DIS Core acceptance');
  assert.ok(r.receiptIds.includes(id));
  assert.ok(r.positive.some(x=>x.case.startsWith('R27 actual Tally 14-record')));
  assert.ok(r.negative.some(x=>x.case.startsWith('R27 false SAP approval')));
 }
 assert.equal((await validateVersionMatrix(clone(matrix),receipts)).requirements,21);
 const forged=clone(receipts);
 forged[id].ci.find(x=>x.context==='ci/woodpecker/pr/dis-v020-integration').state='FAILURE';
 await assert.rejects(validateVersionMatrix(clone(matrix),forged),rejects('MATRIX_RECEIPT_INVALID'));
 const wrong=clone(matrix);
 wrong.requirements.find(x=>x.id==='DIS020-CORE-005').negative
  .find(x=>x.case.startsWith('R27 false SAP approval')).case='fictional R27 native failure';
 await assert.rejects(validateVersionMatrix(wrong,receipts),rejects('MATRIX_CASE_NOT_FOUND'));
});
test('R28 remaining-core closure groups account for seven PARTIAL requirements exactly once',async()=>{
 const plan=JSON.parse(await readFile(new URL('closure-plan-r28.json',base),'utf8'));
 assert.equal(plan.schema,'dis.v0.2.closure-plan/1');
 assert.equal(plan.version,'0.2.0');
 const unfinished=matrix.requirements.filter(x=>x.profile==='core'&&x.state==='PARTIAL')
  .map(x=>x.id).sort();
 assert.equal(unfinished.length,7);
 const planned=plan.coreAndGovernance.flatMap(g=>g.requirementIds)
  .filter(x=>x.startsWith('DIS020-CORE-')).sort();
 assert.deepEqual(planned,unfinished);
 assert.equal(new Set(planned).size,unfinished.length);
 const optional=matrix.requirements.filter(x=>x.profile==='optional-profile'&&x.state==='NOT_RUN')
  .map(x=>x.id).sort();
 assert.deepEqual(plan.optionalProfiles.flatMap(g=>g.requirementIds).sort(),optional);
 assert.deepEqual(plan.coreAndGovernance.flatMap(g=>g.requirementIds)
  .filter(x=>x.startsWith('DIS020-GOV-')),['DIS020-GOV-001']);
 assert.equal(plan.baseline.coreVerified,9);
 assert.equal(plan.baseline.corePartial,7);
 assert.deepEqual(plan.estimates.coreAndGovernancePracticalRange,[5,8]);
 assert.deepEqual(plan.estimates.allProfilesAndGovernancePracticalRange,[7,12]);
 assert.equal(plan.scopeProtection.coreStatesNotPromoted,true);
 assert.equal(plan.scopeProtection.noFreeze,true);
});
