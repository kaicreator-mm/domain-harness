import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkflowFunction, bindWorkflowRegion, createWorkflowSlot, InteractionElement, runWorkflowRegion, StandardWorkflowSession } from '../../src/index.js';
import type { StandardWorkflowOutcome as Outcome, WorkflowCapability, WorkflowRegionDefinition, WorkflowRegionView, WorkflowRegionProposal, WorkflowSlotBinding, WorkflowObservation } from '../../src/index.js';

const ok = <T>(value:T):Outcome<T>=>({status:'COMPLETE',value});
const deny = <T>():Outcome<T>=>({status:'REJECT',reason:{code:'DOMAIN_DENIED',message:'domain denied'}});
const integer = createWorkflowSlot('integer',(v):v is number=>typeof v==='number'&&Number.isSafeInteger(v));
const quantity = createWorkflowSlot('quantity',(v):v is bigint=>typeof v==='bigint');
const date = createWorkflowSlot('date',(v):v is Date=>v instanceof Date);
const limits = {maxWork:20000000,maxDescendantDepth:3,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,maxNodes:40,maxBindings:32,maxEdits:8,maxProjectionBytes:16384};
const rootLimits = {maxCalls:1000,maxSteps:1500,maxDepth:5};
const baseControl = {maxWork:30000000,maxEvents:400,maxActiveScopes:32,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:3};
const completion = <O> (verify:(value:O)=>boolean) => ({goal:'actual goal',requiredKnowledge:[],terminalReads:0,validate:(value:O)=>verify(value)?ok(undefined):deny<void>()});
const result = (view:WorkflowRegionView,action:WorkflowRegionProposal['action'],edits:WorkflowRegionProposal['edits']=[])=>ok({source:'native' as const,proposal:{
  runId:view.runId,regionId:view.regionId,planRevision:view.planRevision??0,factRevision:view.factRevision,action,edits}});
const idOf = (view:WorkflowRegionView,definition:string) => {
  const found=view.progress.find(n=>n.definitionId===definition);
  if(!found)throw Error('missing node');
  return found.instanceId;
};
const accepted = (view:WorkflowRegionView,definition:string) => view.progress.some(n=>n.definitionId===definition&&n.state==='accepted');
const ref = (node:string,slot='value'):WorkflowSlotBinding=>({kind:'result',node,slot});
const ctx = (slot:string):WorkflowSlotBinding=>({kind:'context',slot});
const literal = (value:number):WorkflowSlotBinding=>({kind:'literal',value});
const environment = () => {
  let epoch=1,quoteRev='1',quote=5;
  const policy={maxItems:2,equal:Object.is,current:()=>({epoch,context:{scope:'shop',revisions:new Map([['vehicle','1'],['quote',quoteRev]])}})};
  const observations=()=>[
    {key:'vehicle',origin:'authority' as const,state:'known' as const,value:7,source:{id:'vehicle',scope:'shop',revision:'1'}},
    {key:'quote',origin:'authority' as const,state:'known' as const,value:quote,source:{id:'quote',scope:'shop',revision:quoteRev}},
  ];
  const requirements=[{key:'vehicle',accepts:['authority'] as const},{key:'quote',accepts:['authority'] as const}];
  const trace:WorkflowObservation[]=[];
  const session=()=>new StandardWorkflowSession(rootLimits,{limits:baseControl,knowledge:policy,current:()=>true,observe:r=>{trace.push(r);}});
  const region=<O>(patch:Partial<WorkflowRegionDefinition<void,O>>):WorkflowRegionDefinition<void,O>=>({
    id:'region',goal:'actual goal',limits,capabilities:[],constraints:[],knowledge:policy,current:()=>true,
    requiredKnowledge:requirements,optionalKnowledge:[],contextSlots:{vehicle:integer,quote:integer},layout:[],replay:'pure-read-only',
    refresh:(_input,_root,_prev,w)=>{const a=w.put('vehicle',integer,7);if(a.status!=='COMPLETE')return a;const b=w.put('quote',integer,quote);if(b.status!=='COMPLETE')return b;
      return ok({changed:[],dependencies:requirements.map(r=>({key:r.key,dependsOn:[]})),observations:observations(),slotEvidence:{vehicle:['vehicle'],quote:['quote']}});},
    plan:view=>result(view,'finish'),admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),complete:()=>deny<O>(),...patch
  });
  return {policy,session,trace,region,change:(v:number)=>{epoch++;quoteRev=String(epoch);quote=v;}};
};
function capability(name:string,action:(n:number)=>number, counter:Record<string,number>,effect:'none'|'committed'='none'):WorkflowCapability {
  return bindWorkflowFunction<number,number>({id:name,description:name,inputs:{value:integer},outputs:{value:integer},input:r=>r.read('value',integer),
    node:{id:name,goal:name,requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),run:v=>{counter[name]=(counter[name]??0)+1;return ok(action(v));},
      after:()=>ok(undefined),project:()=>({effect,detail:null,...(effect==='committed'?{receiptId:'receipt-1'}:{})})},output:(v,w)=>w.put('value',integer,v)});
}

