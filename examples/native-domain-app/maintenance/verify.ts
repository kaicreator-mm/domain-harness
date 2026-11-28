import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CliElement } from '@kaicreator/domain-harness';
import type { WorkflowObservation } from '@kaicreator/domain-harness';
import { SolverElement, validateSchedule } from '../../qualification/workshop/plan.js';
import type { Task, Policy } from '../../qualification/workshop/plan.js';
import { offers } from '../../qualification/procurement-witness/offers.js';
import { demoModel } from '../combined/catalog-demo-environment.js';
import { planMaintenance } from './plan.js';

const protocol = process.argv[2]??'native';
const scenario = process.argv[3]??'baseline';
if(!['baseline','revision','unknown','invalid','no-current'].includes(scenario))throw Error('INVALID_SCENARIO');
if(protocol!=='native'&&protocol!=='openai-chat'&&protocol!=='anthropic-messages')throw Error('INVALID_PROTOCOL');
const python=process.env.DH_PYTHON;
if(!python)throw Error('DH_PYTHON_REQUIRED');
const script=fileURLToPath(new URL('../../qualification/workshop/solver.py',import.meta.url));
const tasks:readonly Task[]=Object.freeze([
  {id:'a-inspect',machine:'inspection',duration:2,after:[]},
  {id:'a-repair',machine:'repair',duration:3,after:['a-inspect']},
  {id:'a-qc',machine:'qc',duration:1,after:['a-repair']},
  {id:'b-inspect',machine:'inspection',duration:1,after:[]},
  {id:'b-repair',machine:'repair',duration:2,after:['b-inspect']},
  {id:'b-qc',machine:'qc',duration:2,after:['b-repair']},
].map(t=>Object.freeze({...t,order:t.id.split('-')[0]!,stage:t.machine,after:Object.freeze(t.after)})));
/** Independent finite enumeration, not MILP and not an SDK workflow. */
function minimum(ts:readonly Task[],p:Policy):number|null{
  const pending=[...ts],sorted:Task[]=[];
  while(pending.length){const i=pending.findIndex(t=>t.after.every(a=>sorted.some(q=>q.id===a)));if(i<0)throw Error('ORACLE_CYCLE');sorted.push(pending.splice(i,1)[0]!);}
  const taken=new Set<string>(),starts=new Map<string,number>();let best=Infinity;
  function visit(i:number,end:number){
    if(end>=best)return;
    const t=sorted[i];if(!t){best=end;return;}
    const earliest=Math.max(0,...t.after.map(a=>starts.get(a)!+sorted.find(q=>q.id===a)!.duration));
    for(let s=earliest;s+t.duration<=p.horizon;s++){
      const cells=Array.from({length:t.duration},(_,k)=>s+k);if(cells.some(k=>taken.has(t.machine+':'+k)||(p.closed[t.machine]??[]).includes(k)))continue;
      cells.forEach(k=>taken.add(t.machine+':'+k));starts.set(t.id,s);visit(i+1,Math.max(end,s+t.duration));
      cells.forEach(k=>taken.delete(t.machine+':'+k));starts.delete(t.id);
    }
  }
  visit(0,0);return Number.isFinite(best)?best:null;
}
const solver=new SolverElement(new CliElement(12000),python,[script]);
const model=demoModel(protocol);
const trace:WorkflowObservation[]=[];
let final:readonly WorkflowObservation[]=[];
const request={demand:scenario==='invalid'?31:scenario==='revision'?9:6,service:'urgent' as const};
const selected=scenario==='revision'?{revision:'offers-r3',offers:offers.offers.map(o=>o.id==='C'?{...o,price:650}:o)}
  :scenario==='unknown'?{revision:'offers-missing',offers:offers.offers.map(o=>o.id==='C'?{...o,price:null}:o)}:offers;
const snapshot=JSON.stringify(selected);
const result=await planMaintenance(request,{offers:selected,tasks,solver,current:()=>scenario!=='no-current',...(model?{model}:{}),observe:r=>{trace.push(r);},dispositions:r=>{final=r;}});
if(['unknown','invalid','no-current'].includes(scenario)){
  assert.notEqual(result.status,'COMPLETE');
  assert.equal(solver.calls,0);
  assert.equal(JSON.stringify(selected),snapshot);
  console.log(JSON.stringify({status:'PASS_NESTED_MAINTENANCE_NEGATIVE',scenario,outcome:result.status,solverCalls:0}));
} else {
if(result.status!=='COMPLETE'){
  console.error(JSON.stringify({status:result.status,code:result.reason.code,solverCalls:solver.calls,trace:trace.map(e=>({kind:e.kind,action:'action'in e?e.action:null,reason:'reason'in e?e.reason:null}))}));
  throw Error('MAINTENANCE_NOT_COMPLETE');
}
const {purchase,schedule}=result.value;
assert.deepEqual(purchase,scenario==='revision'?{id:'B',packs:2,units:10,cost:1600,days:2}:{id:'C',packs:2,units:6,cost:950,days:1});
const policy={revision:schedule.revision,horizon:12,closed:{repair:Array.from({length:purchase.days},(_,i)=>i)}};
assert.ok(validateSchedule(tasks,policy,schedule.starts,schedule.makespan));
assert.equal(schedule.makespan,minimum(tasks,policy));
assert.equal(solver.calls,1);
assert.equal(JSON.stringify(selected),snapshot);
assert.equal(new Set(trace.map(e=>e.runId)).size,1);
assert.equal(trace.filter(e=>e.kind==='model'&&e.action==='result').length,model?1:0);
const nodes=final.flatMap(e=>e.kind==='node'&&e.phase==='disposition'&&e.acceptance==='accepted'?[e.occurrence.definitionId]:[]);
for(const n of ['parts-quote','repair-solve','repair-region','maintenance-region'])assert.ok(nodes.includes(n));
console.log(JSON.stringify({status:'PASS_NESTED_MAINTENANCE',protocol,scenario,oneRoot:true,purchase,schedule,oracle:minimum(tasks,policy),solverCalls:solver.calls,nodes,modelAttempts:model?1:0}));
}
