/** O3 candidate Shadow-only boundaries: no runtime installation or activation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareO3ShadowCandidate,makeO3Shadow} from './o3-shadow-rule.mjs';
const blob='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const candidate=()=>({schema:'dis.v0.2.o3-shadow-candidate/1',functionId:'xdownload.describePolicy',
 contractVersion:'1.0.0',sourceGitBlob:blob,op:'eq',field:'value.domainId',equals:'downloads'});
const observation=()=>({kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
 contractVersion:'1.0.0',value:{domainId:'downloads'},evidence:{attested:false,
 source:{sourceId:'xdownload-business',sha256:'a'.repeat(64),gitBlob:blob}}});
const app=(obs=observation())=>({functions:['xdownload.describePolicy'],
 contractVersions:{'xdownload.describePolicy':'1.0.0'},invoke:async()=>obs});
const blocked=code=>e=>e?.code===code;
test('O3 data-only candidate is deterministic, immutable, cannot grant qualification',()=>{
 const a=prepareO3ShadowCandidate(candidate()),b=prepareO3ShadowCandidate(candidate());
 assert.deepEqual(a,b);assert.equal(Object.isFrozen(a),true);
 assert.equal(a.disposition,'CANDIDATE_SHADOW_ONLY');
 assert.equal(a.qualified,false);assert.equal(a.activationAllowed,false);
 assert.equal(typeof a.activate,'undefined');
});
test('O3 unknown operator, Effect, code, source drift, accessor, Proxy and pollution fail closed',()=>{
 const cases=[{op:'eval'},{op:'import'},{equals:'orders'},{field:'__proto__.owner'},
  {sourceGitBlob:'0'.repeat(40)},{contractVersion:'2.0.0'},
  {activationAllowed:true},{qualified:true},{effect:'download'}];
 for(const c of cases)assert.throws(()=>prepareO3ShadowCandidate({...candidate(),...c}),
  blocked('O3_RULE_NOT_SELECTED_OR_UNSAFE'));
 const getter=candidate();Object.defineProperty(getter,'op',{get(){throw Error('side effect')}});
 assert.throws(()=>prepareO3ShadowCandidate(getter),blocked('O3_RULE_NOT_SELECTED_OR_UNSAFE'));
 const trap=new Proxy(candidate(),{ownKeys(){throw Error('trap')}});
 assert.throws(()=>prepareO3ShadowCandidate(trap),blocked('O3_RULE_NOT_SELECTED_OR_UNSAFE'));
 const inherited=Object.create({schema:'fake'});Object.assign(inherited,candidate());
 assert.throws(()=>prepareO3ShadowCandidate(inherited),blocked('O3_RULE_NOT_SELECTED_OR_UNSAFE'));
});
test('O3 fake qualification, wrong target and unsupported budgets cannot activate',()=>{
 const c=prepareO3ShadowCandidate(candidate());
 assert.throws(()=>makeO3Shadow({app:app(),candidate:{...c,qualified:true}}),blocked('O3_CANDIDATE_UNQUALIFIED'));
 assert.throws(()=>makeO3Shadow({app:{...app(),functions:[]},candidate:c}),blocked('O3_NATIVE_FUNCTION_NOT_SELECTED'));
 assert.throws(()=>makeO3Shadow({app:app(),candidate:c,maxWaitMs:0}),blocked('O3_BUDGET_INVALID'));
});
test('O3 candidate shadows selected observation, never mints Effect/Experience/Oracle',async()=>{
 let calls=0;const a=app();a.invoke=async()=>{calls++;return observation()};
 const o3=makeO3Shadow({app:a,candidate:prepareO3ShadowCandidate(candidate())});
 const first=await o3.probe();assert.equal(first.shadowMatched,true);
 for(const field of ['qualified','ruleActivated','experienceIssued','effectDispatched'])assert.equal(first[field],false);
 assert.equal(first.authority,'NONE');assert.equal(first.status,'NEED_MORE_EVIDENCE');
 assert.equal((await o3.probe()).reason,'SHADOW_BUDGET_EXHAUSTED');assert.equal(calls,1);
});
test('O3 stale, fake, unverified observations / throw / delay fail closed',async()=>{
 const mut=[{disposition:'SUCCEEDED'},{authority:'KDP'},{contractVersion:'2.0.0'},
  {evidence:{attested:true,source:{sourceId:'xdownload-business',sha256:'a'.repeat(64),gitBlob:blob}}},
  {evidence:{attested:false,source:{sourceId:'evil',sha256:'a'.repeat(64),gitBlob:blob}}},
  {value:{domainId:'orders'}}];
 for(const m of mut){
  const got=await makeO3Shadow({app:app({...observation(),...m}),candidate:prepareO3ShadowCandidate(candidate())}).probe();
  assert.equal(got.reason,'SOURCE_OBSERVATION_UNQUALIFIED');assert.equal(got.ruleActivated,false);
 }
 const obs=observation();Object.defineProperty(obs.evidence.source,'gitBlob',{get(){throw Error('getter')}});
 assert.equal((await makeO3Shadow({app:app(obs),candidate:prepareO3ShadowCandidate(candidate())}).probe()).reason,'SOURCE_OBSERVATION_UNQUALIFIED');
 const throws=app();throws.invoke=()=>{throw Error('BOOM')};
 assert.equal((await makeO3Shadow({app:throws,candidate:prepareO3ShadowCandidate(candidate())}).probe()).reason,'SHADOW_OBSERVATION_UNKNOWN');
 const hangs=app();hangs.invoke=()=>new Promise(()=>{});
 assert.equal((await makeO3Shadow({app:hangs,candidate:prepareO3ShadowCandidate(candidate()),maxWaitMs:1}).probe()).reason,'SHADOW_OBSERVATION_UNKNOWN');
});
test('O3 caller-coordinated digest drift and fake metadata cannot authorize even Shadow identity',()=>{
 const c=prepareO3ShadowCandidate(candidate());
 for(const fake of [{...c,digest:'f'.repeat(64)},
  {...c,ruleActivated:true},
  Object.assign(Object.create({bad:true}),c)])
  assert.throws(()=>makeO3Shadow({app:app(),candidate:fake}),blocked('O3_CANDIDATE_UNQUALIFIED'));
 const accessor={...c};Object.defineProperty(accessor,'digest',{get(){throw Error('spoof')}});
 assert.throws(()=>makeO3Shadow({app:app(),candidate:accessor}),blocked('O3_CANDIDATE_UNQUALIFIED'));
});
