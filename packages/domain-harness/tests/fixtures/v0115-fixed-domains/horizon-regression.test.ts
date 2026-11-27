import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { assign, fromPromise, setup } from 'xstate';
import { InteractionElement, StandardWorkflowSession, XStateWorkflowElement, bindWorkflowFunction, bindWorkflowRegion,
  createWorkflowSlot, runWorkflowRegion } from '@kaicreator/domain-harness';
import type { EvidenceObservation, NativeWorkflowContext, WorkflowCapability, WorkflowCompletionPolicy, WorkflowKnowledgePolicy,
  WorkflowNode, WorkflowNodeOptions, WorkflowObservation, WorkflowRegionDefinition, WorkflowRegionProposal, WorkflowRegionView,
  WorkflowSlotBinding } from '@kaicreator/domain-harness';
import { fixture, ok, fail, reject, scheduleMetrics, solveRepair } from './domain.js';
import type { Job, Outcome, Schedule } from './domain.js';

// 独立公开合成回归：D-B 有限调度求解器的 horizon 上界。不读取评价者隐藏材料；
// 期望值只来自冻结公开枚举、本文件的独立穷举 oracle 与实际 SciPy 进程。
// 上界 12 与 L2 指名的先前 SciPy witness（examples/qualification/workshop，至多 12 个离散时段）一致。
const SOLVER_LIMIT=12;
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);

// 独立穷举 oracle：按 I1..I3、R1..R3 枚举 (horizon+1)^6 个开始时间向量；不使用 MILP，也不复用 scheduleMetrics。
type Objective=readonly [makespan:number,sum:number];
function enumerate(jobs:readonly Job[],deadline:number,horizon:number){
  const n=jobs.length,starts:number[]=new Array(2*n).fill(0),byMakespan=new Map<number,number>();
  let valid=0,best:Objective|null=null,optimal=0;
  const visit=(p:number):void=>{
    if(p<2*n){
      const inspect=p<n,i=inspect?p:p-n,j=jobs[i]!,duration=inspect?j.I:j.R;
      for(let s=inspect?j.release:starts[i]!+j.I;s<=Math.min(deadline,horizon)-duration;s++){
        let free=true;
        for(let k=0;k<i;k++){const other=jobs[k]!,at=inspect?starts[k]!:starts[n+k]!;
          if(s<at+(inspect?other.I:other.R)&&at<s+duration){free=false;break;}}
        if(free){starts[p]=s;visit(p+1);}
      }
      return;
    }
    valid++;const ends=jobs.map((job,i)=>starts[n+i]!+job.R),makespan=Math.max(...ends),sum=ends.reduce((a,b)=>a+b,0);
    byMakespan.set(makespan,(byMakespan.get(makespan)??0)+1);
    if(!best||makespan<best[0]||makespan===best[0]&&sum<best[1]){best=[makespan,sum];optimal=1;}
    else if(makespan===best[0]&&sum===best[1])optimal++;
  };
  visit(0);
  return {valid,byMakespan,best,optimal};
}
type ReleaseChange={id:string;job:string;release:number;independentEnumeration:{feasible:number;objective:number[];optimalCount:number}};
type FrozenDB={horizon:number;jobs:Job[];enumeration:{vectors:number;valid:number;byMakespan:Record<string,number>;best:number[];optimalVectors:number[][]};
  deadlineCases:{deadline:number;feasible:number}[];sourceChanges:({id:string}&Partial<Omit<ReleaseChange,'id'>>)[]};
// domain.js 导入时已校验同一文件的 SHA256；这里只读取其类型未声明的冻结枚举字段。
const frozenDB=(JSON.parse(readFileSync(new URL('./domains.json',import.meta.url),'utf8')) as {DB:FrozenDB}).DB;
const isRelease=(c:FrozenDB['sourceChanges'][number]):c is ReleaseChange=>c.job!==undefined&&c.release!==undefined&&c.independentEnumeration!==undefined;
const releaseChanged=(c:ReleaseChange):Job[]=>fixture.DB.jobs.map(j=>j.id===c.job?{...j,release:c.release}:j);

