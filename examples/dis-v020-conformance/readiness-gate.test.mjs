import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCheckedInClosure} from './closure-audit.mjs';
import {auditCheckedInBatches} from './batch-audit.mjs';
import {decideB04Readiness,inspectCheckedInReadiness} from './readiness-gate.mjs';
const reject=code=>error=>error?.code===code;
const clone=structuredClone;
test('B04-03 R43 source-real C4 ledger says no auto Freeze Merge or Release with seven Core blockers',async()=>{
 const r=await inspectCheckedInReadiness();
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.roundsAudited,9);
 assert.equal(r.verifiedCore+r.partialCore,16);
 assert.equal(r.releaseEligible,false);
 assert.equal(r.freezeEligible,false);
 assert.equal(r.mergeEligible,false);
 assert.equal(r.independentSAP,false);
 assert.equal(r.blockers.length,r.partialCore);
 assert.equal(r.blockers.every(x=>x.structuralEvidenceExists&&x.receiptCount>0),true);
 assert.ok(r.priorTestBlobDriftCount>=1);
});
test('R68 dynamic readiness accepts 10/16 progress as inventory but still denies Freeze, merge and unauthorized approval',async()=>{
 const [snapshot,audit]=await Promise.all([inspectCheckedInClosure(),auditCheckedInBatches()]);
 const c=clone(snapshot);
 c.verifiedCore++;c.partialCore--;c.remaining=c.remaining.filter(r=>r.id!=='DIS020-CORE-003');
 const result=decideB04Readiness({closure:c,sourceAudit:audit});
 assert.equal(result.verifiedCore,c.verifiedCore);assert.equal(result.partialCore,c.partialCore);
 assert.equal(result.blockers.length,c.partialCore);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.freezeEligible,false);
 assert.equal(result.mergeEligible,false);
 assert.equal(result.independentSAP,false);
});
test('R70 repeated future Core closure counts 9-to-16 are not frozen by old readiness snapshots',async()=>{
 const [snapshot,audit]=await Promise.all([inspectCheckedInClosure(),auditCheckedInBatches()]);
 const remaining=snapshot.remaining.map(x=>x.id);
 for(let extra=0;extra<=remaining.length;extra++){
  const c=clone(snapshot);
  c.verifiedCore+=extra;c.partialCore-=extra;
  c.remaining=c.remaining.filter(x=>!remaining.slice(0,extra).includes(x.id));
  const actual=decideB04Readiness({closure:c,sourceAudit:audit});
  assert.equal(actual.verifiedCore,c.verifiedCore);
  assert.equal(actual.partialCore,c.partialCore);
  assert.equal(actual.blockers.length,c.partialCore);
  assert.equal(actual.independentSAP,false);
  assert.equal(actual.freezeEligible,false);
  assert.equal(actual.mergeEligible,false);
  assert.equal(actual.releaseEligible,false);
 }
});
test('B04-03 R43 a user or LLM-supplied self-attested independent review cannot grant release',async()=>{
 const [closure,sourceAudit]=await Promise.all([inspectCheckedInClosure(),auditCheckedInBatches()]);
 assert.throws(()=>decideB04Readiness({closure,sourceAudit,claimedApproval:{sourceOwner:'accepted',independentSAP:true}}),
  reject('READINESS_UNVERIFIED_APPROVAL'));
});
test('B04-03 R43 forged C4 finalization and incomplete historical exact-SHA audit are denied',async()=>{
 const [original,sourceAudit]=await Promise.all([inspectCheckedInClosure(),auditCheckedInBatches()]);
 const fake=clone(original);fake.formalFreezeEligible=true;
 assert.throws(()=>decideB04Readiness({closure:fake,sourceAudit}),reject('READINESS_PREMATURE_CLOSURE'));
 const absent=clone(sourceAudit);absent.recordedCIValid=8;
 assert.throws(()=>decideB04Readiness({closure:original,sourceAudit:absent}),
  reject('READINESS_ROUND_AUDIT_INCOMPLETE'));
});
