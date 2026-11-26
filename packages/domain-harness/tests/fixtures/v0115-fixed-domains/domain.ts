import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { StandardWorkflowOutcome } from '@kaicreator/domain-harness';

export type Outcome<T> = StandardWorkflowOutcome<T>;
export const ok = <T>(value: T): Outcome<T> => ({ status: 'COMPLETE', value });
export const reject = <T>(code: string): Outcome<T> => ({ status: 'REJECT', reason: { code, message: code } });
export const fail = <T>(code: string): Outcome<T> => ({ status: 'FAILED', reason: { code, message: code } });
export type Offer = { id: string; compatible: boolean; pack: number; cost: number; lead: number; max: number; moq: number };
export type Job = { id: string; release: number; I: number; R: number };
export type Plan = { counts: number[]; cost: number; lead: number };
export type Demand = { lead: number; budget: number };
export type Schedule = { starts: number[]; makespan: number; sum: number };
type Fixture = {
  DA: { quantity: number; offers: Offer[]; enumeration: { cases: (Demand & { optimum: Plan | null })[] } };
  DB: { jobs: Job[]; horizon: number; enumeration: { best: number[] } };
};
const bytes = readFileSync(new URL('./domains.json', import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'), '1d79d98fe8f6f90a95413c2eb0e2edab63be557ea459c13d375dec8f985aaacf');
export const fixture = JSON.parse(bytes.toString('utf8')) as Fixture;

export function planMetrics(offers: readonly Offer[], counts: readonly number[], demand: Demand): Plan | null {
  if (counts.length !== offers.length) return null;
  let units=0, cost=0, lead=0;
  for (const [i,o] of offers.entries()) {
    const n=counts[i];
    if (n===undefined || !Number.isSafeInteger(n) || n<0 || n>o.max || (n>0 && (!o.compatible || n<o.moq))) return null;
    units+=n*o.pack; cost+=n*o.cost; if(n>0) lead=Math.max(lead,o.lead);
  }
  return units===fixture.DA.quantity && cost<=demand.budget && lead<=demand.lead ? {counts:[...counts],cost,lead} : null;
}

export function optimize(offers: readonly Offer[], demand: Demand): Plan | null {
  let best:Plan|null=null;
  function visit(counts:number[]):void {
    const o=offers[counts.length];
    if(o) { for(let i=0;i<=o.max;i++) visit([...counts,i]); return; }
    const plan=planMetrics(offers,counts,demand);
    if(plan && (!best || plan.cost<best.cost || (plan.cost===best.cost && plan.lead<best.lead))) best=plan;
  }
  visit([]);return best;
}

export function scheduleMetrics(jobs:readonly Job[],starts:readonly number[],deadline:number):Schedule|null {
  if(starts.length!==jobs.length*2 || starts.some(x=>!Number.isInteger(x)||x<0)) return null;
  const n=jobs.length, inspect=starts.slice(0,n), repair=starts.slice(n), ends:number[]=[];
  for(const [i,j] of jobs.entries()){
    const a=inspect[i]!,b=repair[i]!;
    if(a<j.release || b<a+j.I || b+j.R>deadline) return null;
    ends.push(b+j.R);
    for(let k=0;k<i;k++){
      const other=jobs[k]!,a2=inspect[k]!,b2=repair[k]!;
      if(!(a+j.I<=a2 || a2+other.I<=a) || !(b+j.R<=b2 || b2+other.R<=b))return null;
    }
  }
  return {starts:[...starts],makespan:Math.max(...ends),sum:ends.reduce((a,b)=>a+b,0)};
}

const solver=fileURLToPath(new URL('./repair-solver.py',import.meta.url));
type SolverReply={status:string;solver:string;starts?:number[]};
export async function solveRepair(jobs:Job[],deadline:number,signal:AbortSignal):Promise<Outcome<Schedule>>{
  const python=process.env.DH_WITNESS_PYTHON;
  if(!python || signal.aborted) return fail('SOLVER_UNAVAILABLE');
  return new Promise(resolve=>{
    // 子进程属于实际节点；abort 后仍等待 close，而不是仅等待取消通知。
    const proc=spawn(python,[solver,JSON.stringify({jobs,deadline,horizon:fixture.DB.horizon})],
      {stdio:['ignore','pipe','pipe'],signal,timeout:20000});
    let body='',bad=false;
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data',(chunk:string)=>{if(body.length+chunk.length>65536)bad=true;else if(!bad)body+=chunk;});
    proc.stderr.resume();
    proc.on('error',()=>{bad=true;});
    proc.on('close',code=>{
      if(bad || code!==0 || signal.aborted){resolve(fail('SOLVER_FAILED'));return;}
      try{
        const r=JSON.parse(body) as SolverReply;
        assert.equal(r.solver,'1.17.0');
        if(r.status==='infeasible'){resolve(reject('INFEASIBLE'));return;}
        const valid=r.status==='optimal'&&Array.isArray(r.starts)?scheduleMetrics(jobs,r.starts,deadline):null;
        resolve(valid?ok(valid):fail('INVALID_SOLVER_RESULT'));
      }catch{resolve(fail('SOLVER_RESPONSE'));}
    });
  });
}
