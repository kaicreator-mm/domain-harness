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
test('R71 CORE-006 source-selected Rule, Knowledge and Domain-owned PROCESS_LOCAL state are original-source qualified without fictitious durable KDP recovery',()=>{
 const x=matrix.requirements.find(r=>r.id==='DIS020-CORE-006');
 assert.equal(x.state,'VERIFIED');
 for(const receipt of ["r33-b01-state-ci","r46-b05-target-original-consumer-ci","r54-b08-real-dke-knowledge-consumer-ci","r58-b12-runx-physical-process-state-ci"])assert.ok(x.receiptIds.includes(receipt));
 for(const name of ["B01-02 R33 real Runx Stateful handles isolate each invocation, source and process-local ownership","B01-02 R33 Domain-owned Stateful presence does not mutate Tally Rule or xDownload Knowledge outputs","B05-03 R46 real host original Tally Rule xDownload Knowledge Runx Stateful and KDP admission compose without business authority","B12 R58 original Runx Stateful local presence does NOT auto-resurrect through second Node process with same physical KDP SQLite file"])assert.ok(x.positive.some(v=>v.case===name));
 for(const name of ["B01-02 R33 source-real Runx token mismatch cannot create presence or grant lease","B08-01 R54 producer DKE JSON source is selectable only as DATA, never executable LOCAL or unsafe docs path","B12 R58 forged Runx agent token cannot put a fake execution lease into the physical KDP or Runx owner map"])assert.ok(x.negative.some(v=>v.case===name));
 assert.equal(x.note.includes('general arbitrary producer semantic truth and application-specific durable-state promises are NOT qualified'),true);
 assert.ok(!plan.coreAndGovernance.flatMap(g=>g.requirementIds).includes(x.id));
 const review=inspectClosure(clone(baseline));
 assert.equal(review.verifiedCore+review.partialCore,16);
 assert.equal(review.remaining.some(r=>r.id===x.id),false);
 assert.equal(review.formalFreezeEligible,false);
 assert.equal(review.sourceReview.sap,'UNQUALIFIED');
});
test('R79 actual C2 selected Function closure is counted without independent semantic SAP or Freeze',()=>{
 const out=inspectClosure(clone(baseline));
 assert.equal(matrix.requirements.find(x=>x.id==='DIS020-CORE-003').state,'VERIFIED');
 assert.equal(out.verifiedCore+out.partialCore,16);
 assert.equal(out.verifiedCore,matrix.requirements.filter(x=>x.profile==='core'&&x.state==='VERIFIED').length);
 assert.equal(out.remaining.some(x=>x.id==='DIS020-CORE-003'),false);
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
 x.matrix.requirements.find(r=>r.id==='DIS020-CORE-016').state='VERIFIED';
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
 const t=clone(baseline);t.plan.currentC3.productAcceptanceUrl='https://github.com/forged/owner';
 assert.throws(()=>inspectClosure(t),reject('CLOSURE_UNQUALIFIED_TARGET_PROMOTION'));
 const u=clone(baseline);u.plan.currentC3.appliesTo.platform='windows';
 assert.throws(()=>inspectClosure(u),reject('CLOSURE_UNQUALIFIED_TARGET_PROMOTION'));
});
test('B04-02 R42 skipped dependency, fake governance and incomplete prior round audit fail closed',()=>{
 const r=clone(baseline);r.plan.coreAndGovernance[0].requirementIds.pop();
 assert.throws(()=>inspectClosure(r),reject('CLOSURE_DAG_GAP'));
 const g=clone(baseline);g.matrix.requirements.find(x=>x.id==='DIS020-GOV-001').state='VERIFIED';
 assert.throws(()=>inspectClosure(g),reject('CLOSURE_GOVERNANCE_PREMATURE'));
 const b=clone(baseline);b.batchAudit.auditedRounds=8;
 assert.throws(()=>inspectClosure(b),reject('CLOSURE_BATCH_AUDIT_INCOMPLETE'));
});