test('actual anchor-gap edits insert/rebind with typed native result and preserve anchors',async()=>{
  const e=environment(),count:Record<string,number>={},a=capability('read',x=>x+1,count),b=capability('double',x=>x*2,count),c=capability('final',x=>x+1,count);
  let edited=false;
  const d=e.region<number>({capabilities:[a,b,c],layout:[
    {kind:'anchor',id:'read',node:{alias:'a',capability:'read',input:{value:ctx('quote')}}},
    {kind:'gap',id:'flex',templates:[],seed:[]},
    {kind:'anchor',id:'final',node:{alias:'c',capability:'final',input:{value:ref('a')}}}],
    plan:view=>{
      if(!edited&&accepted(view,'read')){edited=true;return result(view,'continue',[
        {kind:'insert',gap:'flex',node:{alias:'b',capability:'double',input:{value:ref(idOf(view,'read'))}}},
        {kind:'rebind',node:idOf(view,'final'),input:'value',to:ref('b')}]);}
      return result(view,accepted(view,'final')?'finish':'continue');
    },complete:view=>view.reader.read(idOf(view,'final')+'/value',integer)});
  const s=e.session(),r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===13));
  assert.deepEqual(r,ok(13));assert.deepEqual(count,{read:1,double:1,final:1});
  assert.equal(e.trace.filter(x=>x.kind==='region'&&x.action==='edit').length,1);
  const nodes=s.dispositions().filter(x=>x.kind==='node');
  assert.deepEqual(nodes.map(n=>n.occurrence.definitionId),['read','double','final']);
  assert.equal(new Set(e.trace.map(r=>r.runId)).size,1);
});
test('actual feedback reopens affected pure-read-only anchors, preserves unrelated anchor, keeps old attempts',async()=>{
  const e=environment(),count:Record<string,number>={},a=capability('vehicle',x=>x,count),b=capability('quote',x=>x*2,count),c=capability('final',x=>x+1,count);
  let asked=false;
  const d=e.region<number>({capabilities:[a,b,c],layout:[
    {kind:'anchor',id:'vehicle',node:{alias:'a',capability:'vehicle',input:{value:ctx('vehicle')}}},
    {kind:'anchor',id:'quote',node:{alias:'b',capability:'quote',input:{value:ctx('quote')}}},
    {kind:'anchor',id:'final',node:{alias:'c',capability:'final',input:{value:ref('b')}}}],
    plan:view=>{if(accepted(view,'final')&&!asked){asked=true;return result(view,'clarify');}
      return result(view,accepted(view,'final')?'finish':'continue');},
    clarify:async(_view,root)=>{
      const interaction=new InteractionElement({onPrompt:(p,actual)=>{setImmediate(()=>actual.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quote:3}}));}});
      const response=await interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_s,event)=>{
        if(event.kind==='initial')return ok({kind:'clarify',state:1,prompt:{decisionKey:'quote',title:'quote',actions:['submit'],fields:[{id:'quote',kind:'number',label:'quote',required:true}]}});
        if(event.response.action!=='submit'||typeof event.response.values.quote!=='number')return deny();
        return ok({kind:'ready',intent:event.response.values.quote});
      }));
      if(response.status!=='COMPLETE')return response;
      e.change(response.value);return ok(undefined);
    },
    complete:view=>view.reader.read(idOf(view,'final')+'/value',integer)});
  const s=e.session(),r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===7));
  assert.deepEqual(r,ok(7));assert.deepEqual(count,{vehicle:1,quote:2,final:2});
  const nodes=s.dispositions().filter(x=>x.kind==='node');
  const q=nodes.filter(x=>x.occurrence.definitionId==='quote');
  assert.deepEqual(q.map(x=>x.occurrence.attempt),[1,2]);
  assert.equal(q[0]?.occurrence.instanceId,q[1]?.occurrence.instanceId);
  assert.deepEqual(q.map(x=>x.factRevision),[1,2]);
  assert.equal(e.trace.filter(x=>x.kind==='region'&&x.action==='feedback').length,1);
  assert.equal(e.trace.filter(x=>x.kind==='region'&&x.action==='revalidate').length,1);
});
test('wrong token, premature finish, skipped required anchor and committed-effect stale all fail closed',async()=>{
  for(const mode of ['wrong-token','finish','skip','effect','forward','unknown-binding','model','no-progress'] as const){
    const e=environment(),count:Record<string,number>={},a=capability('read',x=>x,count,mode==='effect'?'committed':'none');
    let changed=false;
    const d=e.region<number>({capabilities:[a],layout:mode==='no-progress'?[]:[{kind:'anchor',id:'read',node:{alias:'a',capability:'read',
      input:{value:mode==='wrong-token'?{kind:'literal',value:'not number'}:mode==='forward'?ref('not-prior'):mode==='unknown-binding'?ctx('not-declared'):ctx('quote')}}}],
      plan:view=>{
        if(mode==='finish')return result(view,'finish');
        if(mode==='skip')return result(view,'finish',[{kind:'skip',node:idOf(view,'read')}]);
        if(mode==='model')return ok({source:'model',proposal:{runId:view.runId,regionId:view.regionId,factRevision:view.factRevision,planRevision:view.planRevision??0,edits:[],action:'continue'},access:{capabilities:[],contextSlots:[],resultSlots:[]}});
        if(mode==='effect'&&accepted(view,'read')&&!changed){changed=true;return result(view,'clarify');}
        return result(view,'continue');
      },clarify:async(_view,root)=>{
        const interaction=new InteractionElement({onPrompt:(p,actual)=>{setImmediate(()=>actual.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quote:2}}));}});
        const received=await interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_s,event)=>event.kind==='initial'
          ?ok({kind:'clarify',state:1,prompt:{decisionKey:'quote',title:'quote',actions:['submit'],fields:[{id:'quote',kind:'number',label:'quote',required:true}]}})
          :event.response.action==='submit'&&typeof event.response.values.quote==='number'?ok({kind:'ready',intent:event.response.values.quote}):deny()));
        if(received.status!=='COMPLETE')return received;
        e.change(received.value);return ok(undefined);
      },complete:()=>ok(1)});
    const s=e.session(),r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(()=>true));
    assert.notEqual(r.status,'COMPLETE',mode);assert.equal(count.read??0,mode==='effect'?1:0,mode);
    if(mode==='effect')assert.ok(s.dispositions().some(x=>x.kind==='node'&&x.receiptId==='receipt-1'&&x.effect==='committed'));
  }
});
test('native bigint/Date crosses child and grandchild actual region without JSON conversion',async()=>{
  const e=environment(),when=new Date(0),big=9007199254740993n,trace=e.trace;
  type Native={quantity:bigint;date:Date};
  const value:Native={quantity:big,date:when};
  const bundle=createWorkflowSlot('bundle',(v):v is Native=>typeof v==='object'&&v!==null&&'quantity'in v&&typeof v.quantity==='bigint'&&'date'in v&&v.date instanceof Date);
  const leaf=bindWorkflowFunction<Native,Native>({id:'leaf',description:'native leaf',inputs:{value:bundle},outputs:{value:bundle},input:r=>r.read('value',bundle),
    node:{id:'leaf',goal:'native leaf',requiredKnowledge:[],before:()=>ok(undefined),run:v=>ok(v),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
    output:(v,w)=>w.put('value',bundle,v)});
  const guard=()=>true;
  const make=(name:string,inner:WorkflowCapability,delegated:readonly WorkflowCapability[],depth:number):WorkflowRegionDefinition<Native,Native>=>({
    ...e.region<Native>({}),id:name,current:guard,limits:{...limits,maxDescendantDepth:depth},capabilities:delegated,
    contextSlots:{value:bundle},layout:[{kind:'anchor',id:'call',node:{alias:'call',capability:inner.id,input:{value:ctx('value')}}}],
    refresh:(input,_root,_prev,w)=>{const written=w.put('value',bundle,input);return written.status!=='COMPLETE'?written:ok({
      changed:[],dependencies:[{key:'vehicle',dependsOn:[]},{key:'quote',dependsOn:[]}],
      observations:[{key:'vehicle',origin:'authority',state:'known',value:input,source:{id:'vehicle',scope:'shop',revision:'1'}},
        {key:'quote',origin:'authority',state:'known',value:5,source:{id:'quote',scope:'shop',revision:'1'}}],slotEvidence:{value:['vehicle']}});},
    plan:v=>result(v,accepted(v,inner.id)?'finish':'continue'),complete:v=>v.reader.read(idOf(v,inner.id)+'/value',bundle)
  });
  const wrap=(name:string,inner:WorkflowCapability,delegated:readonly WorkflowCapability[],depth:number)=>bindWorkflowRegion<Native,Native>({
    id:name,description:name,inputs:{value:bundle},outputs:{value:bundle},input:r=>r.read('value',bundle),output:(v,w)=>w.put('value',bundle,v),
    node:{id:name,goal:name,requiredKnowledge:[],before:()=>ok(undefined),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
    create:v=>{assert.equal(v,value);return ok(make(name,inner,delegated,depth));}});
  const grandchild=wrap('grandchild',leaf,[leaf],0);
  const child=wrap('child',grandchild,[grandchild,leaf],1);
  const d=make('outer',child,[child,grandchild,leaf],2);
  const s=e.session(),r=await s.run(root=>runWorkflowRegion(root,d,value),completion<Native>(v=>v===value));
  assert.equal(r.status,'COMPLETE');
  if(r.status==='COMPLETE'){assert.equal(r.value.quantity,big);assert.equal(r.value.date,when);}
  assert.equal(new Set(trace.map(x=>x.runId)).size,1);
  assert.deepEqual(s.dispositions().filter(x=>x.kind==='node').map(x=>x.occurrence.definitionId),['leaf','grandchild','child']);
  assert.equal(quantity.accepts(big),true);assert.equal(date.accepts(when),true);
});

test('native template reuse, move, skip and remove form one atomic edit and execute only retained optional node',async()=>{
  const e=environment(),count:Record<string,number>={},a=capability('read',x=>x,count),b=capability('extra',x=>x*3,count),c=capability('final',x=>x+1,count);
  let edited=false;
  const d=e.region<number>({capabilities:[a,b,c],layout:[
    {kind:'anchor',id:'read',node:{alias:'a',capability:'read',input:{value:ctx('quote')}}},
    {kind:'gap',id:'flex',templates:[{alias:'template',capability:'extra',input:{value:literal(2)}}],seed:['template']},
    {kind:'anchor',id:'final',node:{alias:'c',capability:'final',input:{value:ctx('quote')}}}],
    plan:v=>{if(!edited){edited=true;const seed=idOf(v,'extra');return result(v,'continue',[
      {kind:'reuse',gap:'flex',template:'template',alias:'one'},
      {kind:'reuse',gap:'flex',template:'template',alias:'two',before:'one'},
      {kind:'move',node:'one',before:'two'},
      {kind:'skip',node:seed},{kind:'remove',node:'two'},
      {kind:'rebind',node:idOf(v,'final'),input:'value',to:ref('one')}]);}
      return result(v,accepted(v,'final')?'finish':'continue');},
    complete:v=>v.reader.read(idOf(v,'final')+'/value',integer)});
  const s=e.session(),r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===7));
  assert.deepEqual(r,ok(7));assert.deepEqual(count,{read:1,extra:1,final:1});
  assert.equal(s.dispositions().filter(x=>x.kind==='node').length,3);
});
test('invalid batch leaves all anchors unexecuted; no edit event, actual rejected proposal',async()=>{
  const e=environment(),count:Record<string,number>={},a=capability('read',x=>x,count),b=capability('final',x=>x,count);
  const d=e.region<number>({capabilities:[a,b],layout:[
    {kind:'gap',id:'flex',templates:[{alias:'seed',capability:'read',input:{value:ctx('quote')}}],seed:['seed']},
    {kind:'anchor',id:'final',node:{alias:'b',capability:'final',input:{value:ref('seed')}}}],
    plan:v=>result(v,'continue',[{kind:'reuse',gap:'flex',template:'seed',alias:'new'},
      {kind:'remove',node:idOf(v,'read')}]),complete:()=>ok(1)});
  const s=e.session(),r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(()=>true));
  assert.notEqual(r.status,'COMPLETE');assert.deepEqual(count,{});
  assert.equal(e.trace.filter(x=>x.kind==='region'&&x.action==='edit').length,0);
  assert.equal(e.trace.filter(x=>x.kind==='region'&&x.action==='proposal-rejected').length,1);
});
test('async refresh may await actual work; write or read after synchronous lease closes denies ignored attempts',async()=>{
  for(const mode of ['valid','late-write','late-read'] as const){
    const e=environment(),original=e.region<number>({}),count:Record<string,number>={},a=capability('read',x=>x,count);
    const d=e.region<number>({capabilities:[a],layout:[{kind:'anchor',id:'a',node:{alias:'a',capability:'read',input:{value:ctx('quote')}}}],
      refresh:async(input,root,previous,w)=>{
        const before=await Promise.resolve(original.refresh(input,root,previous,w));
        if(before.status!=='COMPLETE')return before;
        const actual=await root.invoke(()=>7);
        if(actual.status!=='COMPLETE')return actual;
        if(mode==='late-write')w.put('quote',integer,1);
        return before;
      },
      plan:async v=>{
        if(mode==='late-read'){await Promise.resolve();v.reader.read('quote',integer);}
        return result(v,accepted(v,'read')?'finish':'continue');
      },complete:v=>v.reader.read(idOf(v,'read')+'/value',integer)});
    const s=e.session(),r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===5));
    assert.equal(r.status==='COMPLETE',mode==='valid',mode);
    assert.equal(count.read??0,mode==='valid'?1:0,mode);
  }
});

