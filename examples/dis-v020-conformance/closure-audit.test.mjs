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
 assert.equal(r.totalCore,16);assert.equal(r.verifiedCore+r.partialCore,16);
 assert.equal(r.remaining.length,r.partialCore);
 assert.equal(r.optionalNotRun,4);assert.equal(r.governanceNotRun,1);
 assert.equal(r.formalFreezeEligible,false);
 assert.equal(r.sourceReview.locatorRepair,'OPEN');
 assert.equal(r.sourceReview.sap,'UNQUALIFIED');
 assert.deepEqual(r.remaining.map(x=>x.id),
  matrix.requirements.filter(x=>x.profile==='core'&&x.state==='PARTIAL').map(x=>x.id));
 assert.equal(r.remaining.every(x=>x.positiveCases>0&&x.negativeCases>0),true);
});
test('R68 dynamic Core inventory can count a hypothesized qualified C2 item 10/16 without granting semantic owner authority',()=>{
 const x=clone(baseline),id='DIS020-CORE-003';
 x.matrix.requirements.find(r=>r.id===id).state='VERIFIED';
 const group=x.plan.coreAndGovernance.find(g=>g.group==='C2');
 group.requirementIds=group.requirementIds.filter(x=>x!==id);
 const out=inspectClosure(x);
 assert.equal(out.verifiedCore,
  baseline.matrix.requirements.filter(x=>x.profile==='core'&&x.state==='VERIFIED').length+1);
 assert.equal(out.partialCore,
  baseline.matrix.requirements.filter(x=>x.profile==='core'&&x.state==='PARTIAL').length-1);
 assert.equal(out.remaining.length,out.partialCore);
 assert.equal(out.remaining.some(r=>r.id===id),false);
 assert.equal(out.formalFreezeEligible,false);
 assert.equal(out.sourceReview.sap,'UNQUALIFIED');
});
test('R69 UI-neutral selected Interaction hypothetical closure uses source-derived optional transport scope, not SAP approval',()=>{
 const x=clone(baseline),id='DIS020-CORE-014';
 x.matrix.requirements.find(r=>r.id===id).state='VERIFIED';
 const c3=x.plan.coreAndGovernance.find(g=>g.group==='C3');
 c3.requirementIds=c3.requirementIds.filter(x=>x!==id);
 // This is an in-memory applicability hypothetical only; actual #1496 scope
 // and source receipts remain separately reviewable. No Model-issued authority.
 x.plan.blockers=x.plan.blockers.filter(b=>b.code!=='INTERACTION_REAL_TRANSPORT_SCOPE_UNDECIDED');
 const result=inspectClosure(x);
 assert.equal(result.verifiedCore+result.partialCore,16);
 assert.equal(result.partialCore,x.plan.coreAndGovernance.flatMap(g=>g.requirementIds).filter(id=>id.startsWith('DIS020-CORE-')).length);
 assert.equal(result.remaining.some(x=>x.id===id),false);
 assert.equal(result.sourceReview.sap,'UNQUALIFIED');
 assert.equal(result.formalFreezeEligible,false);
 const blocked=clone(x);blocked.plan.blockers.push({
  code:'INTERACTION_REAL_TRANSPORT_SCOPE_UNDECIDED',
  blocks:['DIS020-CORE-014'],
  requires:'Independent decision missing'
 });
 assert.throws(()=>inspectClosure(blocked),reject('CLOSURE_UNQUALIFIED_TRANSPORT_PROMOTION'));
});
test('R68 a claimed Core promotion without closing its planned normative gap remains fail closed',()=>{
 const x=clone(baseline);
 x.matrix.requirements.find(r=>r.id==='DIS020-CORE-003').state='VERIFIED';
 assert.throws(()=>inspectClosure(x),reject('CLOSURE_DAG_GAP'));
 const y=clone(baseline);y.matrix.requirements.find(r=>r.id==='DIS020-CORE-005').state='VERIFIED';
 y.plan.coreAndGovernance.find(g=>g.group==='C1').requirementIds=
  y.plan.coreAndGovernance.find(g=>g.group==='C1').requirementIds.filter(id=>id!=='DIS020-CORE-005');
 assert.throws(()=>inspectClosure(y),reject('CLOSURE_UNQUALIFIED_SEMANTIC_PROMOTION'));
});
test('B04-02 R42 fake SAP approval or historical reviewer byte substitution is rejected',()=>{
 const r=clone(baseline);r.review.globalSAPQualification='QUALIFIED';
 assert.throws(()=>inspectClosure(r),reject('CLOSURE_SAP_OWNER_AUTHORITY_NOT_PROVEN'));
 const b=clone(baseline);b.proposalBlob='0'.repeat(40);
 assert.throws(()=>inspectClosure(b),reject('CLOSURE_ORIGINAL_SOURCE_BLOB_INVALID'));
});
test('B04-02 R42 Core semantic or Target promotion without actual owner and approved scope is rejected',()=>{
 const r=clone(baseline);r.matrix.requirements.find(x=>x.id==='DIS020-CORE-002').state='VERIFIED';
 assert.throws(()=>inspectClosure(r),reject('CLOSURE_DAG_GAP'));
 const t=clone(baseline);t.matrix.requirements.find(x=>x.id==='DIS020-CORE-008').state='VERIFIED';
 assert.throws(()=>inspectClosure(t),reject('CLOSURE_DAG_GAP'));
});
test('B04-02 R42 skipped dependency, fake governance and incomplete prior round audit fail closed',()=>{
 const r=clone(baseline);r.plan.coreAndGovernance[0].requirementIds.pop();
 assert.throws(()=>inspectClosure(r),reject('CLOSURE_DAG_GAP'));
 const g=clone(baseline);g.matrix.requirements.find(x=>x.id==='DIS020-GOV-001').state='VERIFIED';
 assert.throws(()=>inspectClosure(g),reject('CLOSURE_GOVERNANCE_PREMATURE'));
 const b=clone(baseline);b.batchAudit.auditedRounds=8;
 assert.throws(()=>inspectClosure(b),reject('CLOSURE_BATCH_AUDIT_INCOMPLETE'));
});
