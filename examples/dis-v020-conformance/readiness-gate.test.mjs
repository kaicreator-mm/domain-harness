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
 assert.equal(r.verifiedCore,9);
 assert.equal(r.partialCore,7);
 assert.equal(r.releaseEligible,false);
 assert.equal(r.freezeEligible,false);
 assert.equal(r.mergeEligible,false);
 assert.equal(r.independentSAP,false);
 assert.equal(r.blockers.length,7);
 assert.equal(r.blockers.every(x=>x.structuralEvidenceExists&&x.receiptCount>0),true);
 assert.ok(r.priorTestBlobDriftCount>=1);
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