test('region actual clarification wait pauses active time; fake feedback is rejected', {timeout:8000}, async()=>{
  for(const mode of ['actual','fake'] as const){
    const e=environment();
    let asked=false;
    const d=e.region<number>({plan:v=>{if(!asked){asked=true;return result(v,'clarify');}return result(v,'finish');},
      clarify:async(_v,root)=>{
        if(mode==='fake'){e.change(3);return ok(undefined);}
        const interaction=new InteractionElement({onPrompt:(p,actual)=>{setTimeout(()=>actual.submit({
          intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quote:3}}),1200);}});
        const answer=await interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_s,event)=>event.kind==='initial'
          ?ok({kind:'clarify',state:1,prompt:{decisionKey:'quote',title:'quote',actions:['submit'],fields:[{id:'quote',kind:'number',label:'quote',required:true}]}})
          :event.response.action==='submit'&&typeof event.response.values.quote==='number'?ok({kind:'ready',intent:event.response.values.quote}):deny()));
        if(answer.status!=='COMPLETE')return answer;e.change(answer.value);return ok(undefined);
      },complete:v=>v.reader.read('quote',integer)});
    const s=new StandardWorkflowSession(rootLimits,{knowledge:e.policy,current:()=>true,limits:{...baseControl,maxActiveMs:800,maxWallMs:6000},
      observe:r=>{e.trace.push(r);}});
    const r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===3));
    assert.equal(r.status==='COMPLETE',mode==='actual',mode);
    assert.equal(e.trace.filter(x=>x.kind==='region'&&x.action==='feedback').length,mode==='actual'?1:0);
    if(mode==='actual')assert.deepEqual(r,ok(3));
  }
});

