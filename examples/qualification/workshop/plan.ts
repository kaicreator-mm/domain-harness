import { GraphQueryElement, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { StandardWorkflowOutcome, WorkflowLimits, NativeWorkflowContext } from '@kaicreator/domain-harness';
import { CliElement } from '@kaicreator/domain-harness';
export type Task=Readonly<{id:string;order:string;stage:string;machine:string;duration:number;after:readonly string[]}>;
export type Policy=Readonly<{revision:string;horizon:number;closed:Readonly<Record<string,readonly number[]>>}>;
export type Plan={starts:Record<string,number>;makespan:number;solver:string;revision:string;impact:readonly string[]};
type Outcome<T>=StandardWorkflowOutcome<T>;
const ok=<T>(value:T):Outcome<T>=>({status:'COMPLETE',value});
const stop=(status:'ASK'|'REJECT'|'UNKNOWN'|'FAILED',code:string):Outcome<never>=>({status,reason:{code,message:code}});
export const baseline:Policy=Object.freeze({revision:'shop-v1',horizon:12,closed:Object.freeze({})});
export const downtime:Policy=Object.freeze({revision:'shop-v2',horizon:12,closed:Object.freeze({repair:Object.freeze([3,4,5])})});
const machines=Object.freeze(['inspection','repair','qc']);
export function validateTasks(tasks:readonly Task[],p:Policy):Outcome<readonly Task[]>{
  if(!tasks.length||tasks.some(t=>!t.id||!t.order||!t.stage||!t.machine||t.duration===undefined||!Array.isArray(t.after)))return stop('ASK','MISSING_TASK_FACT');
  if(tasks.length>6||!Number.isSafeInteger(p.horizon)||p.horizon<8||p.horizon>12||new Set(tasks.map(t=>t.id)).size!==tasks.length)return stop('REJECT','MODEL_LIMIT_OR_DUPLICATE');
  if(tasks.some(t=>!machines.includes(t.machine)||!machines.includes(t.stage)))return stop('UNKNOWN','UNKNOWN_STAGE');
  if(!p.revision||!p.closed||typeof p.closed!=='object'||Array.isArray(p.closed)||Object.entries(p.closed).some(([m,slots])=>!machines.includes(m)||!Array.isArray(slots)||slots.some(k=>!Number.isSafeInteger(k)||k<0||k>=p.horizon)||new Set(slots).size!==slots.length))return stop('REJECT','POLICY_INVALID');
  if(tasks.some(t=>t.stage!==t.machine||!Number.isSafeInteger(t.duration)||t.duration<=0||new Set(t.after).size!==t.after.length))return stop('REJECT','TASK_INVALID');
  const pending=new Map(tasks.map(t=>[t.id,t]));const sorted:Task[]=[];
  if(tasks.some(t=>t.after.some(a=>!pending.has(a))))return stop('UNKNOWN','MISSING_PREDECESSOR');
  const orders=[...new Set(tasks.map(t=>t.order))];
  if(orders.length!==2||tasks.length!==6)return stop('ASK','MISSING_ORDER_STAGES');
  for(const order of orders){const members=tasks.filter(t=>t.order===order);const [inspect,repair,qc]=machines.map(stage=>members.find(t=>t.stage===stage));
    if(members.length!==3||!inspect||!repair||!qc)return stop('REJECT','ORDER_STAGES_INVALID');
    if(!repair.after.includes(inspect.id)||!qc.after.includes(repair.id))return stop('REJECT','REQUIRED_PRECEDENCE_MISSING');}
  while(pending.size){const next=[...pending.values()].find(t=>t.after.every(a=>sorted.some(q=>q.id===a)));if(!next)return stop('REJECT','PRECEDENCE_CYCLE');pending.delete(next.id);sorted.push(next);}
  return ok(sorted);
}
/** Independent native verification of every returned operation and constraint, not trust of exit code. */
export function validateSchedule(tasks:readonly Task[],p:Policy,starts:Record<string,number>,makespan:number):boolean{
  if(Object.keys(starts).length!==tasks.length||!Number.isSafeInteger(makespan))return false;
  for(const t of tasks){const s=starts[t.id];if(s===undefined||!Number.isSafeInteger(s)||s<0||s+t.duration>p.horizon||t.after.some(a=>starts[a]!+tasks.find(q=>q.id===a)!.duration>s))return false;
    if((p.closed[t.machine]??[]).some(k=>s<=k&&k<s+t.duration))return false;
    for(const q of tasks)if(q.id!==t.id&&q.machine===t.machine&&s<starts[q.id]!+q.duration&&starts[q.id]!<s+t.duration)return false;}
  return Math.max(...tasks.map(t=>starts[t.id]!+t.duration))===makespan;
}
export class SolverElement{
  calls=0;
  constructor(private readonly cli:CliElement,private readonly executable:string,private readonly args:readonly string[]){}
  async solve(tasks:readonly Task[],p:Policy):Promise<Outcome<Omit<Plan,'revision'|'impact'>>>{
    this.calls++;
    try{
      const raw=JSON.parse(await this.cli.run(this.executable,[...this.args,JSON.stringify({tasks,horizon:p.horizon,closed:p.closed})]));
      if(raw.status==='INFEASIBLE')return stop('REJECT','NO_FEASIBLE_PLAN');
      if(raw.status!=='OPTIMAL')return stop('UNKNOWN','SOLVER_NOT_OPTIMAL');
      if(typeof raw.starts!=='object'||raw.starts===null||typeof raw.solver!=='string'||!Number.isSafeInteger(raw.makespan))return stop('UNKNOWN','SOLVER_RESPONSE_INVALID');
      return ok({starts:raw.starts,makespan:raw.makespan,solver:raw.solver});
    }catch(error){const code=error instanceof SyntaxError?'SOLVER_JSON_INVALID':error instanceof Error&&/^CLI_[A-Z0-9_-]+$/.test(error.message)?error.message:'SOLVER_UNAVAILABLE';return stop('UNKNOWN',code);}
  }
}
export class WorkshopElement{
  private readonly graph=new GraphQueryElement();
  constructor(private readonly solver:SolverElement,private readonly p:Policy){}
  run(tasks:readonly Task[],limits:WorkflowLimits):Promise<Outcome<Plan>>{
    // The fixed business plan requires its complete budget before starting the solver.
    if(![limits.maxCalls,limits.maxSteps,limits.maxDepth].every(Number.isSafeInteger)||limits.maxCalls<4||limits.maxSteps<8||limits.maxDepth<2)return Promise.resolve(stop('FAILED','WORKSHOP_TOTAL_BUDGET'));
    return new StandardWorkflowSession(limits).run(root=>this.runIn(root,tasks));
  }
  async runIn(root:NativeWorkflowContext,tasks:readonly Task[],signal?:AbortSignal):Promise<Outcome<Plan>>{
    if(signal?.aborted)return stop('REJECT','CANCELLED');
    const remaining=root.remaining();
    if(remaining.calls<4||remaining.steps<7||remaining.maxDescendantDepth<2)return stop('FAILED','WORKSHOP_TOTAL_BUDGET');
      const facts=await root.child(1,async child=>{
        const validated=await child.invokeOutcome(()=>validateTasks(tasks,this.p));if(validated.status!=='COMPLETE')return validated;
         if(signal?.aborted)return stop('REJECT','CANCELLED');
        const impact=await child.child(0,grand=>grand.invokeOutcome(()=>{
          const edges=validated.value.flatMap(t=>t.after.map(a=>({from:a,to:t.id,type:'requires'})));
          const result=this.graph.search(edges,{start:validated.value.filter(t=>t.stage==='inspection').map(t=>t.id).sort()[0]!,direction:'OUT',relationTypes:['requires'],limits:{maxDepth:6,maxVisited:100,maxReturned:6}});
          if(!result.complete)return stop('UNKNOWN','DEPENDENCY_GRAPH_INCOMPLETE');
          return ok(result.paths.map(p=>p.nodes.at(-1)!));
        }));if(impact.status!=='COMPLETE')return impact;
        return ok({tasks:validated.value,impact:impact.value});
      });if(facts.status!=='COMPLETE')return facts;
      if(signal?.aborted)return stop('REJECT','CANCELLED');
       const solution=await root.child(0,child=>child.invokeOutcome(()=>signal?.aborted?stop('REJECT','CANCELLED'):this.solver.solve(facts.value.tasks,this.p)));if(solution.status!=='COMPLETE')return solution;
      return root.invokeOutcome(()=>validateSchedule(facts.value.tasks,this.p,solution.value.starts,solution.value.makespan)?ok({...solution.value,revision:this.p.revision,impact:facts.value.impact}):stop('UNKNOWN','INVALID_SOLVER_SCHEDULE'));
  }
}
