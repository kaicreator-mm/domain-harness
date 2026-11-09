import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectClosure,inspectCheckedInClosure} from './closure-audit.mjs';
const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const matrix=await read('matrix.json'),plan=await read('closure-plan-r28.json');
const review=JSON.parse(await readFile(new URL('../dis-v020-native-sdk/fixtures/dke-r29-source-first-review.json',import.meta.url),'utf8'));
const proposal=JSON.parse(await readFile(new URL('../dis-v020-native-sdk/fixtures/dke-r29-gh-locator-proposal.json',import.meta.url),'utf8'));
const baseline={matrix,plan,review,proposal,
 reviewBlob:'0b7d514cc297a07952b2cd536c2dafd3e47bda45',
 proposalBlob:'9dc978f5138c561efabe503f254e565aa5f5700a',
 batchAudit:{auditedRounds:9,recordedCIValid:9}};
const reject=code=>error=>error?.code===code;
const clone=structuredClone;
test('B04-02 R42 exact historical source ledger and 21 requirement DAG leave 7 substantive Core blockers',async()=>{
 const r=await inspectCheckedInClosure();
 assert.equal(r.totalCore,16);assert.equal(r.verifiedCore,9);assert.equal(r.partialCore,7);
 assert.equal(r.optionalNotRun,4);assert.equal(r.governanceNotRun,1);
 assert.equal(r.formalFreezeEligible,false);
 assert.equal(r.sourceReview.locatorRepair,'OPEN');
 assert.equal(r.sourceReview.sap,'UNQUALIFIED');
 assert.deepEqual(r.remaining.map(x=>x.id),[
  'DIS020-CORE-002','DIS020-CORE-003','DIS020-CORE-005',
  'DIS020-CORE-006','DIS020-CORE-008','DIS020-CORE-014','DIS020-CORE-016'
 ]);
 assert.equal(r.remaining.every(x=>x.positiveCases>0&&x.negativeCases>0),true);
});
test('B04-02 R42 fake SAP approval or historical reviewer byte substitution is rejected',()=>{
 const r=clone(baseline);r.review.globalSAPQualification='QUALIFIED';
 assert.throws(()=>inspectClosure(r),reject('CLOSURE_SAP_OWNER_AUTHORITY_NOT_PROVEN'));
 const b=clone(baseline);b.proposalBlob='0'.repeat(40);
 assert.throws(()=>inspectClosure(b),reject('CLOSURE_ORIGINAL_SOURCE_BLOB_INVALID'));
});
test('B04-02 R42 Core semantic or Target promotion without actual owner and approved scope is rejected',()=>{
 const r=clone(baseline);r.matrix.requirements.find(x=>x.id==='DIS020-CORE-002').state='VERIFIED';
 assert.throws(()=>inspectClosure(r),reject('CLOSURE_UNEXPECTED_CORE_STATE'));
 const t=clone(baseline);t.matrix.requirements.find(x=>x.id==='DIS020-CORE-008').state='VERIFIED';
 assert.throws(()=>inspectClosure(t),reject('CLOSURE_UNEXPECTED_CORE_STATE'));
});
test('B04-02 R42 skipped dependency, fake governance and incomplete prior round audit fail closed',()=>{
 const r=clone(baseline);r.plan.coreAndGovernance[0].requirementIds.pop();
 assert.throws(()=>inspectClosure(r),reject('CLOSURE_DAG_GAP'));
 const g=clone(baseline);g.matrix.requirements.find(x=>x.id==='DIS020-GOV-001').state='VERIFIED';
 assert.throws(()=>inspectClosure(g),reject('CLOSURE_GOVERNANCE_PREMATURE'));
 const b=clone(baseline);b.batchAudit.auditedRounds=8;
 assert.throws(()=>inspectClosure(b),reject('CLOSURE_BATCH_AUDIT_INCOMPLETE'));
});