test('shared-frame child actual source expiry in parent candidate sink rejects parent publication',async()=>{
  let asOf=1;
  const policy={maxItems:2,equal:Object.is,current:()=>({epoch:1,context:{scope:'shop',revisions:new Map([['vehicle','1'],['quote','1']]),asOf}})};
  const guard=()=>true;
  const child=bindWorkflowRegion<number,number>({id:'child',description:'child',inputs:{value:integer},outputs:{value:integer},
    input:r=>r.read('value',integer),output:(v,w)=>w.put('value',integer,v),
    node:{id:'child',goal:'actual child',requiredKnowledge:[],before:()=>ok(undefined),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
    create:v=>ok({id:'child',goal:'actual quote evidence',limits:{...limits,maxDescendantDepth:0},capabilities:[],constraints:[],
      knowledge:policy,current:guard,requiredKnowledge:[{key:'quote',accepts:['authority']}],optionalKnowledge:[],contextSlots:{value:integer},
      layout:[],refresh:(_i,_root,_prev,w)=>{const a=w.put('value',integer,v);return a.status!=='COMPLETE'?a:ok({
        changed:[],dependencies:[{key:'quote',dependsOn:[]}],observations:[{key:'quote',origin:'authority',state:'known',value:v,
          source:{id:'quote',scope:'shop',revision:'1',validity:{from:0,until:5}}}],slotEvidence:{value:['quote']}});},
      plan:view=>result(view,'finish'),admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),
      replay:'never',complete:view=>view.reader.read('value',integer)})});
  const outer:WorkflowRegionDefinition<void,number>={id:'outer',goal:'outer',limits:{...limits,maxDescendantDepth:1},
    capabilities:[child],constraints:[],knowledge:policy,current:guard,requiredKnowledge:[{key:'vehicle',accepts:['authority']}],
    optionalKnowledge:[],contextSlots:{value:integer},layout:[{kind:'anchor',id:'child',node:{alias:'a',capability:'child',input:{value:ctx('value')}}}],
    refresh:(_i,_root,_prev,w)=>{const a=w.put('value',integer,7);return a.status!=='COMPLETE'?a:ok({
      changed:[],dependencies:[{key:'vehicle',dependsOn:[]}],observations:[{key:'vehicle',origin:'authority',state:'known',value:7,
        source:{id:'vehicle',scope:'shop',revision:'1'}}],slotEvidence:{value:['vehicle']}});},
    plan:v=>result(v,accepted(v,'child')?'finish':'continue'),admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),
    replay:'never',complete:v=>v.reader.read(idOf(v,'child')+'/value',integer)};
  const s=new StandardWorkflowSession(rootLimits,{knowledge:policy,current:guard,limits:baseControl,evidence:{required:true,emit:r=>{
    if(r.kind==='node'&&r.phase==='candidate'&&r.occurrence.definitionId==='child')asOf=5;return ok(undefined);}}});
  const r=await s.run(root=>runWorkflowRegion(root,outer,undefined),completion<number>(()=>true));
  assert.notEqual(r.status,'COMPLETE');
  const n=s.dispositions().find(x=>x.kind==='node'&&x.occurrence.definitionId==='child');
  assert.equal(n?.kind==='node'&&n.acceptance==='accepted',false);
});

