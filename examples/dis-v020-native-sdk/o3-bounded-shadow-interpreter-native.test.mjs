/** O3 R144 real AOT->SDK fixed-grammar data-only rule evaluation; SHADOW_ONLY. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {prepareO3ShadowCandidate} from './o3-shadow-rule.mjs';
import {getO3FixedRuleTechnicalPin,createO3BoundedShadowInterpreter} from './o3-bounded-shadow-interpreter.mjs';

const BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const FUNCTION='xdownload.describePolicy',AOT='a'.repeat(64);
const rule=()=>({schema:'dis.v0.2.o3-shadow-candidate/1',
 functionId:FUNCTION,contractVersion:'1.0.0',sourceGitBlob:BLOB,
 op:'eq',field:'value.domainId',equals:'downloads'});
const pin=getO3FixedRuleTechnicalPin();
const candidate=()=>prepareO3ShadowCandidate(rule());
const observed=(domainId='downloads')=>({
 kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
 contractVersion:'1.0.0',value:{domainId},
 evidence:{attested:false,source:{sourceId:'xdownload-business',gitBlob:BLOB,
  sha256:'b'.repeat(64)}}
});
const mock=(invoke=async()=>observed())=>({
 aotDigest:AOT,functions:[FUNCTION],contractVersions:{[FUNCTION]:'1.0.0'},invoke
});
const make=(app=mock(),opts={})=>createO3BoundedShadowInterpreter({
 app,candidate:candidate(),expectedAotDigest:app.aotDigest,
 expectedRuleDigest:pin.digest,...opts
});
const locked=out=>{
 assert.equal(out.status,'NEED_MORE_EVIDENCE');
 assert.equal(out.scope,'SHADOW_ONLY');
 assert.equal(out.authority,'NONE');
 for(const k of ['qualified','ruleActivated','experienceIssued','effectDispatched','exportAllowed'])
  assert.equal(out[k],false,k);
};

test('O3 selected real AOT/SDK executes fixed equality grammar read-only, never activates a Rule or Effect',async()=>{
 const f=await makeNativeFixture();
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dis-o3-interpreter-r144'});
 try{
  const evaluator=make(app,{maxWaitMs:15000});
  const outcome=await evaluator.evaluateShadowOnly();
  locked(outcome);
  assert.equal(outcome.ruleEvaluated,true);
  assert.equal(outcome.ruleMatched,true);
  assert.equal(outcome.ruleDigest,pin.digest);
  assert.equal(outcome.aotDigest,f.artifact.digest);
  assert.equal(outcome.sourceGitBlob,BLOB);
  assert.equal((await evaluator.evaluateShadowOnly()).reason,'O3_INTERPRETER_BUDGET_EXHAUSTED');
  assert.equal(typeof app.activateLocalRule,'undefined');
 }finally{app.stop()}
});

test('O3 only fixed source-owned DSL equality is executed; a changed observed value is a miss',async()=>{
 const gate=make(mock(async()=>observed('different')));
 const outcome=await gate.evaluateShadowOnly();locked(outcome);
 assert.equal(outcome.ruleEvaluated,true);
 assert.equal(outcome.ruleMatched,false);
 assert.equal(outcome.reason,'O3_RULE_MISS_SHADOW_NOT_QUALIFIED');
});

test('O3 typed selected AOT and original candidate/source digests must match before native dispatch',async()=>{
 let calls=0;const app=mock(async()=>{calls++;return observed()});
 for(const delta of [
  {expectedAotDigest:'c'.repeat(64)},
  {expectedRuleDigest:'d'.repeat(64)},
  {candidate:{...candidate(),qualified:true}},
  {candidate:{...candidate(),digest:'e'.repeat(64)}},
  {maxEvaluations:0},
  {maxWaitMs:0}
 ]){
  assert.throws(()=>make(app,delta),/O3_/);
 }
 assert.throws(()=>prepareO3ShadowCandidate({...rule(),op:'eval'}),/O3_RULE_NOT_SELECTED_OR_UNSAFE/);
 assert.throws(()=>prepareO3ShadowCandidate({...rule(),field:'__proto__'}),/O3_RULE_NOT_SELECTED_OR_UNSAFE/);
 assert.equal(calls,0);
});

test('O3 hostile nested getter and Proxy are rejected without executing user source handlers',async()=>{
 let getterReads=0,proxyTraps=0;
 for(const o of [
  (()=>{const x=observed();Object.defineProperty(x.value,'domainId',{
   enumerable:true,get(){getterReads++;throw Error('FORBIDDEN_ACCESSOR')}});return x})(),
  (()=>{const x=observed();x.evidence.source=new Proxy(x.evidence.source,{
   get(){proxyTraps++;throw Error('FORBIDDEN_PROXY')},
   getPrototypeOf(){proxyTraps++;throw Error('FORBIDDEN_PROXY')}
  });return x})(),
  {...observed(),evidence:{...observed().evidence,attested:true}},
  {...observed(),authority:'KDP'},
  {...observed(),evidence:{...observed().evidence,source:{
   ...observed().evidence.source,gitBlob:'f'.repeat(40)
  }}},
  observed('\u202e'),
 ]){
  const output=await make(mock(async()=>o)).evaluateShadowOnly();
  locked(output);
  assert.equal(output.ruleEvaluated,false);
  assert.equal(output.reason,'O3_NATIVE_SOURCE_OBSERVATION_UNQUALIFIED');
 }
 assert.equal(getterReads,0);
 assert.equal(proxyTraps,0);
});

test('O3 evaluator reserves budget before async selection and in-flight close is fail closed',async()=>{
 let resolveNative,signalEnter;
 const entered=new Promise(resolve=>{signalEnter=resolve});
 const app=mock(()=>{signalEnter();return new Promise(resolve=>{resolveNative=resolve})});
 const gate=make(app,{maxEvaluations:1,maxWaitMs:1000});
 const first=gate.evaluateShadowOnly();
 await entered;
 const second=await gate.evaluateShadowOnly();
 locked(second);
 assert.equal(second.reason,'O3_INTERPRETER_BUDGET_EXHAUSTED');
 gate.close();
 resolveNative(observed());
 const late=await first;locked(late);
 assert.equal(late.reason,'O3_INTERPRETER_CLOSED_DURING_NATIVE');
 assert.equal(late.ruleEvaluated,false);
});

test('O3 hung selected function returns UNKNOWN under budget; caller cannot upgrade',async()=>{
 const gate=make(mock(()=>new Promise(()=>{})),{maxWaitMs:3});
 const output=await gate.evaluateShadowOnly();
 locked(output);
 assert.equal(output.reason,'O3_NATIVE_UNAVAILABLE_OR_TIMEOUT');
 assert.equal(output.ruleEvaluated,false);
});
