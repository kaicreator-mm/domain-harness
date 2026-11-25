import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CliElement } from '@kaicreator/domain-harness';
import { baseline, downtime, WorkshopElement, SolverElement, validateSchedule, type Task, type Policy } from './plan.js';
import { verifyInteraction } from "./verify-interaction.js";
const tasks:readonly Task[]=Object.freeze([
  {id:'a-inspect',machine:'inspection',duration:2,after:[]},
  {id:'a-repair',machine:'repair',duration:3,after:['a-inspect']},
  {id:'a-qc',machine:'qc',duration:1,after:['a-repair']},
  {id:'b-inspect',machine:'inspection',duration:1,after:[]},
  {id:'b-repair',machine:'repair',duration:2,after:['b-inspect']},
  {id:'b-qc',machine:'qc',duration:2,after:['b-repair']},
].map(t=>Object.freeze({...t,order:t.id.split('-')[0]!,stage:t.machine,after:Object.freeze(t.after)})));
/** Exhaustive native TS reference: enumerate each feasible time assignment; no MILP or SDK calls. */
function oracle(ts:readonly Task[],p:Policy):number|null{
  const pending=[...ts];const sorted:Task[]=[];while(pending.length){const i=pending.findIndex(t=>t.after.every(a=>sorted.some(q=>q.id===a)));if(i<0)throw Error('ORACLE_CYCLE');sorted.push(pending.splice(i,1)[0]!);}ts=sorted;
  let best=Infinity;const occupied=new Set<string>(),starts:Record<string,number>={};
  function visit(i:number,max:number){if(max>=best)return;if(i===ts.length){best=max;return;}const t=ts[i]!;
    const earliest=Math.max(0,...t.after.map(a=>starts[a]!+ts.find(q=>q.id===a)!.duration));
    for(let s=earliest;s+t.duration<=p.horizon;s++){
      const slots=Array.from({length:t.duration},(_,k)=>s+k);if(slots.some(k=>occupied.has(t.machine+':'+k)||(p.closed[t.machine]??[]).includes(k)))continue;
      slots.forEach(k=>occupied.add(t.machine+':'+k));starts[t.id]=s;visit(i+1,Math.max(max,s+t.duration));slots.forEach(k=>occupied.delete(t.machine+':'+k));delete starts[t.id];
    }
  }
  visit(0,0);return Number.isFinite(best)?best:null;
}
const cli=new CliElement(12000);const script=fileURLToPath(new URL('../../solver.py',import.meta.url));const solver=new SolverElement(cli,process.env.DH_PYTHON??'python3',[script]);const limits={maxCalls:4,maxSteps:8,maxDepth:2};const immutable=JSON.stringify(tasks);
const first=await new WorkshopElement(solver,baseline).run(tasks,limits);assert.equal(first.status,'COMPLETE');if(first.status!=='COMPLETE')throw Error('BASELINE');assert.equal(first.value.makespan,oracle(tasks,baseline));assert.ok(first.value.impact.includes('a-qc'));assert.ok(validateSchedule(tasks,baseline,first.value.starts,first.value.makespan));
const second=await new WorkshopElement(solver,downtime).run(tasks,limits);assert.equal(second.status,'COMPLETE');if(second.status!=='COMPLETE')throw Error('DOWNTIME');assert.equal(second.value.makespan,oracle(tasks,downtime));assert.ok(second.value.makespan>first.value.makespan);assert.equal(JSON.stringify(tasks),immutable);
const impossible={...baseline,horizon:8,closed:{repair:[0,1,2,3,4,5,6,7]}};assert.equal(oracle(tasks,impossible),null);assert.equal((await new WorkshopElement(solver,impossible).run(tasks,limits)).status,'REJECT');
const before=solver.calls;const app=new WorkshopElement(solver,baseline);assert.equal((await app.run(tasks,{...limits,maxCalls:2})).status,'FAILED');assert.equal((await app.run(tasks,{...limits,maxDepth:1})).status,'FAILED');assert.equal((await app.run([],limits)).status,'ASK');assert.equal((await app.run([...tasks,tasks[0]!],limits)).status,'REJECT');assert.equal((await app.run(tasks.map((t,i)=>i===0?{...t,after:['a-qc']}:t),limits)).status,'REJECT');assert.equal((await app.run(tasks.map((t,i)=>i===0?{...t,after:['absent']}:t),limits)).status,'UNKNOWN');assert.equal(solver.calls,before);
for(const l of [{...limits,maxCalls:3},{...limits,maxSteps:7}])assert.deepEqual(await app.run(tasks,l),{status:'FAILED',reason:{code:'WORKSHOP_TOTAL_BUDGET',message:'WORKSHOP_TOTAL_BUDGET'}});
assert.equal((await app.run(tasks.map(t=>t.id==='a-repair'?{...t,after:[]}:t),limits)).status,'REJECT');
assert.equal((await app.run(tasks.map(t=>t.id==='a-repair'?{...t,stage:'unknown'}:t),limits)).status,'UNKNOWN');
assert.equal((await new WorkshopElement(solver,{...baseline,closed:{other:[0]}}).run(tasks,limits)).status,'REJECT');
assert.equal(solver.calls,before);
const reversed=[...tasks].reverse();const reorder=await app.run(reversed,limits);assert.equal(reorder.status,'COMPLETE');if(reorder.status==='COMPLETE')assert.equal(reorder.value.makespan,oracle(reversed,baseline));
for(const starts of [{...first.value.starts,'a-repair':0},{...first.value.starts,'a-qc':12},{...first.value.starts,'a-inspect':0}])assert.equal(validateSchedule(tasks,baseline,starts,first.value.makespan),false);
const malformed=new SolverElement(cli,process.execPath,['-e','console.log(JSON.stringify({status:"OPTIMAL",starts:{},makespan:0,solver:"test-fixture"}))']);assert.equal((await new WorkshopElement(malformed,baseline).run(tasks,limits)).status,'UNKNOWN');
const nonoptimal=new SolverElement(cli,process.execPath,['-e','console.log(JSON.stringify({status:"UNKNOWN"}))']);assert.deepEqual(await new WorkshopElement(nonoptimal,baseline).run(tasks,limits),{status:'UNKNOWN',reason:{code:'SOLVER_NOT_OPTIMAL',message:'SOLVER_NOT_OPTIMAL'}});
const timeout=new SolverElement(new CliElement(100),process.execPath,['-e','setInterval(()=>{},1000)']);assert.deepEqual(await new WorkshopElement(timeout,baseline).run(tasks,limits),{status:'UNKNOWN',reason:{code:'CLI_TIMEOUT',message:'CLI_TIMEOUT'}});
const missing=new SolverElement(cli,'dh-missing-python-1720',[]);assert.equal((await new WorkshopElement(missing,baseline).run(tasks,limits)).status,'UNKNOWN');
console.log(JSON.stringify({status:'WORKSHOP_PROBE_PASS',baseline:first.value,revision:second.value,referenceMakespans:[oracle(tasks,baseline),oracle(tasks,downtime)],solverCalls:solver.calls,negative:['infeasible','call-budget','depth-budget','missing','duplicate','cycle','missing-predecessor','malformed-solver','missing-cli','total-call-budget','total-step-budget','required-edge','unknown-stage','invalid-policy','invalid-solver-starts','nonoptimal','solver-timeout'],orderIndependent:true,immutable:true}));

await verifyInteraction(tasks,solver,oracle);