test('private child frame never leaks into parent keys; actual child may replay only with safe trace',async()=>{
  for(const mode of ['valid','replay','committed','late'] as const){
    const e=environment(),count:Record<string,number>={};
    let privateEpoch=1,privateValue=2,asked=false,creates=0;
    const policy={maxItems:1,equal:Object.is,current:()=>({epoch:privateEpoch,context:{
      scope:'private-child',revisions:new Map([['private-source',String(privateEpoch)]])}})};
    const leaf=capability('private-leaf',x=>x*2,count,mode==='committed'?'committed':'none');
    const child=bindWorkflowRegion<number,number>({id:'child',description:'private child',inputs:{value:integer},outputs:{value:integer},
      input:r=>r.read('value',integer),output:(v,w)=>w.put('value',integer,v),
      node:{id:'child',goal:'child',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
        after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
      create:()=>{creates++;return ok({
        id:'private-child',goal:'private source',limits:{...limits,maxDescendantDepth:0},capabilities:[leaf],constraints:[],
        knowledge:policy,current:()=>true,requiredKnowledge:[{key:'private-key',accepts:['authority']}],optionalKnowledge:[],
        contextSlots:{privateValue:integer},layout:[{kind:'anchor',id:'private',node:{alias:'p',capability:'private-leaf',input:{value:ctx('privateValue')}}}],
        refresh:(_i,_root,_prev,w)=>{const a=w.put('privateValue',integer,privateValue);return a.status!=='COMPLETE'?a:ok({
          changed:[],dependencies:[{key:'private-key',dependsOn:[]}],observations:[{key:'private-key',origin:'authority',state:'known',
            value:privateValue,source:{id:'private-source',scope:'private-child',revision:String(privateEpoch)}}],slotEvidence:{privateValue:['private-key']}});},
        plan:v=>result(v,accepted(v,'private-leaf')?'finish':'continue'),admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),
        replay:'pure-read-only',complete:v=>v.reader.read(idOf(v,'private-leaf')+'/value',integer)
      });}});
    const d=e.region<number>({capabilities:[child,leaf],layout:[{kind:'anchor',id:'child',node:{alias:'a',capability:'child',input:{value:ctx('quote')}}}],
      plan:v=>{
        assert.ok(v.knowledge?.complete);
        assert.deepEqual(v.knowledge.items.map(i=>i.key),['vehicle','quote']);
        assert.ok(!v.slots.includes('privateValue'));
        if(accepted(v,'child')&&!asked&&(mode==='replay'||mode==='committed')){asked=true;return result(v,'clarify');}
        return result(v,accepted(v,'child')?'finish':'continue');
      },
      clarify:async(_v,root)=>{
        const interaction=new InteractionElement({onPrompt:(p,actual)=>{setImmediate(()=>actual.submit({
          intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quote:3}}));}});
        const answer=await interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_s,event)=>event.kind==='initial'
          ?ok({kind:'clarify',state:1,prompt:{decisionKey:'quote',title:'quote',actions:['submit'],fields:[{id:'quote',kind:'number',label:'quote',required:true}]}})
          :event.response.action==='submit'&&typeof event.response.values.quote==='number'?ok({kind:'ready',intent:event.response.values.quote}):deny()));
        if(answer.status!=='COMPLETE')return answer;privateEpoch++;privateValue=answer.value;return ok(undefined);
      },complete:v=>v.reader.read(idOf(v,'child')+'/value',integer)});
    const s=new StandardWorkflowSession(rootLimits,{knowledge:e.policy,current:()=>true,limits:baseControl,evidence:{required:true,emit:r=>{
      if(mode==='late'&&r.kind==='node'&&r.phase==='candidate'&&r.occurrence.definitionId==='child')privateEpoch++;
      return ok(undefined);
    }}});
    const r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===(mode==='replay'?6:4)));
    assert.equal(r.status==='COMPLETE',mode==='valid'||mode==='replay',mode);
    assert.equal(creates,mode==='replay'?2:1,mode);
    assert.equal(count['private-leaf'],mode==='replay'?2:1,mode);
    const records=s.dispositions().filter(x=>x.kind==='node').filter(x=>x.occurrence.definitionId==='child');
    if(mode==='replay'){
      assert.deepEqual(records.map(x=>x.occurrence.attempt),[1,2]);assert.equal(records[0]?.occurrence.instanceId,records[1]?.occurrence.instanceId);
    }
    if(mode==='committed')assert.ok(s.dispositions().some(x=>x.kind==='node'&&x.effect==='committed'&&x.receiptId==='receipt-1'));
    if(mode==='late')assert.notEqual(records[0]?.acceptance,'accepted');
  }
});

