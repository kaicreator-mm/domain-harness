import test from 'node:test';
import assert from 'node:assert/strict';
import * as actualFeatureNamespace from '../modules/sfeature-bounded-experiment-v1.mjs';
import {planBoundedExperiment,FEATURE_KEY,init} from '../modules/sfeature-bounded-experiment-v1.mjs';
const SHA='a'.repeat(40);
const base={
  proposalId:'experiment:one',subjectSha:SHA,baselineRef:'candidate:base',
  candidateRef:'candidate:next',hypothesisRef:'github:hypothesis',
  environment:'SHADOW',risk:'LOW',isolationEvidenceRef:'host:isolated-plan',
  maxProbeCalls:3,maxWallMs:30000,maxCostMicro:1000000,
  verifierRefs:['github:verifier'],effectPolicy:'DENY_EXTERNAL_EFFECTS',
};
test('v10 activation exact sealed export surface', () => {
  assert.deepEqual(Object.keys(actualFeatureNamespace).sort(),
    ['MODULE_ID','PACKAGE_KIND','FEATURE_ABI','FEATURE_KEY','init','planBoundedExperiment'].sort());
});
test('selected v10 advisory init return is ABI-conformant', () => {
  const result=init({appId:'app:qualified',audience:'aud:qualified'});
  assert.deepEqual(Object.keys(result).sort(), ['ok','featureKey','observedContext'].sort());
  assert.equal(result.ok,true);
  assert.equal(result.featureKey,FEATURE_KEY);
  assert.equal(result.observedContext.appId,'app:qualified');
  assert.equal(Object.hasOwn(result,'appId'),false);
});
test('valid safe bounded plan is not executed or admitted by K',()=>{
  assert.equal(FEATURE_KEY,'standard:bounded-experiment/1');
  assert.equal(init({appId:'app:sample'}).ok,true);
  const p=planBoundedExperiment(base);
  assert.equal(p.disposition,'READY_FOR_SEPARATE_ADMISSION');
  assert.equal(p.executionOccurred,false);
  assert.equal(p.physicalIsolationVerified,false);
  assert.equal(p.constraints.allowedEffectCount,0);
  assert.equal(p.taskGateVerdict,'NOT_DETERMINED');
});
test('production and unproven isolation never ready, even with low risk',()=>{
  assert.equal(planBoundedExperiment({...base,environment:'PRODUCTION'}).disposition,
    'NOT_ADMISSIBLE_AS_WRITTEN');
  const p=planBoundedExperiment({...base,isolationEvidenceRef:undefined});
  assert.equal(p.disposition,'NOT_ADMISSIBLE_AS_WRITTEN');
  assert(p.blockers.includes('ISOLATION_NOT_ESTABLISHED'));
});
test('missing verifier plan produces explicit blocker',()=>{
  const p=planBoundedExperiment({...base,verifierRefs:[]});
  assert(p.blockers.includes('NO_VERIFIER_PLAN'));
});
test('no independent contrast, unbounded budget, duplicate verifier refuse',()=>{
  assert.throws(()=>planBoundedExperiment({...base,candidateRef:base.baselineRef}),
    {code:'EXPERIMENT_NO_CONTRAST'});
  assert.throws(()=>planBoundedExperiment({...base,maxProbeCalls:1000}),
    {code:'EXPERIMENT_BUDGET_INVALID'});
  assert.throws(()=>planBoundedExperiment({...base,verifierRefs:['a','a']}),
    {code:'EXPERIMENT_VERIFIER_DUPLICATE'});
});
test('no effect permissions, latest SHA, prototype pollution or accessors',()=>{
  assert.throws(()=>planBoundedExperiment({...base,effectPolicy:'ALLOW_PRODUCTION'}),
    {code:'EXPERIMENT_EFFECT_POLICY_INVALID'});
  assert.throws(()=>planBoundedExperiment({...base,subjectSha:'HEAD'}),
    {code:'EXPERIMENT_SHA_INVALID'});
  assert.throws(()=>planBoundedExperiment({...base,effectPermit:true}),
    {code:'EXPERIMENT_RECORD_INVALID'});
  const p={...base};Object.defineProperty(p,'baselineRef',{get(){throw Error('should not execute');}});
  assert.throws(()=>planBoundedExperiment(p),{code:'EXPERIMENT_RECORD_INVALID'});
});
