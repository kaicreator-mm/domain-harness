import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCandidateEvidence,FEATURE_KEY,init} from '../modules/sfeature-candidate-evaluation-v1.mjs';
const A='a'.repeat(40),B='b'.repeat(40);
const c=(caseId,subjectSha,status,extras={})=>({
  caseId,subjectSha,status,sourceRef:'verifier:evidence1',verifierRef:'v1',coverage:'COMPLETE',...extras
});
const checks=(status='PASS')=>['POSITIVE','NEGATIVE','INDEPENDENT'].map(
  kind=>({kind,status,sourceRef:'github:oracle:'+kind})
);
const item=(extras={})=>({
  baselineSha:A,candidateSha:B,verifierRevision:'r1',holdoutVisibility:'ISOLATED',
  oracleChecks:checks(),baseline:[c('t1',A,'FAIL'),c('t2',A,'PASS')],
  candidate:[c('t1',B,'PASS'),c('t2',B,'PASS')],...extras
});
test('selected v10 advisory init return is ABI-conformant', () => {
  const result=init({appId:'app:qualified',audience:'aud:qualified'});
  assert.deepEqual(Object.keys(result).sort(), ['ok','featureKey','observedContext'].sort());
  assert.equal(result.ok,true);
  assert.equal(result.featureKey,FEATURE_KEY);
  assert.equal(result.observedContext.appId,'app:qualified');
  assert.equal(Object.hasOwn(result,'appId'),false);
});
test('selected SDK identity and non-authoritative comparison',()=>{
  assert.equal(FEATURE_KEY,'standard:candidate-evaluation/1');
  assert.equal(init({appId:'app:test'}).ok,true);
  const x=evaluateCandidateEvidence(item());
  assert.equal(x.disposition,'PROVISIONALLY_COMPARABLE');
  assert.equal(x.observedDifference.passDifference,1);
  assert.equal(x.taskGateVerdict,'NOT_DETERMINED');
});
test('leaked holdout prevents winning score',()=>{
  const x=evaluateCandidateEvidence(item({holdoutVisibility:'LEAKED'}));
  assert.equal(x.disposition,'INVALID_EVALUATION');
  assert.equal(x.observedDifference,null);
});
test('unknown holdout or missing negative oracle never creates qualified claim',()=>{
  assert.equal(evaluateCandidateEvidence(item({holdoutVisibility:'UNKNOWN'})).disposition,'INCONCLUSIVE');
  assert.equal(evaluateCandidateEvidence(item({oracleChecks:checks().filter(x=>x.kind!=='NEGATIVE')})).disposition,'INCONCLUSIVE');
});
test('a failed negative oracle invalidates comparison',()=>{
  const broken=checks().map(x=>x.kind==='NEGATIVE'?{...x,status:'FAIL'}:x);
  assert.equal(evaluateCandidateEvidence(item({oracleChecks:broken})).disposition,'INVALID_EVALUATION');
});
test('stale subject, partial verifier or unequal cohorts remain unknown',()=>{
  const mismatched=evaluateCandidateEvidence(item({candidate:[c('t1',A,'PASS'),c('t2',B,'PASS')]}));
  assert.equal(mismatched.disposition,'INCONCLUSIVE');
  const partial=evaluateCandidateEvidence(item({candidate:[c('t1',B,'PASS',{coverage:'PARTIAL'}),c('t2',B,'PASS')]}));
  assert.equal(partial.observedDifference,null);
  assert.deepEqual(partial.incompleteCaseIds,['t1']);
  const missing=evaluateCandidateEvidence(item({candidate:[c('t1',B,'PASS')]}));
  assert.deepEqual(missing.incompleteCaseIds,['t2']);
});
test('invalid identities, duplicate evaluator outcomes and authority smuggling refuse',()=>{
  assert.throws(()=>evaluateCandidateEvidence(item({baselineSha:'HEAD'})),{code:'EVAL_SHA_INVALID'});
  assert.throws(()=>evaluateCandidateEvidence(item({candidate:[c('x',B,'PASS'),c('x',B,'PASS')]})),
    {code:'EVAL_CASE_DUPLICATE'});
  assert.throws(()=>evaluateCandidateEvidence(item({candidate:[{...c('x',B,'PASS'),effectPermit:true}]})),
    {code:'EVAL_RECORD_INVALID'});
  const getter={...item()};Object.defineProperty(getter,'baseline',{get(){throw Error('should not execute');}});
  assert.throws(()=>evaluateCandidateEvidence(getter),{code:'EVAL_RECORD_INVALID'});
});