test('zero-output required node keeps own currentness, including revision/expiry and actual replay',async()=>{
  for(const mode of ['unchanged','unrelated','revision','expiry','replay','committed','late'] as const){
    let epoch=1,revision='1',asOf=1,until=3,authorized=true,runs=0,reads=0,pre=0,completeCalls=0,asked=false;
    const trace:WorkflowObservation[]=[];
    const policy={maxItems:2,equal:Object.is,current:()=>({epoch,context:{scope:'shop',asOf,revisions:new Map([['quote',revision],['unrelated',String(epoch)]])}})};
    const cap=bindWorkflowFunction<void,void>({id:'gate',description:'mandatory current authorization',inputs:{},outputs:{},input:()=>ok(undefined),output:()=>ok(undefined),
      node:{id:'gate',goal:'check quote',requiredKnowledge:[{key:'quote',accepts:['authority']}],replay:mode==='replay'||mode==='committed'?'pure-read-only':'never',
        knowledge:()=>{reads++;return ok([{key:'quote',origin:'authority',state:'known',value:authorized,source:{id:'quote',scope:'shop',revision,validity:{from:0,until}}}]);},
        before:(_i,_r,v)=>{pre++;return v.knowledge?.complete&&v.knowledge.items.some(i=>i.key==='quote'&&i.status==='resolved'&&i.value===true)?ok(undefined):deny();},
        run:()=>{runs++;return ok(undefined);},after:()=>ok(undefined),
        project:()=>mode==='committed'?{effect:'committed',receiptId:'gate-receipt',detail:null}:{effect:'none',detail:null}}});
    const d:WorkflowRegionDefinition<void,number>={id:'gate-region',goal:'current mandatory gate',limits,capabilities:[cap],constraints:[],knowledge:policy,current:()=>true,
      requiredKnowledge:[],optionalKnowledge:[],contextSlots:{},layout:[{kind:'anchor',id:'gate',node:{alias:'a',capability:'gate',input:{}}}],
      refresh:()=>ok({changed:[],dependencies:[],observations:[],slotEvidence:{}}),
      plan:v=>{if(!accepted(v,'gate'))return result(v,'continue');if(!asked){asked=true;return result(v,'clarify');}return result(v,'finish');},
      admit:()=>ok(undefined),canSkip:()=>deny(),canRebind:()=>deny(),replay:'never',
      clarify:async(_v,root)=>{
        const interaction=new InteractionElement({onPrompt:(p,actual)=>{setImmediate(()=>actual.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quote:2}}));}});
        const response=await interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_s,event)=>event.kind==='initial'
          ?ok({kind:'clarify',state:1,prompt:{decisionKey:'quote',title:'change source',actions:['submit'],fields:[{id:'quote',kind:'number',label:'quote',required:true}]}})
          :event.response.action==='submit'&&typeof event.response.values.quote==='number'?ok({kind:'ready',intent:event.response.values.quote}):deny()));
        if(response.status!=='COMPLETE')return response;
        if(mode==='expiry')asOf=3;
        else if(mode==='unrelated')epoch++;
        else if(['revision','replay','committed'].includes(mode)){epoch++;revision='2';authorized=mode==='replay';until=10;}
        return ok(undefined);
      },
      complete:v=>{completeCalls++;return accepted(v,'gate')?ok(1):deny();}};
    const s=new StandardWorkflowSession(rootLimits,{knowledge:policy,current:()=>true,limits:baseControl,observe:r=>{trace.push(r);},
      evidence:{required:true,emit:r=>{if(mode==='late'&&r.kind==='region'&&r.action==='complete')asOf=3;return ok(undefined);}}});
    const r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===1));
    const passes=mode==='unchanged'||mode==='unrelated'||mode==='replay';
    assert.equal(r.status==='COMPLETE',passes,mode);
    assert.deepEqual([runs,reads,pre],mode==='replay'?[2,2,2]:[1,1,1],mode);
    assert.equal(completeCalls,passes||mode==='late'?1:0,mode);
    assert.equal(trace.filter(x=>x.kind==='region'&&x.action==='feedback').length,1,mode);
    const records=s.dispositions().filter(x=>x.kind==='node'&&x.occurrence.definitionId==='gate');
    assert.equal(records.length,mode==='replay'?2:1,mode);
    assert.ok(records.every(x=>x.kind==='node'&&x.acceptance==='accepted'));
    if(mode==='replay'){const a=records[0],b=records[1];assert.ok(a?.kind==='node'&&b?.kind==='node');assert.equal(a.occurrence.instanceId,b.occurrence.instanceId);assert.equal(b.occurrence.attempt,2);}
    if(mode==='committed'){const a=records[0];assert.ok(a?.kind==='node');assert.equal(a.receiptId,'gate-receipt');}
    assert.equal(new Set(trace.map(x=>x.runId)).size,1);
  }
});

