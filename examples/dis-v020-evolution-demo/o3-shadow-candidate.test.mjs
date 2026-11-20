/** DIS R63 O3 candidate + shadow-only fixture; NOT E07 activation PASS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLocalEvolutionCandidate as classify} from './o3-shadow-candidate.mjs';
const hex=c=>c.repeat(64);
const baseline=()=>({
 candidate:{id:'candidate:rule-1',kind:'DECLARATIVE_RULE_DATA',scope:'tenant:T/app:A',
  operator:'EXACT_EQUALS',field:'mimeType',literal:'video/mp4',
  functionDigest:hex('a'),knowledgeDigest:hex('b'),
  requestedBinding:'UNMODIFIED',requestedEffect:'none'},
 task:{scope:'tenant:T/app:A',taskId:'task:001',currentEpoch:8},
 selected:{scope:'tenant:T/app:A',functionDigest:hex('a'),knowledgeDigest:hex('b')}
});
const blocked=r=>{
 assert.equal(r.authority,'NONE');assert.equal(r.qualified,false);
 for(const k of ['activationAllowed','taskPinChanged','oldTaskChanged',
  'revokePerformed','dynamicCodeExecuted','physicalEffectDispatched',
  'uploadPerformed','serverPromoted'])assert.equal(r[k],false,k);
 assert.equal(r.requiresNewAot,true);
};
test('O3 candidate is SHADOW ONLY; no next Task pin or old Task epoch change',()=>{
 const t=baseline(),r=classify(t);
 assert.equal(r.status,'SHADOW_ONLY');blocked(r);
 assert.equal(t.task.currentEpoch,8);
});
test('O3 caller claims never mint qualification, activation or promotion',()=>{
 for(const k of ['qualificationReceipt','activationEpoch','serverPromotion','debug']){
  const t=baseline();t.candidate[k]=true;
  const r=classify(t);assert.equal(r.status,'REJECTED');blocked(r);
 }
});
test('N02/N14 code/unknown operator/new binding/effect cannot activate',()=>{
 for(const [k,v] of [['kind','EXECUTABLE_CODE'],['operator','eval'],
  ['operator','REGEX'],['requestedBinding','NEW_FUNCTION'],
  ['requestedEffect','governed'],['literal','eval(process.exit())']]){
  const t=baseline();t.candidate[k]=v;
  const r=classify(t);blocked(r);
  assert.equal(r.status,k==='literal'?'SHADOW_ONLY':'REJECTED');
 }
});
test('N09 stale Function or Knowledge Digest rejected',()=>{
 for(const k of ['functionDigest','knowledgeDigest']){
  const t=baseline();t.selected[k]=hex('f');
  const r=classify(t);assert.equal(r.reason,'STALE_SELECTED_SOURCE');blocked(r);
 }
});
test('N08 cross-scope tenant/app request rejected',()=>{
 for(const obj of ['task','selected']){
  const t=baseline();t[obj].scope='tenant:T/app:B';
  const r=classify(t);assert.equal(r.reason,'SCOPE_MISMATCH');blocked(r);
 }
});
test('N13 crash/retry/revoke never pins or mutates Task',()=>{
 const t=baseline(),before=JSON.stringify(t);
 for(let i=0;i<5;i++){const r=classify(t);assert.equal(r.status,'SHADOW_ONLY');blocked(r)}
 assert.equal(JSON.stringify(t),before);
});
test('N02 malformed input, Unicode alias and bad epoch fail closed',()=>{
 for(const [obj,key,value] of [['task','currentEpoch',-1],
  ['candidate','field','\u202eunsafe'],['candidate','literal',' padded '],
  ['candidate','id',''],['selected','scope','tenant:T/app:A\n']]){
  const t=baseline();t[obj][key]=value;
  const r=classify(t);assert.equal(r.status,'REJECTED');blocked(r);
 }
});
test('N08/E10 no server, no consent, offline never uploads',()=>{
 const r=classify(baseline());assert.equal(r.status,'SHADOW_ONLY');
 assert.equal(r.uploadPerformed,false);assert.equal(r.serverPromoted,false);blocked(r);
});
test('accessor, Proxy and prototype injection cannot be trusted slot metadata',()=>{
 const t=baseline();
 Object.defineProperty(t.selected,'scope',{get(){throw Error('untrusted accessor')}});
 const r=classify(t);assert.equal(r.status,'REJECTED');blocked(r);
 const p=baseline();p.selected=new Proxy(p.selected,{get(){throw Error('untrusted proxy')}});
 assert.equal(classify(p).status,'REJECTED');
 const x=baseline();x.candidate.__proto__={authoritative:true};
 assert.equal(classify(x).status,'REJECTED');
});
