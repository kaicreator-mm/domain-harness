import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCheckedInMatrix,validateVersionMatrix} from './validate.mjs';
import {validateRoundEvidence} from './batch-audit.mjs';
const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const matrix=JSON.parse(await readFile(new URL('matrix.json',base),'utf8'));
const baseline=JSON.parse(await readFile(new URL('receipts/r9.5-baseline.json',base),'utf8'));
const clone=x=>structuredClone(x);
const rejects=code=>e=>e?.code===code;
// R84: the current summary snapshot MUST reflect the machine Matrix.
// Historical per-round progress below the first summary section is preserved.
function assertCurrentSummaryTallies(summary,tallies){
 const top=summary.split('### Normalized Demo plan')[0];
 for(const [label,profile,total] of [['Core','core',16],['Optional profiles','optional-profile',4],['Governance','governance',1]]){
  const match=top.match(new RegExp('^\\| '+label+' \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\|$','m'));
  assert.ok(match,'summary snapshot missing row: '+label);
  const actual=match.slice(1).map(Number);
  const expected=['VERIFIED','PARTIAL','NOT_RUN','OUT_OF_SCOPE']
   .map(status=>tallies[profile+':'+status]??0);
  expected.push(total);
  assert.deepEqual(actual,expected,'summary snapshot drift: '+label);
 }
}
test('current human summary tallies match machine Matrix and reject stale/forged progress',async()=>{
 const {tallies}=await validateCheckedInMatrix();
 const summary=await readFile(new URL('validation-summary.md',base),'utf8');
 assertCurrentSummaryTallies(summary,tallies);
 const tampered=summary.replace(/(^\| Core \| )(\d+)/m,(_,prefix,n)=>prefix+(Number(n)+1));
 assert.notEqual(tampered,summary);
 assert.throws(()=>assertCurrentSummaryTallies(tampered,tallies),/summary snapshot drift/);
});
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
test('R28 old R27 source scope remains bounded even after an independent later CORE003 receipt',async()=>{
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
  assert.equal(r.state,core==='003'?'VERIFIED':'PARTIAL',
   'R27 alone cannot grant Core acceptance; only later independent R79 covers selected Function ABI');
  if(core==='003')assert.ok(r.receiptIds.includes('r79-core003-public-functions-semantic-ci'));
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
test('R79 actual two content-success CI preserves failed Node context and rejects forged Function success',async()=>{
 const id='r79-core003-public-functions-semantic-ci';
 const receipts=Object.fromEntries(await Promise.all(matrix.receipts.map(async rid=>[
  rid,JSON.parse(await readFile(new URL('receipts/'+rid+'.json',base),'utf8'))
 ])));
 const rec=receipts[id];
 assert.equal(rec.qualification,'DIS_SEMANTIC_ONLY');
 assert.equal(rec.source.head,'c1f3fb71e0ab4616ad6bf4c98db9d81275c4dacb');
 assert.equal(rec.source.tree,'0d8329dce7fdc7893c0a7adfa7c90d4e66ab44d3');
 assert.equal(rec.testGitBlob,'a3ea6608d63b1cac274d99aacac2ea444908de10');
 assert.equal(rec.ci.find(x=>x.context==='ci/woodpecker/pr/verify-min-node').state,'FAILURE');
 const verified=await validateVersionMatrix(clone(matrix),receipts);
 assert.equal(verified.tallies['core:VERIFIED'],13);
 assert.equal(verified.tallies['core:PARTIAL'],3);
 assert.equal(matrix.requirements.find(x=>x.id==='DIS020-CORE-003').state,'VERIFIED');
 for(const ctx of ['ci/woodpecker/pr/dis-v020-integration','ci/woodpecker/pr/verify']){
  const tampered=clone(receipts);tampered[id].ci.find(x=>x.context===ctx).state='FAILURE';
  await assert.rejects(validateVersionMatrix(clone(matrix),tampered),rejects('MATRIX_RECEIPT_INVALID'));
 }
});
test('R82 original B22 DKE native source is 3/3 exact SHA qualified and forged CI remains rejected',async()=>{
 const dir=new URL('batches/B22/',base);
 const [manifest,round,receipt,sourceText,ciFile]=await Promise.all([
  readFile(new URL('manifest.json',dir),'utf8').then(JSON.parse),
  readFile(new URL('rounds/B22-01/round.json',dir),'utf8').then(JSON.parse),
  readFile(new URL('receipts/r82-b22-r33-source-native-ci.json',base),'utf8').then(JSON.parse),
  readFile(new URL('../dis-v020-native-sdk/b22-r33-go-triage-native.test.mjs',import.meta.url),'utf8'),
  readFile(new URL('../../.woodpecker/dis-v020-integration.yaml',import.meta.url),'utf8')
 ]);
 const out=validateRoundEvidence({manifest,round,receipt,sourceText,ciFile,matrix});
 assert.equal(out.ci,'STORED_CI_3_OF_3_SUCCESS');
 assert.equal(out.currentBlobMatchesHistorical,true);
 assert.equal(receipt.source.head,'fe2334e63d39a9c006746caad695f7e3c5ade97d');
 assert.equal(receipt.source.tree,'e458b65cb718fd399915d22e0a35ebe8611dc99b');
 assert.equal(receipt.testGitBlob,'a0eb607aeca433109a703b2e699c2eb719f5ed96');
 assert.deepEqual(receipt.ci.map(x=>x.state),['SUCCESS','SUCCESS','SUCCESS']);
 assert.equal(receipt.repairHistory.some(x=>x.pipeline==='#2395'&&x.status==='NOT_QUALIFIED'),true);
 assert.equal(matrix.requirements.find(x=>x.id==='DIS020-CORE-005').state,'PARTIAL');
 const forged=structuredClone(receipt);forged.ci[0].state='FAILURE';
 assert.throws(()=>validateRoundEvidence({manifest,round,receipt:forged,sourceText,ciFile,matrix}),
  e=>e?.code==='BATCH_CI_RECEIPT_INVALID');
});
test('R28 remaining-core closure groups account for seven PARTIAL requirements exactly once',async()=>{
 const plan=JSON.parse(await readFile(new URL('closure-plan-r28.json',base),'utf8'));
 assert.equal(plan.schema,'dis.v0.2.closure-plan/1');
 assert.equal(plan.version,'0.2.0');
 const unfinished=matrix.requirements.filter(x=>x.profile==='core'&&x.state==='PARTIAL')
  .map(x=>x.id).sort();
 // R28 plan baseline 9/7 is historical. The current plan's active
 // unresolved set MUST track the present Matrix, not a frozen round count.
 assert.equal(unfinished.length,
  matrix.requirements.filter(x=>x.profile==='core'&&x.state!=='VERIFIED').length);
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

test('R85 approved C3 Target qualifies CORE-008 with anchored forgery negative, never SAP',async()=>{
 const core=matrix.requirements.find(x=>x.id==='DIS020-CORE-008');
 const plan=JSON.parse(await readFile(new URL('closure-plan-r28.json',base),'utf8'));
 const receipt=JSON.parse(await readFile(new URL('receipts/r85-c3-core008-source-review.json',base),'utf8'));
 assert.equal(core.state,'VERIFIED');
 assert.ok(core.receiptIds.includes('r85-c3-core008-source-review'));
 assert.ok(core.negative.some(x=>x.case==='B05-02 C3 cross-boundary forged selected module roster cannot be rescued by a correct host and full installer source pins'));
 assert.deepEqual(plan.coreAndGovernance.find(x=>x.group==='C3').requirementIds,[]);
 assert.equal(plan.blockers.some(x=>x.code==='TARGET_APPLICABILITY_NOT_APPROVED'),false);
 assert.deepEqual(plan.currentC3.appliesTo,{platform:'linux',architecture:'x64',runtime:'node'});
 assert.equal(receipt.source.head,'989a5858ac1393bdecbf20f0344df9c56a889fa6');
 assert.equal(receipt.authority.originalApprovalGitBlob,'7f0d195849647282fad09a53a117b4f3a705b138');
 assert.deepEqual(receipt.ci.map(x=>x.state),['SUCCESS','SUCCESS','SUCCESS']);
 assert.ok(['DIS020-CORE-002','DIS020-CORE-005'].every(id=>matrix.requirements.find(x=>x.id===id).state==='PARTIAL'));
 const latest=await readFile(new URL('validation-summary.md',base),'utf8');
 assert.match(latest,/\| Core \| 13 \| 3 \| 0 \| 0 \| 16 \|/);
});
