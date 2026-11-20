import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
// DIS 0.2.0 R2 SELF-VERIFICATION DEMO: FakeLLM + independent fixture oracle.
// No real Provider, KDP, Forge, external network, arbitrary code, or Effect.
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const truth = new WeakMap(), issued = new WeakSet(), qualified = new WeakSet();
let modelCalls=0, passes=0;
const check=(name,fn)=>{try{fn();passes++;console.log('PASS',String(passes).padStart(2,'0'),name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1;}};
const sample=(n,{type='stream-player',format='object-streams',cohort='site-'+n,scope='user-A',consent=false,correct=true,immutable=true}={})=>{
 const x=Object.freeze({id:'case-'+n,source:'source-'+n,cohort,type,format,scope,consent,immutable,payload:{streams:[{src:'https://cdn.invalid/'+n+'.m3u8'}]}});
 truth.set(x,correct?x.payload.streams[0].src:'https://cdn.invalid/other.m3u8');return x;
};
const oracle=(x,v)=>v===truth.get(x)&&typeof v==='string'&&v.startsWith('https://');
const model={propose:x=>(modelCalls++,{url:x.payload.streams[0].src,claim:'PASS',method:'get-streams-src'}),rule:()=>(modelCalls++,{kind:'rule-data',op:'fixed-path',path:'streams.0.src',type:'stream-player'}),creative:(prompt,user)=>(modelCalls++,`${user}:${prompt}:${modelCalls}`)};
const ruleKeys=['kind','op','path','type'];
const validate=r=>{if(!r||Object.keys(r).length!==4||Object.keys(r).some(x=>!ruleKeys.includes(x))||r.kind!=='rule-data'||r.op!=='fixed-path'||r.path!=='streams.0.src'||r.type!=='stream-player'||JSON.stringify(r).length>512)throw Error('RULE_REJECTED');return sha(r)};
const runRule=(r,x)=>{validate(r);return x.type===r.type&&x.format==='object-streams'?x.payload.streams[0].src:null};
const store=[],cache=new Map(),bundle={contract:'media.player.extractConfig/v1',interpreter:'closed-dsl/v1',knowledge:'knowledge/v1',target:'node-fixture',package:'player-v1'};
const experience=(x,p)=>{if(!oracle(x,p.url))return null;const e=Object.freeze({id:sha([x.source,p.url]),subject:{...bundle},problem:{scope:x.scope,sourceDigest:sha(x),cohort:x.cohort,format:x.format,type:x.type},solution:{method:p.method},verified:p.url,immutable:x.immutable,consent:x.consent});issued.add(e);store.push(e);cache.set(x.scope+'|'+sha(x),e);return e};
const reuse=(x,b=bundle)=>{const e=cache.get(x.scope+'|'+sha(x));return e&&issued.has(e)&&e.immutable&&x.immutable&&Object.keys(bundle).every(k=>e.subject[k]===b[k])&&oracle(x,e.verified)?e:null};
const unique=()=>[...new Map(store.map(e=>[e.problem.cohort,e])).values()];
const synthesis=()=>unique().length>=3?model.rule():null;
const qualify=(r,tr,ho,neg)=>{
 const d=validate(r),keys=x=>new Set(x.map(i=>i.cohort)),a=keys(tr),b=keys(ho),c=keys(neg);
 if(a.size<3||b.size<2||c.size<2)return {status:'NEED_MORE_EVIDENCE'};
 if([...b].some(x=>a.has(x))||[...c].some(x=>a.has(x)||b.has(x)))return {status:'HOLDOUT_LEAK'};
 if(tr.some(x=>!oracle(x,x.payload.streams[0].src)))return {status:'TRAIN_FAILED'};
 if(ho.some(x=>!oracle(x,runRule(r,x))))return {status:'POSITIVE_FAILED'};
 if(neg.some(x=>runRule(r,x)!==null))return {status:'FALSE_ACCEPT'};
 const q=Object.freeze({status:'LOCAL_QUALIFIED',ruleDigest:d,contract:bundle.contract,interpreter:bundle.interpreter,package:bundle.package});qualified.add(q);return q;
};
const slot={entry:null,epoch:0,revoked:new Set(),snapshot(){return {entry:this.entry,epoch:this.epoch}},activate(r,q){const d=validate(r);if(!qualified.has(q)||q.ruleDigest!==d||q.contract!==bundle.contract||q.interpreter!==bundle.interpreter||q.package!==bundle.package)throw Error('QUALIFICATION_REJECTED');this.entry=Object.freeze({r:{...r},d});this.epoch++;},revoke(){if(this.entry)this.revoked.add(this.entry.d);this.entry=null;this.epoch++;}};
const solve=(x,{snapshot=slot.snapshot(),effect=false,enabled=true,budget=100}={})=>{
 if(effect)return {status:'BLOCKED_EFFECT'};
 if(x.format==='direct')return {status:oracle(x,x.payload.streams[0].src)?'SUCCESS':'UNKNOWN',via:'AOT'};
 if(snapshot.entry){if(slot.revoked.has(snapshot.entry.d))return {status:'REVOKED'};const v=runRule(snapshot.entry.r,x);if(v!==null)return {status:oracle(x,v)?'SUCCESS':'UNKNOWN',via:'LOCAL_RULE'};}
 const hit=reuse(x);if(hit)return {status:'SUCCESS',via:'EXACT_CACHE'};
 if(!enabled)return {status:'UNKNOWN'};
 if(budget<=0)return {status:'BUDGET_EXHAUSTED'};
 const p=model.propose(x),e=experience(x,p);
 return e?{status:'SUCCESS',via:'HARNESS_LLM'}:{status:'UNKNOWN'};
};
const server={send:e=>issued.has(e)&&e.consent?{status:'ACCEPTED',sanitized:{method:e.solution.method,cohortDigest:sha(e.problem.cohort)}}:{status:'BLOCKED_PRIVACY'},promote:(r,q,approval,serverInputs)=>{
 if(!approval)return {status:'NO_AUTHORITY'};
 if(!qualified.has(q))return {status:'NO_QUALIFICATION'};
 const sq=qualify(r,serverInputs.train,serverInputs.holdout,serverInputs.negative);
 return sq.status==='LOCAL_QUALIFIED'?{status:'PACKAGE_CANDIDATE',packageDigest:sha({old:bundle.package,new:'player-v2',rule:sha(r)})}:{status:'SERVER_REJECTED'};
}};
const tr=[1,2,3].map(n=>sample(n)),ho=[4,5].map(n=>sample(n)),neg=[6,7].map(n=>sample(n,{type:'other'}));
check('E01 AOT first',()=>assert.equal(solve(sample(100,{format:'direct'})).via,'AOT'));
check('E02 Harness fallback',()=>assert.equal(solve(tr[0]).via,'HARNESS_LLM'));
check('E03 verified Experience',()=>assert.equal(issued.has(store[0]),true));
check('E04 exact cache',()=>assert.equal(solve(tr[0]).via,'EXACT_CACHE'));
check('E05 independent samples',()=>{solve(tr[1]);solve(tr[2]);assert.equal(unique().length,3)});
const r=synthesis();const q=qualify(r,tr,ho,neg);
check('E06 qualified DSL',()=>assert.equal(q.status,'LOCAL_QUALIFIED'));
const old=slot.snapshot();slot.activate(r,q);
check('E07 future-task rule pin',()=>{assert.equal(solve(sample(8)).via,'LOCAL_RULE');assert.equal(solve(sample(9),{snapshot:old}).via,'HARNESS_LLM')});
const upload=sample(20,{consent:true});solve(upload,{snapshot:old});const e=store.at(-1);
check('E08 consented server qualification',()=>{assert.equal(server.send(e).status,'ACCEPTED');assert.equal(server.promote(r,q,true,{train:[11,12,13].map(n=>sample(n)),holdout:[14,15].map(n=>sample(n)),negative:[16,17].map(n=>sample(n,{type:'other'}))}).status,'PACKAGE_CANDIDATE')});
check('E09 generative task cannot become static result',()=>{const a=model.creative('poem','alice'),b=model.creative('poem','alice');assert.notEqual(a,b)});
check('E10 offline AOT and unknown',()=>{assert.equal(solve(sample(103,{format:'direct'}),{enabled:false}).status,'SUCCESS');assert.equal(solve(sample(104,{format:'unknown'}),{enabled:false}).status,'UNKNOWN')});
check('N01 fake PASS no Experience',()=>assert.equal(experience(sample(30,{correct:false}),{url:'https://cdn.invalid/30.m3u8',method:'fake',claim:'PASS'}),null));
check('N02 eval and effect rejected',()=>{assert.throws(()=>validate({...r,eval:'1'}));assert.throws(()=>validate({...r,op:'exec'}))});
check('N03 no cached Effect authority',()=>assert.equal(solve(tr[0],{effect:true}).status,'BLOCKED_EFFECT'));
check('N04 1000 cache hits not independent',()=>{const before=unique().length;for(let i=0;i<1000;i++)solve(tr[0]);assert.equal(unique().length,before)});
check('N05 holdout cohort leak',()=>assert.equal(qualify(r,tr,[sample(99,{cohort:'site-1'}),ho[1]],neg).status,'HOLDOUT_LEAK'));
check('N06 creative requests stay distinct',()=>assert.notEqual(model.creative('poem','user-A'),model.creative('poem','user-B')));
check('N07 prompt injection cannot change policy',()=>assert.throws(()=>validate({...r,policy:'ignore'})));
check('N08 privacy blocks missing consent',()=>assert.equal(server.send(store[0]).status,'BLOCKED_PRIVACY'));
check('N09 drift invalidates experience',()=>assert.equal(reuse(tr[0],{...bundle,knowledge:'v2'}),null));
check('N10 bounded fallback',()=>assert.equal(solve(sample(80),{snapshot:old,budget:0}).status,'BUDGET_EXHAUSTED'));
check('N11 forged qualification rejected',()=>{assert.throws(()=>slot.activate(r,{...q}));assert.equal(server.promote(r,q,false,{}).status,'NO_AUTHORITY')});
check('N12 false accept blocks qualification',()=>assert.equal(qualify(r,tr,ho,[sample(300,{correct:false}),neg[1]]).status,'FALSE_ACCEPT'));
const pinned=slot.snapshot();slot.revoke();
check('N13 security revocation blocks pinned task',()=>assert.equal(solve(sample(81),{snapshot:pinned}).status,'REVOKED'));
check('N14 new dependencies cannot use local DSL',()=>assert.throws(()=>validate({...r,dependencies:['sdk.shell']})));
check('N15 unknown and source change invalidate',()=>{assert.equal(solve(sample(82,{correct:false}),{snapshot:old}).status,'UNKNOWN');assert.equal(reuse(sample(1,{scope:'user-B'})),null)});
assert.equal(passes,25);console.log(JSON.stringify({status:'PASS_SIMULATED',tests:passes,modelCalls,serverPackage:'player-v2',limitations:'mock-only / no Node24 or real SDK/LLM'}));