function source(scope:string){
  let epoch=1;
  const policy:WorkflowKnowledgePolicy={maxItems:16,equal:Object.is,
    current:()=>({epoch,context:{scope,revisions:new Map([['authority',String(epoch)]])}})};
  const observations=(values:Record<string,unknown>):EvidenceObservation<string,unknown>[]=>Object.entries(values).map(([key,value])=>({
    key,origin:'authority',source:{id:'authority',scope,revision:String(epoch)},state:'known',value}));
  return {policy,observations,change:()=>{epoch++;}};
}
type Source=ReturnType<typeof source>;
const req=(...keys:string[])=>keys.map(key=>({key,accepts:['authority'] as const}));
const opts=(s:Source):WorkflowNodeOptions=>({knowledge:s.policy,current:()=>true});
const session=(s:Source,trace:WorkflowObservation[])=>new StandardWorkflowSession({maxCalls:100,maxSteps:200,maxDepth:6},{
  limits:{maxWork:10000000,maxEvents:300,maxActiveScopes:20,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:8},
  knowledge:s.policy,current:()=>true,observe:r=>{trace.push(r);}
});
type Stats={query:number;solve:number;verify:number};
const stats=():Stats=>({query:0,solve:0,verify:0});
function finalPolicy<T>(s:Source,goal:string,facts:()=>Record<string,unknown>,validate:(value:T)=>boolean):WorkflowCompletionPolicy<T>{
  return {goal,requiredKnowledge:req(...Object.keys(facts())),terminalReads:1,
    observe:(_value,terminal)=>terminal.read(()=>ok(s.observations(facts()))),
    validate:(value,view)=>view.knowledge?.complete&&view.knowledge.items.every(i=>i.status==='resolved')&&validate(value)?ok(undefined):reject('FINAL_GOAL')};
}
type Fixed<I,Q,O>={read:WorkflowNode<I,Q>;solve:WorkflowNode<Q,O>;verify:WorkflowNode<O,O>;policy:WorkflowCompletionPolicy<O>};
function repair(s:Source,count:Stats,deadline:number,jobs:readonly Job[]):Fixed<number,Job[],Schedule>{
  const resources=()=>({complete:true,jobs,resources:{I:1,R:1}}),partial=req('complete','resources'),all=req('complete','jobs','resources');
  return {
    read:{id:'resource-read',goal:'current job release and resource capacity',requiredKnowledge:all,
      knowledge:()=>ok(s.observations(resources())),
      before:()=>ok(undefined),run:()=>{count.query++;return ok(jobs.map(j=>({...j})));},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:{resources:'I/R'}})},
    solve:{id:'repair-milp',goal:'min makespan then sum completion',requiredKnowledge:partial,
      knowledge:()=>ok(s.observations({complete:true,resources:{I:1,R:1}})),
      before:j=>j.length===3?ok(undefined):reject('MISSING_JOBS'),
      run:async(j,scope)=>{count.solve++;return scope.work(64,()=>solveRepair(j,deadline,scope.signal));},
      terminalReads:1,after:async(j,a,terminal)=>{
        const authoritative=await terminal.read(()=>ok(s.observations(resources())));
        return authoritative.status==='COMPLETE'&&authoritative.value.length===3&&a.kind==='returned'&&a.outcome.status==='COMPLETE'&&scheduleMetrics(j,a.outcome.value.starts,deadline)?ok(undefined):reject('SCHEDULE_POST');
      },
      project:()=>({effect:'none',detail:{solver:'scipy-milp'}})},
    verify:{id:'schedule-verify',goal:'release precedence and resource non-overlap',requiredKnowledge:all,
      knowledge:()=>ok(s.observations(resources())),
      before:()=>ok(undefined),run:r=>{count.verify++;const v=scheduleMetrics(jobs,r.starts,deadline);return v?ok(v):reject('SCHEDULE_INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:{verified:true}})},
    policy:finalPolicy<Schedule>(s,'feasible current repair schedule',resources,p=>{
      const v=scheduleMetrics(jobs,p.starts,deadline);return !!v&&v.makespan===p.makespan&&v.sum===p.sum;})
  };
}
async function native<I,Q,O>(root:NativeWorkflowContext,p:Fixed<I,Q,O>,s:Source,input:I):Promise<Outcome<O>>{
  const q=await root.node(p.read,input,opts(s));if(q.status!=='COMPLETE')return q;
  const result=await root.child(0,child=>child.node(p.solve,q.value,opts(s)));if(result.status!=='COMPLETE')return result;
  return root.node(p.verify,result.value,opts(s));
}
// 两个领域定义各自实例化实际状态机；业务节点、数据和验证器由对应领域提供。
function machine<I,Q,O>(p:Fixed<I,Q,O>,s:Source,input:I,id:string){
  type Input={scope:NativeWorkflowContext};
  type Ctx=Input&{query?:Q;candidate?:O;result:Outcome<O>};
  const logic=setup({
    types:{} as {context:Ctx;input:Input;output:Outcome<O>},
    actors:{
      read:fromPromise<Outcome<Q>,Input>(async({input:arg})=>arg.scope.node(p.read,input,opts(s))),
      solve:fromPromise<Outcome<O>,Input&{query:Q}>(async({input:arg})=>arg.scope.child(0,child=>child.node(p.solve,arg.query,opts(s)))),
      verify:fromPromise<Outcome<O>,Input&{candidate:O}>(async({input:arg})=>arg.scope.node(p.verify,arg.candidate,opts(s)))
    }
  }).createMachine({id,context:({input:arg})=>({...arg,result:fail('NOT_RUN')}),initial:'read',
    states:{
      read:{invoke:{src:'read',input:({context})=>({scope:context.scope}),onDone:[
        {guard:({event})=>event.output.status==='COMPLETE',target:'solve',
          actions:assign(({event})=>event.output.status==='COMPLETE'?{query:event.output.value}:{})},
        {target:'done',actions:assign({result:({event})=>event.output.status==='COMPLETE'?fail('BAD_BRANCH'):event.output})}
      ]}},
      solve:{invoke:{src:'solve',input:({context})=>({scope:context.scope,query:context.query!}),onDone:[
        {guard:({event})=>event.output.status==='COMPLETE',target:'verify',
          actions:assign(({event})=>event.output.status==='COMPLETE'?{candidate:event.output.value}:{})},
        {target:'done',actions:assign({result:({event})=>event.output})}
      ]}},
      verify:{invoke:{src:'verify',input:({context})=>({scope:context.scope,candidate:context.candidate!}),
        onDone:{target:'done',actions:assign({result:({event})=>event.output})}}},
      done:{type:'final'}
    },output:({context})=>context.result});
  return new XStateWorkflowElement(logic,x=>x);
}
async function fixed<I,Q,O>(root:NativeWorkflowContext,s:Source,p:Fixed<I,Q,O>,input:I,mode:'native'|'xstate',id:string):Promise<Outcome<O>>{
  const decision=root.recordModelDecision('fixed professional domain calculation','not-needed');
  if(decision.status!=='COMPLETE')return decision;
  return mode==='native'?native(root,p,s,input):
    machine(p,s,input,id).runIn(scope=>({scope}),root,{maxProjections:8,project:snap=>String(snap.value)});
}
function execute<I,Q,O>(s:StandardWorkflowSession,src:Source,p:Fixed<I,Q,O>,input:I,mode:'native'|'xstate',id:string){
  return s.run(root=>fixed(root,src,p,input,mode,id),p.policy);
}
function assertFixedTrace(s:StandardWorkflowSession,trace:WorkflowObservation[],actor:boolean){
  const actual=trace.filter(r=>r.kind==='node'&&r.phase==='actual');
  assert.deepEqual(actual.map(r=>r.kind==='node'?r.occurrence.definitionId:null),['resource-read','repair-milp','schedule-verify']);
  const final=s.dispositions().filter(r=>r.kind==='node');
  assert.equal(final.length,3);assert.ok(final.every(r=>r.acceptance==='accepted'));
  assert.equal(new Set(trace.map(r=>r.runId)).size,1);
  const decisions=trace.filter(r=>r.kind==='model');
  assert.equal(decisions.length,1);
  assert.ok(decisions[0]?.action==='not-needed'&&decisions[0].usage.kind==='unavailable');
  if(actor)assert.deepEqual(trace.filter(r=>r.kind==='actor').map(r=>r.detail),['read','solve','verify','done']);
}
// 真实领域先得到原结果，再通过同根交互取得新约束，由域在旧借用作用域关闭后更新事实。
async function revisedConstraint(root:NativeWorkflowContext,key:string,answer:number):Promise<Outcome<number>>{
  let submitted=false;
  const interaction=new InteractionElement({onPrompt:(prompt,actual)=>{
    setImmediate(()=>{submitted=actual.submit({intentId:prompt.intentId,revision:prompt.revision,
      decisionKey:prompt.decisionKey,action:'submit',values:{value:answer}}).accepted;});
  }});
  const result=await interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_state,event)=>{
    if(event.kind==='initial')return ok({kind:'clarify',state:1,prompt:{
      decisionKey:key,title:'Revise current constraint',actions:['submit'],
      fields:[{id:'value',kind:'number',label:key,required:true,min:1,max:SOLVER_LIMIT}]}});
    if(event.response.action!=='submit'||typeof event.response.values.value!=='number')return reject('INVALID_FEEDBACK');
    return ok({kind:'ready',intent:event.response.values.value});
  }));
  assert.equal(submitted,true);
  assert.equal(interaction.current(),undefined);
  return result;
}
const solver=fileURLToPath(new URL('./repair-solver.py',import.meta.url));
type SolverReply={status:string;solver:string;starts?:number[]};
function runSolver(python:string,request:unknown){
  return new Promise<{code:number|null;stdout:string;stderr:string}>(resolve=>{
    let stdout='',stderr='';
    const proc=spawn(python,[solver,JSON.stringify(request)],{stdio:['ignore','pipe','pipe'],
      env:{PATH:process.env.PATH??'',LANG:'C.UTF-8',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
    proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
    proc.stdout.on('data',(chunk:string)=>{stdout+=chunk;});proc.stderr.on('data',(chunk:string)=>{stderr+=chunk;});
    proc.once('error',()=>resolve({code:null,stdout,stderr}));
    proc.once('close',code=>resolve({code,stdout,stderr}));
  });
}

test('independent exhaustive enumerator reproduces the frozen D-B enumeration before it is used above the ceiling',()=>{
  const db=frozenDB,base=enumerate(db.jobs,db.horizon,db.horizon);
  assert.equal((db.horizon+1)**6,db.enumeration.vectors);
  assert.equal(base.valid,db.enumeration.valid);
  assert.deepEqual(Object.fromEntries(base.byMakespan),db.enumeration.byMakespan);
  assert.deepEqual(base.best,db.enumeration.best);
  assert.equal(base.optimal,db.enumeration.optimalVectors.length);
  for(const c of db.deadlineCases)assert.equal(enumerate(db.jobs,c.deadline,db.horizon).valid,c.feasible);
  const release=db.sourceChanges.find(isRelease)!,changed=enumerate(releaseChanged(release),db.horizon,db.horizon);
  assert.equal(changed.valid,release.independentEnumeration.feasible);
  assert.deepEqual(changed.best,release.independentEnumeration.objective);
  assert.equal(changed.optimal,release.independentEnumeration.optimalCount);
});

for(const mode of ['native','xstate'] as const){
  test('D-B '+mode+' fixed schedule accepts frozen jobs above the former horizon ceiling',async()=>{
    assert.ok(process.env.DH_WITNESS_PYTHON,'Explicit solver environment required');
    const release=frozenDB.sourceChanges.find(isRelease)!,revised=releaseChanged(release);
    for(const deadline of [9,10,SOLVER_LIMIT] as const)for(const [label,jobs,expected] of [
      ['initial',fixture.DB.jobs,fixture.DB.enumeration.best],['revised',revised,release.independentEnumeration.objective]] as const){
      // 独立穷举与冻结独立计算一致：更宽的 horizon 只增加可行向量，不改变最优目标。
      assert.deepEqual(enumerate(jobs,deadline,deadline).best,expected);
      assert.deepEqual(expected,[7,16]);
      const src=source('repair-'+label),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace);
      const result=await execute(s,src,repair(src,count,deadline,jobs),deadline,mode,'repair');
      assert.equal(result.status,'COMPLETE',label+' deadline '+deadline);
      if(result.status==='COMPLETE'){
        const metrics=scheduleMetrics(jobs,result.value.starts,deadline);
        assert.deepEqual(metrics,result.value);
        assert.deepEqual([metrics?.makespan,metrics?.sum],[7,16]);
      }
      assert.deepEqual(count,{query:1,solve:1,verify:1});
      assertFixedTrace(s,trace,mode==='xstate');
    }
  });
  test('D-B '+mode+' fixed schedule solves a synthetic instance that is infeasible under the former ceiling',async()=>{
    assert.ok(process.env.DH_WITNESS_PYTHON,'Explicit solver environment required');
    // 合成实例：修复总时长 10、最早开工 1，makespan 下界 11，原上界 8 之内不可行。
    const jobs:Job[]=[{id:'K1',release:0,I:1,R:3},{id:'K2',release:0,I:2,R:4},{id:'K3',release:1,I:1,R:3}];
    assert.deepEqual([8,9,10].map(d=>enumerate(jobs,d,d).best),[null,null,null]);
    assert.deepEqual([11,12].map(d=>enumerate(jobs,d,d).best),[[11,22],[11,22]]);
    const tight=source('repair-tight'),tightCount=stats(),tightTrace:WorkflowObservation[]=[];
    const infeasible=await execute(session(tight,tightTrace),tight,repair(tight,tightCount,8,jobs),8,mode,'repair-tight');
    assert.equal(infeasible.status,'REJECT');
    if(infeasible.status==='REJECT')assert.equal(infeasible.reason.code,'INFEASIBLE');
    assert.deepEqual(tightCount,{query:1,solve:1,verify:0});
    for(const deadline of [11,12] as const){
      const src=source('repair-synthetic'),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace);
      const result=await execute(s,src,repair(src,count,deadline,jobs),deadline,mode,'repair-synthetic');
      assert.equal(result.status,'COMPLETE');
      if(result.status==='COMPLETE'){
        const metrics=scheduleMetrics(jobs,result.value.starts,deadline);
        assert.deepEqual(metrics,result.value);
        assert.deepEqual([metrics?.makespan,metrics?.sum],[11,22]);
        assert.equal(metrics?.makespan,11);
      }
      assert.deepEqual(count,{query:1,solve:1,verify:1});
      assertFixedTrace(s,trace,mode==='xstate');
    }
  });
  test('D-B '+mode+' fixed schedule stays fail-closed for over-limit and invalid demand',async()=>{
    assert.ok(process.env.DH_WITNESS_PYTHON,'Explicit solver environment required');
    for(const deadline of [SOLVER_LIMIT+1,99,7.5,Number.NaN]){
      const src=source('repair-over'),count=stats(),s=session(src,[]);
      const result=await execute(s,src,repair(src,count,deadline,fixture.DB.jobs),deadline,mode,'repair-over');
      assert.deepEqual(result,{status:'FAILED',reason:{code:'SOLVER_FAILED',message:'SOLVER_FAILED'}});
      assert.deepEqual(count,{query:1,solve:1,verify:0});
      assert.ok(s.dispositions().filter(r=>r.kind==='node').every(r=>r.occurrence.definitionId!=='repair-milp'||r.acceptance!=='accepted'));
    }
  });
}

test('actual solver process enforces the explicit finite horizon bound',async()=>{
  const python=process.env.DH_WITNESS_PYTHON;assert.ok(python,'Explicit solver environment required');
  const jobs=fixture.DB.jobs,best=fixture.DB.enumeration.best;
  const optimal=async(horizon:number,deadline:number)=>{
    const r=await runSolver(python,{jobs,deadline,horizon});
    assert.equal(r.code,0,r.stderr);assert.equal(r.stderr,'');
    const reply=JSON.parse(r.stdout) as SolverReply;
    assert.equal(reply.status,'optimal');assert.equal(reply.solver,'1.17.0');
    const metrics=scheduleMetrics(jobs,reply.starts??[],deadline);
    assert.ok(metrics);assert.deepEqual([metrics.makespan,metrics.sum],best);
  };
  await optimal(8,8);
  await optimal(SOLVER_LIMIT,8);
  await optimal(SOLVER_LIMIT,SOLVER_LIMIT);
  const rejected=async(request:unknown)=>{
    const r=await runSolver(python,request);
    assert.notEqual(r.code,0);assert.equal(r.stdout,'');assert.match(r.stderr,/invalid scheduling demand/);
  };
  await rejected({jobs,deadline:8,horizon:SOLVER_LIMIT+1});
  await rejected({jobs,deadline:SOLVER_LIMIT+1,horizon:SOLVER_LIMIT+1});
  await rejected({jobs,deadline:99,horizon:99});
  await rejected({jobs,deadline:9,horizon:8});
  await rejected({jobs,deadline:-1,horizon:8});
  await rejected({jobs,deadline:8,horizon:9.5});
  await rejected({jobs:jobs.slice(0,2),deadline:8,horizon:8});
  // 合法但不可行的实例是求解结论，不是非法输入：进程成功退出并由 TS 判为 INFEASIBLE。
  const infeasible=await runSolver(python,{jobs,deadline:6,horizon:8});
  assert.equal(infeasible.code,0,infeasible.stderr);
  assert.deepEqual(JSON.parse(infeasible.stdout) as SolverReply,{status:'infeasible',solver:'1.17.0'});
});

test('D-B above-ceiling fixed paths make no model, network or credential access',async(t)=>{
  let fetchCalls=0,connectCalls=0,credentialReads=0;
  const env=process.env;
  const forbidden=/API[_-]?KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|AUTHORIZATION/i;
  process.env=new Proxy(env,{
    get(target,key,receiver){
      if(typeof key==='string'&&forbidden.test(key)){credentialReads++;throw Error('credential access denied');}
      return Reflect.get(target,key,receiver);
    }
  });
  t.mock.method(globalThis,'fetch',()=>{fetchCalls++;throw Error('network denied');});
  t.mock.method(Socket.prototype,'connect',()=>{connectCalls++;throw Error('network denied');});
  try{
    for(const mode of ['native','xstate'] as const){
      const src=source('repair-no-network'),count=stats(),trace:WorkflowObservation[]=[];
      const result=await execute(session(src,trace),src,repair(src,count,SOLVER_LIMIT,fixture.DB.jobs),SOLVER_LIMIT,mode,'DB-no-network');
      assert.equal(result.status,'COMPLETE');
      if(result.status==='COMPLETE')assert.deepEqual([result.value.makespan,result.value.sum],fixture.DB.enumeration.best);
      assert.deepEqual(count,{query:1,solve:1,verify:1});
      const events=trace.filter(x=>x.kind==='model');
      assert.equal(events.length,1);
      assert.ok(events[0]?.action==='not-needed'&&events[0].usage.kind==='unavailable'&&!('profileId' in events[0]));
    }
    assert.deepEqual([fetchCalls,connectCalls,credentialReads],[0,0,0]);
  }finally{process.env=env;t.mock.restoreAll();}
});

test('D-B same-root feedback can loosen the deadline beyond the former ceiling',async()=>{
  assert.ok(process.env.DH_WITNESS_PYTHON,'Explicit solver environment required');
  const jobs=fixture.DB.jobs;
  for(const mode of ['native','xstate'] as const){
    const src=source('repair-feedback'),count=stats(),trace:WorkflowObservation[]=[],s=session(src,trace);
    const result=await s.run(async root=>{
      const prior=await fixed(root,src,repair(src,count,8,jobs),8,mode,'repair');
      if(prior.status!=='COMPLETE')return prior;
      assert.ok(scheduleMetrics(jobs,prior.value.starts,8));
      const revised=await revisedConstraint(root,'deadline',10);
      if(revised.status!=='COMPLETE')return revised;
      src.change();
      return fixed(root,src,repair(src,count,revised.value,jobs),revised.value,mode,'repair');
    },repair(src,count,10,jobs).policy);
    assert.equal(result.status,'COMPLETE');
    if(result.status==='COMPLETE'){
      assert.deepEqual([result.value.makespan,result.value.sum],fixture.DB.enumeration.best);
      assert.deepEqual(scheduleMetrics(jobs,result.value.starts,10),result.value);
    }
    assert.deepEqual(count,{query:2,solve:2,verify:2});
    assert.deepEqual(trace.filter(r=>r.kind==='node'&&r.phase==='actual').map(r=>r.factRevision),[1,1,1,2,2,2]);
    assert.equal(trace.filter(r=>r.kind==='model'&&r.action==='not-needed').length,2);
    assert.equal(new Set(trace.map(r=>r.runId)).size,1);
  }
});

test('D-B generated child and grandchild solve above the former ceiling without a model',async()=>{
  assert.ok(process.env.DH_WITNESS_PYTHON,'Explicit solver environment required');
  const jobs=fixture.DB.jobs,deadline=SOLVER_LIMIT,best=fixture.DB.enumeration.best;
  type Input={jobs:Job[];deadline:number};
  const input:Input={jobs,deadline};
  const verified=(v:Schedule)=>{const actual=scheduleMetrics(jobs,v.starts,deadline);
    return actual!==null&&actual.makespan===v.makespan&&actual.sum===v.sum&&v.makespan===best[0]&&v.sum===best[1];};
  const trace:WorkflowObservation[]=[],counts={read:0,solve:0,verify:0};
  const required=[{key:'source',accepts:['authority'] as const},{key:'constraint',accepts:['authority'] as const}];
  const knowledge={maxItems:2,equal:Object.is,current:()=>({epoch:1,context:{scope:'actual-domain',revisions:new Map([['source','1'],['constraint','1']])}})};
  const session=new StandardWorkflowSession({maxCalls:1000,maxSteps:1500,maxDepth:4},{knowledge,current:()=>true,
    limits:{maxWork:30000000,maxEvents:400,maxActiveScopes:16,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:5},observe:r=>{trace.push(r);}});
  const facts=(v:Input)=>({changed:[],dependencies:required.map(r=>({key:r.key,dependsOn:[]})),
    observations:required.map(r=>({key:r.key,origin:'authority' as const,state:'known' as const,value:v,source:{id:r.key,scope:'actual-domain',revision:'1'}}))});
  const regionLimits={maxWork:20000000,maxDescendantDepth:2,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,
    maxNodes:30,maxBindings:32,maxEdits:8,maxProjectionBytes:16384};
  const inputSlot=createWorkflowSlot('repair-input',(v):v is Input=>object(v)&&Array.isArray(v.jobs)&&
    v.jobs.every((j:unknown)=>object(j)&&typeof j.id==='string'&&Number.isSafeInteger(j.I)&&Number.isSafeInteger(j.R)&&Number.isSafeInteger(j.release))&&Number.isSafeInteger(v.deadline));
  const scheduleSlot=createWorkflowSlot('schedule',(v):v is Schedule=>object(v)&&Array.isArray(v.starts)&&Number.isSafeInteger(v.makespan)&&Number.isSafeInteger(v.sum));
  const localRead=(id:string)=>bindWorkflowFunction<Input,Input>({id,description:'actual scoped job and deadline observation',
    inputs:{value:inputSlot},outputs:{value:inputSlot},input:r=>r.read('value',inputSlot),
    node:{id,goal:'read current jobs and deadline',requiredKnowledge:required,knowledge:v=>ok(facts(v).observations),before:()=>ok(undefined),
      run:v=>{counts.read++;return ok(v);},after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',inputSlot,v)});
  // 同一个读取 capability 对象在父区域白名单与子区域中复用，不能按 id 重复创建。
  const parentRead=localRead('parent-read'),childRead=localRead('child-read');
  const solver=bindWorkflowFunction<Input,Schedule>({id:'nested-solve',description:'actual SciPy MILP',inputs:{value:inputSlot},outputs:{value:scheduleSlot},
    input:r=>r.read('value',inputSlot),node:{id:'nested-solve',goal:'actual constrained repair schedule',requiredKnowledge:[],before:()=>ok(undefined),
      run:(v,scope)=>{counts.solve++;return solveRepair(v.jobs,v.deadline,scope.signal);},
      after:(_v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&verified(a.outcome.value)?ok(undefined):reject('SCHEDULE_POST'),
      project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const verify=bindWorkflowFunction<Schedule,Schedule>({id:'nested-verify',description:'independent root schedule verification',
    inputs:{value:scheduleSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',scheduleSlot),
    node:{id:'nested-verify',goal:'verify actual resource and precedence constraints',requiredKnowledge:[],before:()=>ok(undefined),
      run:v=>{counts.verify++;return verified(v)?ok(v):reject('ROOT_VERIFY');},after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const id=(v:WorkflowRegionView,name:string)=>{
    const found=v.progress.find(n=>n.definitionId===name&&n.state!=='removed'&&n.state!=='skipped');
    if(!found)throw Error('missing occurrence');return found.instanceId;
  };
  const accepted=(v:WorkflowRegionView,name:string)=>v.progress.some(n=>n.definitionId===name&&n.state==='accepted');
  const decision=(v:WorkflowRegionView,action:WorkflowRegionProposal['action'],edits:WorkflowRegionProposal['edits']=[])=>ok({
    source:'native' as const,proposal:{runId:v.runId,regionId:v.regionId,factRevision:v.factRevision,planRevision:v.planRevision??0,action,edits}});
  const context=(slot:string):WorkflowSlotBinding=>({kind:'context',slot});
  const result=(node:string,slot='value'):WorkflowSlotBinding=>({kind:'result',node,slot});
  const base=(name:string,capabilities:readonly WorkflowCapability[],depth:number,patch:Partial<WorkflowRegionDefinition<Input,Schedule>>):WorkflowRegionDefinition<Input,Schedule>=>({
    id:name,goal:'professional constraints and actual result',constraints:['actual authoritative inputs'],limits:{...regionLimits,maxDescendantDepth:depth},capabilities,
    knowledge,current:()=>true,requiredKnowledge:required,optionalKnowledge:[],admit:()=>ok(undefined),canSkip:()=>reject('REQUIRED'),canRebind:()=>ok(undefined),
    replay:'pure-read-only',contextSlots:{value:inputSlot},layout:[],
    refresh:(v,_root,_previous,w)=>{const a=w.put('value',inputSlot,v);return a.status!=='COMPLETE'?a:ok({...facts(v),slotEvidence:{value:['source','constraint']}});},
    plan:()=>reject('NO_PLAN'),complete:()=>reject('NO_RESULT'),...patch});
  const wrap=(name:string,create:(v:Input)=>Outcome<WorkflowRegionDefinition<Input,Schedule>>)=>bindWorkflowRegion<Input,Schedule>({
    id:name,description:'actual delegated repair work',inputs:{value:inputSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',inputSlot),
    output:(v,w)=>w.put('value',scheduleSlot,v),node:{id:name,goal:'verified typed schedule',requiredKnowledge:[],before:()=>ok(undefined),
      after:(_v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&verified(a.outcome.value)?ok(undefined):reject('CHILD_POST'),
      project:()=>({effect:'none',detail:null})},create});
  // 每层规划只依据本层实际观察生成下一层；孙子区域在真实局部观察后才插入实际求解。
  const grand=wrap('conflict-region',()=>ok(base('conflict',[solver],0,{
    layout:[{kind:'gap',id:'flex',templates:[],seed:[]}],
    plan:v=>v.progress.length===0?decision(v,'continue',[{kind:'insert',gap:'flex',node:{alias:'actual-solve',capability:'nested-solve',input:{value:context('value')}}}]):
      decision(v,accepted(v,'nested-solve')?'finish':'continue'),
    complete:v=>v.reader.read(id(v,'nested-solve')+'/value',scheduleSlot)})));
  const child=wrap('repair-region',()=>ok(base('repair',[childRead,grand,solver],1,{
    layout:[{kind:'anchor',id:'observations',node:{alias:'local',capability:'child-read',input:{value:context('value')}}},{kind:'gap',id:'flex',templates:[],seed:[]}],
    plan:v=>{
      if(accepted(v,'child-read')&&!v.progress.some(n=>n.definitionId==='conflict-region')){
        const observed=v.reader.read(id(v,'child-read')+'/value',inputSlot);
        if(observed.status!=='COMPLETE')return observed;
        // 多个工件共用检验与修复工位，即存在实际资源冲突，需要孙子的冲突分析。
        if(observed.value.jobs.filter(j=>j.I>0&&j.R>0).length<2)return reject('NO_SHARED_RESOURCE_CONFLICT');
        return decision(v,'continue',[{kind:'insert',gap:'flex',node:{alias:'local-conflict',capability:'conflict-region',input:{value:result(id(v,'child-read'))}}}]);
      }
      return decision(v,accepted(v,'conflict-region')?'finish':'continue');},
    complete:v=>v.reader.read(id(v,'conflict-region')+'/value',scheduleSlot)})));
  const outer=base('outer',[parentRead,child,childRead,grand,solver,verify],2,{
    layout:[{kind:'anchor',id:'observations',node:{alias:'observed',capability:'parent-read',input:{value:context('value')}}},{kind:'gap',id:'flex',templates:[],seed:[]}],
    plan:v=>{
      if(accepted(v,'parent-read')&&!v.progress.some(n=>n.definitionId==='repair-region')){
        const observed=v.reader.read(id(v,'parent-read')+'/value',inputSlot);
        if(observed.status!=='COMPLETE')return observed;
        if(observed.value.jobs.some(j=>j.release+j.I+j.R>observed.value.deadline))return reject('INDIVIDUAL_DEADLINE');
        return decision(v,'continue',[{kind:'insert',gap:'flex',node:{alias:'repair',capability:'repair-region',input:{value:result(id(v,'parent-read'))}}},
          {kind:'insert',gap:'flex',node:{alias:'check',capability:'nested-verify',input:{value:result('repair')}}}]);
      }
      return decision(v,accepted(v,'nested-verify')?'finish':'continue');},
    complete:v=>v.reader.read(id(v,'nested-verify')+'/value',scheduleSlot)});
  const r=await session.run(root=>runWorkflowRegion(root,outer,input),{goal:'unchanged typed public repair schedule',requiredKnowledge:[],terminalReads:0,
    validate:v=>verified(v)?ok(undefined):reject('FINAL')});
  assert.equal(r.status,'COMPLETE',JSON.stringify(r));
  if(r.status==='COMPLETE')assert.deepEqual([r.value.makespan,r.value.sum],[7,16]);
  assert.deepEqual(counts,{read:2,solve:1,verify:1});
  assert.deepEqual(session.dispositions().filter(x=>x.kind==='node').map(x=>x.occurrence.definitionId),
    ['parent-read','child-read','nested-solve','conflict-region','repair-region','nested-verify']);
  assert.equal(trace.filter(x=>x.kind==='model').length,0);
  assert.equal(trace.filter(x=>x.kind==='region'&&x.action==='edit').length,3);
  assert.equal(new Set(trace.map(x=>x.runId)).size,1);
});