test('accepted mandatory predecessor fences later effects, including private child proofs and nested descendants',async()=>{
  for(const privateGate of [false,true])for(const nestedEffect of [false,true])
    for(const mode of ['current','before','enter','run','candidate'] as const){
      let asOf=1,gateRuns=0,pre=0,effects=0,completeCalls=0;
      const label=JSON.stringify({privateGate,nestedEffect,mode});
      const policy={maxItems:1,equal:Object.is,current:()=>({epoch:1,context:{scope:'shop',asOf:privateGate?1:asOf,revisions:new Map([['quote','1']])}})};
      const privatePolicy={maxItems:1,equal:Object.is,current:()=>({epoch:1,context:{scope:'private',asOf,revisions:new Map([['private-quote','1']])}})};
      const gatePolicy=privateGate?privatePolicy:policy;
      const gate=bindWorkflowFunction<void,void>({id:'gate',description:'mandatory current authority',inputs:{},outputs:{},input:()=>ok(undefined),output:()=>ok(undefined),
        node:{id:'gate',goal:'authorization',requiredKnowledge:[{key:'quote',accepts:['authority']}],replay:'never',
          knowledge:()=>ok([{key:'quote',origin:'authority',state:'known',value:true,source:{id:privateGate?'private-quote':'quote',
            scope:privateGate?'private':'shop',revision:'1',validity:{from:0,until:3}}}]),
          before:()=>ok(undefined),run:()=>{gateRuns++;return ok(undefined);},after:()=>ok(undefined),project:()=>({effect:'none',detail:null})}});
      const effect=bindWorkflowFunction<void,void>({id:'effect',description:'authorized synthetic effect',inputs:{},outputs:{},input:()=>ok(undefined),output:()=>ok(undefined),
        node:{id:'effect',goal:'authorized effect',requiredKnowledge:[],before:()=>{pre++;if(mode==='before')asOf=3;return ok(undefined);},
          run:()=>{effects++;if(mode==='run')asOf=3;return ok(undefined);},after:()=>ok(undefined),
          project:()=>({effect:'committed',receiptId:'synthetic-receipt',detail:null})}});
      const anchor=(c:WorkflowCapability)=>({kind:'anchor' as const,id:c.id,node:{alias:c.id,capability:c.id,input:{}}});
      const wrap=(id:string,c:WorkflowCapability,k:typeof policy)=>bindWorkflowRegion<void,void>({id,description:id,inputs:{},outputs:{},input:()=>ok(undefined),output:()=>ok(undefined),
        node:{id,goal:id,requiredKnowledge:[],before:()=>ok(undefined),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
        create:()=>ok({id,goal:id,limits:{...limits,maxDescendantDepth:0},capabilities:[c],constraints:[],knowledge:k,current:()=>true,requiredKnowledge:[],optionalKnowledge:[],
          contextSlots:{},layout:[anchor(c)],refresh:()=>ok({changed:[],dependencies:[],observations:[],slotEvidence:{}}),
          plan:v=>result(v,accepted(v,c.id)?'finish':'continue'),admit:()=>ok(undefined),canSkip:()=>deny(),canRebind:()=>deny(),
          replay:'never',complete:()=>ok(undefined)})});
      const g=privateGate?wrap('gate-region',gate,gatePolicy):gate;
      const e=nestedEffect?wrap('effect-region',effect,policy):effect;
      const d:WorkflowRegionDefinition<void,number>={id:'outer',goal:'gate before effect',limits,capabilities:[...new Set([g,e,gate,effect])],constraints:[],
        knowledge:policy,current:()=>true,requiredKnowledge:[],optionalKnowledge:[],contextSlots:{},layout:[anchor(g),anchor(e)],replay:'never',
        refresh:()=>ok({changed:[],dependencies:[],observations:[],slotEvidence:{}}),
        plan:v=>result(v,accepted(v,e.id)?'finish':'continue'),admit:()=>ok(undefined),canSkip:()=>deny(),canRebind:()=>deny(),
        complete:()=>{completeCalls++;return ok(1);}};
      const s=new StandardWorkflowSession(rootLimits,{knowledge:policy,current:()=>true,limits:baseControl,evidence:{required:true,emit:r=>{
        if(r.kind==='node'&&r.occurrence.definitionId==='effect'&&((mode==='enter'&&r.phase==='enter')||(mode==='candidate'&&r.phase==='candidate')))asOf=3;
        return ok(undefined);
      }}});
      const r=await s.run(root=>runWorkflowRegion(root,d,undefined),completion<number>(v=>v===1));
      assert.equal(r.status==='COMPLETE',mode==='current',label);
      assert.equal(gateRuns,1,label);assert.equal(pre,1,label);
      assert.equal(effects,mode==='before'||mode==='enter'?0:1,label);
      assert.equal(completeCalls,mode==='current'?1:0,label);
      const records=s.dispositions().filter(x=>x.kind==='node');
      const gRecord=records.find(x=>x.occurrence.definitionId==='gate'),eRecord=records.find(x=>x.occurrence.definitionId==='effect');
      assert.equal(gRecord?.acceptance,'accepted',label);assert.ok(eRecord,label);
      assert.equal(eRecord.acceptance==='accepted',mode==='current',label);
      if(effects){assert.equal(eRecord.effect,'committed',label);assert.equal(eRecord.receiptId,'synthetic-receipt',label);}
      else{assert.equal(eRecord.entered,false,label);assert.equal(eRecord.effect,'not-applicable',label);}
    }
});
