import assert from 'node:assert/strict';
import test from 'node:test';
import { StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { NativeWorkflowContext, StandardWorkflowOutcome, WorkflowControlOptions, WorkflowNode, WorkflowNodeOptions,
  WorkflowCompletionPolicy, WorkflowObservation, WorkflowTerminalContext } from '@kaicreator/domain-harness';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const failed = (code: string): StandardWorkflowOutcome<never> => ({ status: 'FAILED', reason: { code, message: 'failure' } });
const rootLimits = { maxCalls: 30, maxSteps: 50, maxDepth: 3 };
const policy = { maxItems: 0, current: () => ({ epoch: 0, context: { scope: 'root', revisions: new Map<string,string>() } }), equal: Object.is };
const control = (patch: Partial<WorkflowControlOptions> = {}): WorkflowControlOptions => ({
  limits: { maxWork: 2000000, maxEvents: 100, maxActiveScopes: 10, maxNoProgress: 5,
    maxActiveMs: 10000, maxSettlementMs: 1000 }, knowledge: policy, current: () => true, ...patch,
});
const opts: WorkflowNodeOptions = { knowledge: policy, current: () => true };
const completion = <T>(): WorkflowCompletionPolicy<T> => ({ goal: 'actual goal', requiredKnowledge: [], terminalReads: 0,
  validate: () => ok(undefined) });
const definition = (patch: Partial<WorkflowNode<bigint, bigint>> = {}): WorkflowNode<bigint, bigint> => ({
  id: 'calculate', goal: 'double', requiredKnowledge: [], before: () => ok(undefined),
  run: n => ok(n * 2n), after: () => ok(undefined), project: () => ({ effect: 'none', detail: null }), ...patch,
});
const nodeRecords = (s: StandardWorkflowSession) => s.dispositions().filter(r => r.kind === 'node');

test('fixed native bigint input/output, actual progress and definitive occurrence', async () => {
  const trace: WorkflowObservation[] = [];
  const session = new StandardWorkflowSession(rootLimits, control({ observe: r => { trace.push(r); } }));
  const seen: string[] = [];
  const node = definition({
    context: () => ({ constraints: ['exact integer'], capabilities: ['calculate'], feedbackRevision: 2 }),
    before: (n, scope, view) => { assert.equal(n, 3n); assert.equal(scope.runId, view.runId);
      assert.deepEqual(view.constraints, ['exact integer']); seen.push('before'); return ok(undefined); },
    run: (n, _scope, view) => { assert.equal(view.feedbackRevision, 2); assert.equal(view.progress.at(-1)?.state,'running'); seen.push('run'); return ok(n*2n); },
    after: (_n, actual) => { assert.equal(actual.kind, 'returned'); seen.push('after'); return ok(undefined); },
    cleanup: () => { seen.push('cleanup'); },
    project: () => { seen.push('project'); return { effect: 'none', detail: { verified: true } }; },
  });
  const result = await session.run(root => root.node(node, 3n, opts), {
    ...completion<bigint>(), validate: (value, view) => {
      assert.equal(value, 6n); assert.equal(view.progress.length, 1); assert.equal(view.progress[0]?.state, 'accepted');
      return ok(undefined);
    },
  });
  assert.deepEqual(result, ok(6n));
  assert.deepEqual(seen, ['before','run','after','cleanup','project']);
  const events = trace.filter(r => r.kind === 'node');
  assert.deepEqual(events.map(r => r.phase), ['enter','actual','candidate']);
  const final = nodeRecords(session)[0];
  assert.ok(final?.phase === 'disposition' && final.acceptance === 'accepted');
  assert.equal(final.candidateSeq, events.at(-1)?.seq);
  assert.equal(final.occurrence.instanceId, events[0]?.occurrence.instanceId);
});

test('exact/one-short complete fixed node bundle before callbacks', async () => {
  // root 99086, node N=4, F=1+1, K=1 => 4+4+4*33024+16*2+1 =132137.
  const rootWork = 99086, nodeWork = 132137;
  for (const mode of ['exact','work','calls','steps','events','active'] as const) {
    let before = 0, run = 0, after = 0, project = 0, guard = 0;
    const c = control();
    const s = new StandardWorkflowSession({ maxCalls: mode === 'calls' ? 4 : 5,
      maxSteps: mode === 'steps' ? 5 : 6, maxDepth: 0 }, { ...c,
      limits: { ...c.limits, maxWork: rootWork + nodeWork - Number(mode === 'work'),
        maxEvents: mode === 'events' ? 6 : 7, maxActiveScopes: mode === 'active' ? 1 : 2 } });
    const n = definition({ before: () => { before++; return ok(undefined); }, run: x => { run++; return ok(x); },
      after: () => { after++; return ok(undefined); }, project: () => { project++; return { effect: 'none', detail: null }; } });
    const result = await s.run(root => root.node(n, 5n, { ...opts, current: () => { guard++; return true; } }), completion<bigint>());
    assert.equal(result.status === 'COMPLETE', mode === 'exact', mode);
    assert.deepEqual([before,run,after,project], mode === 'exact' ? [1,1,1,1] : [0,0,0,0], mode);
    if (mode !== 'exact') assert.equal(guard, 0, mode);
  }
});

test('pre rejection does not run or fake actual effect; applicable cleanup occurs', async () => {
  let calls = 0, cleaned = 0;
  const s = new StandardWorkflowSession(rootLimits, control());
  const n = definition({ before: () => ({ status: 'REJECT', reason: { code:'PRE',message:'no' } }),
    run: () => { calls++; return ok(1n); }, after: () => { calls++; return ok(undefined); },
    cleanup: () => { cleaned++; }, project: () => { calls++; return { effect:'none',detail:null }; } });
  assert.equal((await s.run(root => root.node(n, 1n, opts), completion<bigint>())).status, 'REJECT');
  assert.equal(calls,0); assert.equal(cleaned,1);
  const final=nodeRecords(s)[0]; assert.ok(final && !final.entered && final.effect==='not-applicable' && final.acceptance==='rejected');
});

test('required local evidence and ancestor guard; changed local revision blocks nested call and retains effect receipt', async () => {
  let epoch = 1, invokes = 0, postReads = 0, cleaned = 0;
  const local: WorkflowNodeOptions = { knowledge: { maxItems: 1, equal: Object.is,
    current: () => ({ epoch, context: { scope:'quote',revisions:new Map([['source',String(epoch)]]) } }) }, current: () => true };
  const trace: WorkflowObservation[] = [];
  const s = new StandardWorkflowSession(rootLimits,control({ observe:r=>{trace.push(r);} }));
  const n = definition({
    requiredKnowledge:[{ key:'price', accepts:['authority'] }],
    knowledge:()=>ok([{ key:'price',origin:'authority',source:{ id:'source',scope:'quote',revision:'1' },state:'known',value:60 }]),
    before:(_n,_scope,view)=>{assert.ok(view.knowledge?.complete && view.knowledge.items[0]?.status==='resolved');return ok(undefined);},
    run:async (n,scope)=>{epoch++; assert.notEqual((await scope.invoke(()=>++invokes)).status,'COMPLETE');return ok(n);},
    terminalReads:1, after:async (_n,_actual,terminal)=>{const r=await terminal.read(()=>{postReads++;return ok(7);});assert.deepEqual(r,ok(7));return ok(undefined);},
    cleanup:()=>{cleaned++;},project:()=>({ effect:'committed',receiptId:'receipt-1',detail:{ actual:true } }),
  });
  assert.notEqual((await s.run(root=>root.node(n,3n,local),completion<bigint>())).status,'COMPLETE');
  assert.deepEqual([invokes,postReads,cleaned],[0,1,1]);
  const actual=trace.find(r=>r.kind==='node'&&r.phase==='actual');
  assert.ok(actual?.kind==='node'&&actual.effect==='committed'&&actual.receiptId==='receipt-1');
  assert.ok(nodeRecords(s)[0]?.acceptance!=='accepted');
});

test('actual exception still executes post and cleanup; no stale accepted result', async()=>{
  const order:string[]=[];
  const s=new StandardWorkflowSession(rootLimits,control());
  const n=definition({run:()=>{order.push('run');throw Error('private');},
    after:(_n,actual)=>{assert.equal(actual.kind,'exception');order.push('after');return ok(undefined);},
    cleanup:()=>{order.push('cleanup');},project:()=>({effect:'unknown',detail:null})});
  assert.notEqual((await s.run(root=>root.node(n,1n,opts),completion<bigint>())).status,'COMPLETE');
  assert.deepEqual(order,['run','after','cleanup']);
  assert.equal(nodeRecords(s)[0]?.effect,'unknown');
});

test('post reject and required evidence failure retain actual committed receipt', async()=>{
  for(const mode of ['post','sink'] as const){
    const s=new StandardWorkflowSession(rootLimits,control({evidence:{required:true,emit:r=>mode==='sink'&&r.kind==='node'&&r.phase==='candidate'?failed('SINK'):ok(undefined)}}));
    const n=definition({after:()=>mode==='post'?failed('POST'):ok(undefined),project:()=>({effect:'committed',receiptId:'actual-2',detail:null})});
    assert.notEqual((await s.run(root=>root.node(n,1n,opts),completion<bigint>())).status,'COMPLETE');
    const final=nodeRecords(s)[0];assert.ok(final&&final.effect==='committed'&&final.receiptId==='actual-2'&&final.acceptance!=='accepted');
  }
});

test('terminal and attempt retained references fenced; actual abort joins and executes cleanup',async()=>{
  const abort=new AbortController();let scope!:NativeWorkflowContext, terminal!:WorkflowTerminalContext;
  let run=0, after=0, cleanup=0;
  const s=new StandardWorkflowSession(rootLimits,control({signal:abort.signal}));
  const n=definition({run:(_n,ctx)=>{scope=ctx;run++;abort.abort();return ok(7n);},
    after:async(_n,_actual,t)=>{terminal=t;after++;assert.notEqual((await scope.invoke(()=>++run)).status,'COMPLETE');return ok(undefined);},
    cleanup:()=>{cleanup++;},project:()=>({effect:'committed',receiptId:'actual-3',detail:null})});
  assert.notEqual((await s.run(root=>root.node(n,1n,opts),completion<bigint>())).status,'COMPLETE');
  assert.deepEqual([run,after,cleanup],[1,1,1]);
  assert.notEqual((await terminal.read(()=>ok(++run))).status,'COMPLETE');assert.equal(run,1);
});
