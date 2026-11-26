import assert from 'node:assert/strict';
import { startProcurement, assessOffers } from './procurement.js';
import type { OfferSnapshot, Request, Service, Plan, ProcurementResult } from './procurement.js';
import type { InteractionElement, InteractionPrompt } from '@kaicreator/domain-harness';
import { offers } from './offers.js';
const limits=(maxCalls=40,maxSteps=50,maxDepth=1)=>({maxCalls,maxSteps,maxDepth});
const envelope=(p:InteractionPrompt)=>({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey});
const reply=(p:InteractionPrompt,i:InteractionElement,value:string)=>assert.equal(i.submit({...envelope(p),action:'submit',values:{[p.decisionKey]:value}}).accepted,true);
const planOptions=(p:InteractionPrompt)=>{const f=p.fields[0];assert.ok(f?.kind==='choice');return f;};
const record=(name:string,output:unknown)=>console.log(JSON.stringify({case:name,output}));
const complete=(r:Awaited<ReturnType<typeof startProcurement>['result']>):ProcurementResult=>{assert.equal(r.status,'COMPLETE',JSON.stringify(r));return r.value;};
function verifyPlan(p:Plan,s:OfferSnapshot,demand:number,service:Service){
  const o=s.offers.find(v=>v.id===p.id);assert.ok(o&&o.days!=null&&o.pack!=null&&o.price!=null&&o.maxPacks!=null&&o.minPacks!=null&&o.ship!=null);
  assert.ok(Number.isInteger(p.packs)&&p.packs>=o.minPacks&&p.packs<=o.maxPacks);
  assert.equal(p.units,p.packs*o.pack);assert.equal(p.cost,p.packs*o.price+o.ship);
  assert.ok(p.units>=demand&&p.units<=demand+3&&p.cost<=2000);
  assert.equal(p.days,o.days);assert.ok(p.days<=(service==='urgent'?2:5));
}
function reportAssessment(name:string,s:OfferSnapshot,d:number,service:Service){
  const a=assessOffers(s,d,service);if(a.status==='COMPLETE'){
    for(const p of a.value.assessment.eligible)verifyPlan(p,s,d,service);
    if(a.value.assessment.recommended.length)assert.ok(a.value.assessment.recommended.every(p=>p.cost===Math.min(...a.value.assessment.eligible.map(v=>v.cost))));
    record(name,{...a.value.assessment,complete:a.value.result.complete});
  }else record(name,a);
  return a;
}
const normal=reportAssessment('maintenance_normal',offers,10,'normal');assert.equal(normal.status,'COMPLETE');
assert.equal(normal.value.assessment.eligible.length,2);assert.equal(normal.value.assessment.recommended[0]?.id,'B');
const urgent=reportAssessment('maintenance_urgent_demand10',offers,10,'urgent');assert.equal(urgent.status,'COMPLETE');assert.equal(urgent.value.assessment.eligible.length,2);
const nofit=reportAssessment('no_fit',offers,30,'normal');assert.equal(nofit.status,'COMPLETE');assert.equal(nofit.value.result.status,'empty');
const incomplete:OfferSnapshot={revision:'offers-r2-unknown',offers:offers.offers.map(o=>o.id==='C'?{...o,days:null}:o)};
const u=reportAssessment('unknown',incomplete,10,'normal');assert.equal(u.status,'COMPLETE');assert.equal(u.value.result.complete,false);assert.deepEqual(u.value.assessment.unknown,['C']);assert.deepEqual(u.value.assessment.recommended,[]);
const conflict:OfferSnapshot={...offers,offers:[...offers.offers,offers.offers[0]!]};
assert.equal(reportAssessment('conflict',conflict,10,'normal').status,'FAILED');
let prompts=0;
const zero=startProcurement({demand:10,service:'normal',plan:'C:4'},()=>offers,limits(5,7),()=>{prompts++;});
const z=complete(await zero.result);assert.equal(z.selected.id,'C');assert.equal(prompts,0);assert.equal(zero.handled(),1);record('complete_explicit_nonrecommended',{...z,prompts});
const partial=startProcurement('补货 10',()=>offers,limits(11,13),(p,i)=>{
  prompts++;
  if(p.decisionKey==='service')reply(p,i,'normal');
  else {const field=planOptions(p);assert.ok(field.options.some(o=>o.id==='B:2'&&o.recommended));assert.ok(field.comparison?.length===5);assert.equal(field.prefill,undefined);reply(p,i,'C:4');}
});
const p=complete(await partial.result);assert.equal(prompts,2);assert.equal(p.selected.id,'C');record('partial_text',{...p,prompts});
let old:InteractionPrompt|undefined;let revPrompts=0;
const revised=startProcurement('补货 6 normal',()=>offers,limits(),(p,i)=>{
  revPrompts++;const field=planOptions(p);
  if(!old){old=p;assert.ok(field.options.some(o=>o.id==='D:1'));assert.equal(i.submit({...envelope(p),action:'revise',text:'补货 6 urgent'}).accepted,true);}
  else {assert.equal(i.submit({...envelope(old),action:'submit',values:{plan:'D:1'}}).accepted,false);
    assert.equal(i.submit({...envelope(p),intentId:'foreign-intent',action:'submit',values:{plan:'C:2'}}).accepted,false);
    assert.ok(!field.options.some(o=>o.id==='D:1'));reply(p,i,'C:2');}
});
const rev=complete(await revised.result);assert.equal(rev.service,'urgent');assert.equal(revPrompts,2);record('revision_and_association',{...rev,prompts:revPrompts});
const unknownInteraction=startProcurement('补货 10 normal',()=>incomplete,limits(),(p,i)=>{
  const f=planOptions(p);assert.equal(f.completeness,'incomplete');assert.ok(f.options.every(o=>!o.recommended));reply(p,i,'B:2');
});record('incomplete_explicit',complete(await unknownInteraction.result));
for(const [name,input,facts,expected] of [
 ['illegal-demand',{demand:31,service:'normal',plan:'A:3'},offers,'REJECT'],
 ['illegal-stock',{demand:10,service:'normal',plan:'D:2'},offers,'REJECT'],
 ['illegal-overage',{demand:10,service:'normal',plan:'A:4'},offers,'REJECT'],
 ['illegal-deadline',{demand:6,service:'urgent',plan:'D:1'},offers,'REJECT'],
 ['illegal-amount',{demand:10,service:'normal',plan:'B:1'},offers,'REJECT'],
 ['illegal-cost',{demand:10,service:'normal',plan:'B:2'},{...offers,offers:offers.offers.map(o=>o.id==='B'?{...o,price:1000}:o)},'REJECT'],
 ['illegal-moq',{demand:10,service:'normal',plan:'A:3'},offers,'REJECT'],
 ['no-fit-demand',{demand:30,service:'normal'},offers,'ASK'],
 ['conflicting-authority',{demand:10,service:'normal'},conflict,'FAILED'],
 ['unsupported-text','purchase everything',offers,'REJECT']
] as const){
 const run=startProcurement(input as Request|string,()=>facts,limits());const r=await run.result;assert.notEqual(r.status,'COMPLETE',name);assert.equal(r.status,expected,name);assert.equal(run.handled(),0);record(name,r);
}
for(const [name,b] of [['short-calls',limits(4,7)],['short-steps',limits(5,6)],['short-depth',limits(5,7,0)]] as const){
 const run=startProcurement({demand:10,service:'normal',plan:'B:2'},()=>offers,b);
 const r=await run.result;assert.equal(r.status,'FAILED',name);assert.equal(run.handled(),0);record(name,r);
}
for(const [name,act,expected] of [['no-fit-action','no-fit','ASK'],['cancel-action','cancel','REJECT']] as const){
 const run=startProcurement('补货 10 normal',()=>offers,limits(),(p,i)=>assert.equal(i.submit({...envelope(p),action:act}).accepted,true));
 const r=await run.result;assert.equal(r.status,expected);assert.equal(run.handled(),0);record(name,r);
}
let facts=offers;
const changed=startProcurement('补货 10 normal',()=>facts,limits(),(p,i)=>{facts={...offers,revision:'changed'};reply(p,i,'B:2');});
const stale=await changed.result;assert.equal(stale.status,'UNKNOWN');assert.equal(changed.handled(),0);record('changed-authority',stale);
const missingPack:OfferSnapshot={revision:'offers-r2-missing-pack',offers:offers.offers.map(o=>o.id==='A'?{...o,pack:null}:o)};
const miss=reportAssessment('missing-pack',missingPack,10,'normal');assert.equal(miss.status,'COMPLETE');assert.deepEqual(miss.value.assessment.unknown,['A']);
const missSelected=startProcurement({demand:10,service:'normal',plan:'A:3'},()=>missingPack,limits());const missResult=await missSelected.result;assert.equal(missResult.status,'UNKNOWN');assert.equal(missSelected.handled(),0);record('unknown-explicit-plan',missResult);
const allMissing:OfferSnapshot={revision:'all-missing',offers:offers.offers.map(o=>({...o,days:null}))};
const all=startProcurement('补货 10 normal',()=>allMissing,limits());const allResult=await all.result;assert.equal(allResult.status,'UNKNOWN');assert.equal(all.handled(),0);record('all-candidates-unknown',allResult);
let reads=0;const changing={revision:'mutating',offers:offers.offers.map(o=>({...o}))};
const mutable=startProcurement({demand:10,service:'normal',plan:'B:2'},()=>{if(++reads===2)changing.revision='changed-in-place';return changing;},limits());
const mutableResult=await mutable.result;assert.equal(mutableResult.status,'UNKNOWN');assert.equal(mutable.handled(),0);record('mutated-authority-before-handle',mutableResult);
const raised:OfferSnapshot={revision:'offers-r2-urgent-moq',offers:offers.offers.map(o=>o.id==='C'?{...o,minPacks:3}:o)};
const raisedResult=reportAssessment('maintenance_urgent_moq',raised,6,'urgent');assert.equal(raisedResult.status,'COMPLETE');
assert.equal(raisedResult.value.assessment.eligible.length,1);assert.equal(raisedResult.value.assessment.eligible[0]?.packs,3);
const urgentMoq=startProcurement('补货 6 urgent',()=>raised,limits(),(p,i)=>{
  const f=planOptions(p);assert.deepEqual(f.options.map(o=>o.id),['C:3']);
  assert.equal(i.submit({...envelope(p),action:'submit',values:{plan:'C:2'}}).accepted,false);reply(p,i,'C:3');
});
record('maintenance_urgent_moq_selected',complete(await urgentMoq.result));
const missingMinimum:OfferSnapshot={revision:'offers-r2-missing-moq',offers:offers.offers.map(o=>o.id==='A'?{...o,minPacks:null}:o)};
const m=reportAssessment('maintenance_missing',missingMinimum,10,'normal');assert.equal(m.status,'COMPLETE');
assert.equal(m.value.result.complete,false);assert.deepEqual(m.value.assessment.unknown,['A']);assert.deepEqual(m.value.assessment.recommended,[]);
const missingMinimumRun=startProcurement('补货 10 normal',()=>missingMinimum,limits(),(p,i)=>{
  const f=planOptions(p);assert.equal(f.completeness,'incomplete');assert.ok(f.options.every(o=>!o.recommended));reply(p,i,'B:2');
});record('maintenance_missing_selected',complete(await missingMinimumRun.result));
const invalidMinimum=startProcurement({demand:10,service:'normal',plan:'B:2'},()=>({...offers,offers:offers.offers.map(o=>o.id==='B'?{...o,minPacks:0}:o)}),limits());
const invalidMinimumResult=await invalidMinimum.result;assert.equal(invalidMinimumResult.status,'REJECT');assert.equal(invalidMinimum.handled(),0);record('maintenance_invalid_minimum',invalidMinimumResult);
// QA-09A follow-up by integrator; original R65 generation/maintenance records are immutable.
for(const rejects of [false,true]){
 const invalid=startProcurement('补货 10 normal',()=>offers,limits(),async(p,i)=>{
  reply(p,i,'B:2');
  if(rejects)throw Error('PRIVATE_NOTIFICATION_MARKER');
 });
 const r=await invalid.result;
 assert.deepEqual(r,{status:'FAILED',reason:{code:'INTERACTION_NOTIFICATION_FAILED',message:'Interaction could not continue'}});
 assert.equal(invalid.handled(),0);assert.equal(invalid.interaction.current(),undefined);
 record(rejects?'notification-rejected-promise':'notification-resolved-promise',r);
}
await new Promise<void>(resolve=>setImmediate(resolve));
console.log('PROCUREMENT_MAINTENANCE_PASS');
