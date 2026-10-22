import test from 'node:test';
import assert from 'node:assert/strict';
import * as actualFeatureNamespace from '../modules/sfeature-agent-diagnostics-v1.mjs';
import { analyzeAgentRun, FEATURE_KEY, init } from '../modules/sfeature-agent-diagnostics-v1.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
function event(eventId, seq, status, extra = {}) {
  return { eventId, seq, status, kind: 'VALIDATION', subjectSha: SHA, sourceRef: 'github:run-1', ...extra };
}
function verifier(verifierRef, status = 'PASS', extra = {}) {
  return { verifierRef, sourceRef: 'github:verifier-1', subjectSha: SHA, status, coverage: 'COMPLETE', ...extra };
}
test('v10 activation exact sealed export surface', () => {
  assert.deepEqual(Object.keys(actualFeatureNamespace).sort(),
    ['MODULE_ID','PACKAGE_KIND','FEATURE_ABI','FEATURE_KEY','init','analyzeAgentRun'].sort());
});
test('selected v10 advisory init return is ABI-conformant', () => {
  const result=init({appId:'app:qualified',audience:'aud:qualified'});
  assert.deepEqual(Object.keys(result).sort(), ['ok','featureKey','observedContext'].sort());
  assert.equal(result.ok,true);
  assert.equal(result.featureKey,FEATURE_KEY);
  assert.equal(result.observedContext.appId,'app:qualified');
  assert.equal(Object.hasOwn(result,'appId'),false);
});
test('qualified Standard Feature identity and no K admission authority', () => {
  assert.equal(FEATURE_KEY, 'standard:agent-diagnostics/1');
  assert.equal(init({appId:'app:sample'}).ok, true);
  const x = analyzeAgentRun({subjectSha:SHA, events:[], expectedVerifierRefs:[]});
  assert.equal(x.authority, 'ADVISORY_ONLY');
  assert.equal(x.taskGateVerdict, 'NOT_DETERMINED');
});
test('first observed failure and same-class repeat are candidates, not a causal repair verdict', () => {
  const x = analyzeAgentRun({
    subjectSha:SHA,
    events:[event('f2',3,'FAIL',{failureClass:'invalid-schema',actionFamily:'repair'}),
      event('f1',1,'FAIL',{failureClass:'invalid-schema',actionFamily:'repair'})],
    verifiers:[verifier('v1','FAIL')],
    expectedVerifierRefs:['v1'],
  });
  assert.equal(x.firstFailure.eventId,'f1');
  assert.deepEqual(x.loopCandidates[0].eventIds,['f1','f2']);
  assert.equal(x.taskGateVerdict, 'NOT_DETERMINED');
});
test('green partial verifier or wrong source cannot promote a missing gate', () => {
  const x = analyzeAgentRun({
    subjectSha:SHA, events:[event('e1',1,'PASS',{subjectSha:OTHER})],
    verifiers:[verifier('v1','PASS',{coverage:'PARTIAL'}), verifier('v2','PASS',{subjectSha:OTHER})],
    expectedVerifierRefs:['v1','v2'],
  });
  assert.deepEqual(x.missingVerifierRefs,['v1','v2']);
  assert.deepEqual(x.mismatchedEventIds,['e1']);
  assert.equal(x.taskGateVerdict,'NOT_DETERMINED');
});
test('parallel equal-sequence failures have no fabricated first cause', () => {
  const x = analyzeAgentRun({subjectSha:SHA,events:[event('a',1,'FAIL'),event('b',1,'FAIL')]});
  assert.equal(x.firstFailure,null);
  assert.equal(x.firstFailureAmbiguous,true);
});
test('replayed event id and verifier ref are refused rather than double counted', () => {
  assert.throws(()=>analyzeAgentRun({subjectSha:SHA,events:[event('a',1,'FAIL'),event('a',2,'FAIL')]}),
    {code:'DIAG_EVENT_DUPLICATE'});
  assert.throws(()=>analyzeAgentRun({subjectSha:SHA,events:[],verifiers:[verifier('a'),verifier('a')]}),
    {code:'DIAG_VERIFIER_DUPLICATE'});
});
test('bad inputs, missing source identity, forged authority, accessors and sparse arrays fail closed', () => {
  assert.throws(()=>analyzeAgentRun({subjectSha:'HEAD',events:[]}),{code:'DIAG_SHA_INVALID'});
  assert.throws(()=>analyzeAgentRun({subjectSha:SHA,events:[{...event('x',1,'FAIL'),effectPermit:true}]}),
    {code:'DIAG_RECORD_INVALID'});
  assert.throws(()=>analyzeAgentRun({subjectSha:SHA,events:[{...event('x',1,'FAIL'),sourceRef:'latest'}]}),
    {code:'DIAG_SOURCE_MISSING'});
  const dangerous = { ...event('x',1,'FAIL') };
  Object.defineProperty(dangerous,'sourceRef',{get(){ throw new Error('should not execute'); }});
  assert.throws(()=>analyzeAgentRun({subjectSha:SHA,events:[dangerous]}),{code:'DIAG_RECORD_INVALID'});
  const sparse = new Array(1);
  assert.throws(()=>analyzeAgentRun({subjectSha:SHA,events:sparse}),{code:'DIAG_EVENTS_INVALID'});
});
test('safe observed ACT and unknown/NOT_RUN stay distinct', () => {
  const valid = analyzeAgentRun({subjectSha:SHA,events:[event('good',1,'PASS')],verifiers:[verifier('v')],
    expectedVerifierRefs:['v']});
  assert.deepEqual(valid.missingVerifierRefs,[]);
  assert.equal(valid.taskGateVerdict,'NOT_DETERMINED');
  const unknown=analyzeAgentRun({subjectSha:SHA,events:[event('unknown',1,'UNKNOWN')],
    verifiers:[verifier('v','NOT_RUN')],expectedVerifierRefs:['v']});
  assert.deepEqual(unknown.missingVerifierRefs,['v']);
});
