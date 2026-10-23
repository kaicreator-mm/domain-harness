import test from 'node:test';
import assert from 'node:assert/strict';
import * as actualFeatureNamespace from '../modules/sfeature-experience-reuse-v1.mjs';
import {assessExperienceApplicability,FEATURE_KEY,init} from '../modules/sfeature-experience-reuse-v1.mjs';
const A='a'.repeat(40),B='b'.repeat(40);
const current={projectId:'project:p',taskClass:'class:repair',subjectSha:A,ruleRevision:'ads@sha123'};
const candidate=(more={})=>({
  candidateId:'exp:1',candidateSha:A,sourceRef:'github:report:1',
  projectId:'project:p',taskClass:'class:repair',ruleRevision:'ads@sha123',
  evidence:'INDEPENDENT_PASS',counterexampleRefs:[],...more
});
const run=candidates=>assessExperienceApplicability({current,candidates});
test('v10 activation exact sealed export surface', () => {
  assert.deepEqual(Object.keys(actualFeatureNamespace).sort(),
    ['MODULE_ID','PACKAGE_KIND','FEATURE_ABI','FEATURE_KEY','init','assessExperienceApplicability'].sort());
});
test('selected v10 advisory init return is ABI-conformant', () => {
  const result=init({appId:'app:qualified',audience:'aud:qualified'});
  assert.deepEqual(Object.keys(result).sort(), ['ok','featureKey','observedContext'].sort());
  assert.equal(result.ok,true);
  assert.equal(result.featureKey,FEATURE_KEY);
  assert.equal(result.observedContext.appId,'app:qualified');
  assert.equal(Object.hasOwn(result,'appId'),false);
});
test('valid independent evidence is only a review candidate, no adoption',()=>{
  assert.equal(FEATURE_KEY,'standard:experience-reuse/1');
  assert.equal(init({appId:'app:p'}).ok,true);
  const r=run([candidate()]);
  assert.equal(r.reviewCandidates[0].classification,'REVIEW_CANDIDATE_ONLY');
  assert.equal(r.adoptionVerdict,'NOT_DETERMINED');
});
test('stale source without compatibility evidence is uncertain',()=>{
  const r=run([candidate({candidateSha:B})]);
  assert.deepEqual(r.uncertain[0].reasons,['SOURCE_COMPATIBILITY_UNKNOWN']);
});
test('stale source with arbitrary compatibilityRef remains uncertain (#1297)',()=>{
  const r=run([candidate({candidateSha:B,compatibilityRef:'arbitrary-string'})]);
  assert.equal(r.reviewCandidates.length,0);
  assert.equal(r.uncertain.length,1);
  assert.deepEqual(r.uncertain[0].reasons,['SOURCE_COMPATIBILITY_UNKNOWN']);
  assert.equal(r.uncertain[0].compatibilityRef,'arbitrary-string');
});
test('stale source with claimed verified ref still needs source-qualified proof (#1297)',()=>{
  const r=run([candidate({candidateSha:B,compatibilityRef:'github:verified-by-me'})]);
  assert.equal(r.reviewCandidates.length,0);
  assert.equal(r.uncertain[0].reasons[0],'SOURCE_COMPATIBILITY_UNKNOWN');
  assert.equal(r.adoptionVerdict,'NOT_DETERMINED');
});
test('cross project, rule conflict, and negative examples reject',()=>{
  const r=run([candidate({candidateId:'one',projectId:'other'}),
    candidate({candidateId:'two',ruleRevision:'stale'}),
    candidate({candidateId:'three',counterexampleRefs:['github:negative']})]);
  assert.equal(r.notApplicable.length,3);
  assert.equal(r.reviewCandidates.length,0);
});
test('duplicate identity fails closed even if evidence appears valid',()=>{
  const r=run([candidate(),candidate({sourceRef:'github:report:2'})]);
  assert.equal(r.notApplicable.length,2);
  assert.equal(r.notApplicable[0].reasons[0],'DUPLICATE_CANDIDATE_IDENTITY');
});
test('unverified claim and unknown are never eligible',()=>{
  const r=run([candidate({evidence:'CLAIMED'})]);
  assert.equal(r.uncertain.length,1);
  assert.equal(r.reviewCandidates.length,0);
});
test('wrong ref, privileged fields, accessor and sparse list refuse',()=>{
  assert.throws(()=>run([candidate({candidateSha:'HEAD'})]),{code:'EXP_SHA_INVALID'});
  assert.throws(()=>run([candidate({effectPermit:true})]),{code:'EXP_RECORD_INVALID'});
  const d={...candidate()};Object.defineProperty(d,'sourceRef',{get(){throw Error('getter');}});
  assert.throws(()=>run([d]),{code:'EXP_RECORD_INVALID'});
  assert.throws(()=>run(new Array(1)),{code:'EXP_LIST_INVALID'});
});
