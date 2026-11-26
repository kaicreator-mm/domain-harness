import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkflowFunction, bindWorkflowRegion, createWorkflowSlot, StandardWorkflowSession, resolveEvidence } from '../../src/index.js';
import type { NativeWorkflowContext, WorkflowFunctionBinding, WorkflowCapability, WorkflowRegionDefinition, WorkflowNode, WorkflowControlOptions, WorkflowCompletionPolicy, StandardWorkflowOutcome } from '../../src/index.js';
import { SlotLeaseScope } from '../../src/workflow-slots.js';
import { invokeCapability, capabilityData } from '../../src/workflow-capabilities.js';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const cost = createWorkflowSlot('cost', (v): v is bigint => typeof v === 'bigint');
const due = createWorkflowSlot('due', (v): v is Date => v instanceof Date);
const base = { maxCalls: 40, maxSteps: 50, maxDepth: 3 };
const completion = <T>(): WorkflowCompletionPolicy<T> => ({ goal: 'actual binding', requiredKnowledge: [], terminalReads: 0, validate: () => ok(undefined) });
function complete<T>(r: StandardWorkflowOutcome<T>): T {
  if (r.status !== 'COMPLETE') throw Error(r.reason.code);
  return r.value;
}
function environment(maxItems = 1) {
  let asOf = 1, epoch = 1;
  const knowledge = { maxItems, equal: Object.is, current: () => ({ epoch, context: {
    scope: 'root', revisions: new Map(maxItems ? [['authority', '1']] : []), asOf } }) };
  const control: WorkflowControlOptions = { knowledge, current: () => true,
    limits: { maxWork: 2000000, maxEvents: 100, maxActiveScopes: 8, maxNoProgress: 5, maxActiveMs: 10000, maxSettlementMs: 1000 } };
  const leases = new SlotLeaseScope(knowledge.current);
  const options = { knowledge, current: () => true };
  return { leases, control, options, expire: () => { asOf = 5; }, change: () => { epoch++; },
    entries: () => {
      const stage = complete(leases.write({ cost, due }, 2, w => {
        complete(w.put('cost', cost, 9007199254740993n)); return w.put('due', due, new Date(0));
      }));
      const resolved = resolveEvidence([{ key: 'quote', accepts: ['authority'] }],
        [{ key: 'quote', origin: 'authority', state: 'known', value: 1, source: {
          id: 'authority', scope: 'root', revision: '1', validity: { from: 0, until: 5 } } }],
        knowledge.current().context, knowledge, maxItems);
      return complete(leases.contextEntries(stage, { cost: ['quote'], due: ['quote'] }, resolved));
    },
  };
}
type Native = { cost: bigint; due: Date };
function binding(patch: Partial<WorkflowFunctionBinding<Native, Native>> = {}): WorkflowFunctionBinding<Native, Native> {
  return {
    id: 'calculate', description: 'native exact cost and date',
    inputs: { cost, due }, outputs: { cost, due },
    input: r => { const a = r.read('cost', cost), b = r.read('due', due);
      return a.status !== 'COMPLETE' ? a : b.status !== 'COMPLETE' ? b : ok({ cost: a.value, due: b.value }); },
    node: { id: 'calculate', goal: 'exact cost', requiredKnowledge: [], before: () => ok(undefined),
      run: v => ok({ cost: v.cost + 1n, due: v.due }), after: () => ok(undefined),
      project: () => ({ effect: 'none', detail: null }) },
    output: (v, w) => { const a = w.put('cost', cost, v.cost); return a.status === 'COMPLETE' ? w.put('due', due, v.due) : a; },
    ...patch,
  };
}
test('bound native Function runs through actual node, returns native outputs with inherited provenance', async () => {
  const e = environment(), entries = e.entries(), c = bindWorkflowFunction(binding());
  const s = new StandardWorkflowSession(base, e.control);
  const r = await s.run(async root => {
    const result = await invokeCapability(c, [c], { root, leases: e.leases, inputs: entries, maxBindings: 2, options: e.options });
    if (result.status !== 'COMPLETE') return result;
    assert.equal(result.value.get('due')?.value, entries.get('due')?.value);
    assert.deepEqual(result.value.get('cost')?.evidenceKeys, ['quote']);
    return e.leases.read({ cost }, result.value, 1, read => read.read('cost', cost));
  }, completion<bigint>());
  assert.deepEqual(r, ok(9007199254740994n));
  assert.equal(s.dispositions().filter(r => r.kind === 'node')[0]?.acceptance, 'accepted');
});
test('foreign/forged capability, missing input and incomplete output fail closed; actual receipt retained', async () => {
  for (const mode of ['forged', 'foreign', 'missing', 'output', 'expiry', 'sink'] as const) {
    const e = environment(), entries = e.entries(); let runs = 0;
    const n: WorkflowNode<Native, Native> = { ...binding().node, run: v => { runs++; return ok(v); },
      project: () => ({ effect: 'committed', receiptId: 'actual-receipt', detail: null }) };
    const c = bindWorkflowFunction(binding({ node: n, ...(mode === 'output' ? { output: () => ok(undefined) } : {}) }));
    const forged: WorkflowCapability = { ...c };
    assert.equal(capabilityData(forged), undefined);
    const s = new StandardWorkflowSession(base, { ...e.control, evidence: { required: true, emit: r => {
      if (r.kind === 'node' && r.phase === 'candidate') {
        if (mode === 'expiry') e.expire();
        if (mode === 'sink') return { status: 'FAILED', reason: { code: 'SINK', message: 'failed' } };
      }
      return ok(undefined);
    } } });
    const result = await s.run(root => invokeCapability(mode === 'forged' ? forged : c, mode === 'foreign' ? [] : [c],
      { root, leases: e.leases, inputs: mode === 'missing' ? new Map() : entries, maxBindings: 2, options: e.options }), completion<ReadonlyMap<string, unknown>>());
    assert.notEqual(result.status, 'COMPLETE', mode);
    assert.equal(runs, ['output','expiry','sink'].includes(mode) ? 1 : 0, mode);
    if (runs) {
      const record = s.dispositions().find(r => r.kind === 'node');
      assert.equal(record?.kind === 'node' && record.receiptId, 'actual-receipt');
      assert.notEqual(record?.kind === 'node' && record.acceptance, 'accepted');
    }
  }
});
test('inclusive exact/one-short binding reserves input and encoder before any callback', async () => {
  const e0 = environment(0);
  // Fixed base 132137, 2 extra calls/work + 4*F=8 + 2 leases(1+4*0)=2; progress Q=1 root / 2Q node.
  const rootWork = 99086 + 1, nodeWork = 132137 + 2 + 8 + 2 + 2;
  for (const mode of ['exact','work','calls','steps','events','active'] as const) {
    const e = environment(0); let input = 0, run = 0, output = 0, guards = 0;
    const c = bindWorkflowFunction<number, number>({ id: 'empty', description: 'empty native boundary', inputs: {}, outputs: {},
      input: () => { input++; return ok(3); },
      node: { id: 'empty', goal: 'real result', requiredKnowledge: [], before: () => ok(undefined),
        run: x => { run++; return ok(x+1); }, after: () => ok(undefined), project: () => ({ effect: 'none', detail: null }) },
      output: () => { output++; return ok(undefined); } });
    const s = new StandardWorkflowSession({ maxCalls: 7 - Number(mode === 'calls'), maxSteps: 8 - Number(mode === 'steps'), maxDepth: 0 },
      { ...e0.control, limits: { ...e0.control.limits, maxWork: rootWork + nodeWork - Number(mode === 'work'),
        maxEvents: 7 - Number(mode === 'events'), maxActiveScopes: 2 - Number(mode === 'active') } });
    const r = await s.run(root => invokeCapability(c, [c], { root, leases: e.leases, inputs: new Map(), maxBindings: 0,
      options: { ...e.options, current: () => { guards++; return true; } } }), completion<ReadonlyMap<string, unknown>>());
    assert.equal(r.status === 'COMPLETE', mode === 'exact', mode);
    assert.deepEqual([input,run,output], mode === 'exact' ? [1,1,1] : [0,0,0], mode);
    if (mode !== 'exact') assert.equal(guards,0);
  }
});
test('Region identity and child factory reject unauthorized delegated capabilities before runner', async () => {
  const e = environment(0);
  let created = 0, ran = 0;
  const childCapability = bindWorkflowFunction(binding());
  const region = bindWorkflowRegion<number, number>({
    id: 'child', description: 'child region factory', inputs: {}, outputs: {},
    input: () => ok(1), output: () => ok(undefined),
    node: { id: 'child', goal: 'child', requiredKnowledge: [], before: () => ok(undefined),
      after: () => ok(undefined), project: () => ({ effect: 'none', detail: null }) },
    create: () => {
      created++;
      const definition: WorkflowRegionDefinition<number, number> = {
        id: 'child', goal: 'actual child', constraints: [],
        limits: { maxWork: 10000, maxDescendantDepth: 0, maxCandidateBytes: 4096, maxJsonDepth: 8,
          maxJsonItems: 100, maxNodes: 2, maxBindings: 0, maxEdits: 2, maxProjectionBytes: 4096 },
        capabilities: [childCapability], knowledge: e.options.knowledge, current: () => true,
        requiredKnowledge: [], optionalKnowledge: [], contextSlots: {}, layout: [],
        refresh: () => ok({ changed: [], dependencies: [], observations: [], slotEvidence: {} }),
        plan: view => ok({ source: 'native', proposal: { runId: view.runId, regionId: view.regionId,
          planRevision: view.planRevision ?? 0, factRevision: view.factRevision, edits: [], action: 'finish' } }),
        admit: () => ok(undefined), canSkip: () => ok(undefined), canRebind: () => ok(undefined),
        replay: 'never', complete: () => ok(1),
      };
      return ok(definition);
    },
  });
  assert.equal(region.kind,'region');
  const s = new StandardWorkflowSession(base, e.control);
  const r = await s.run(root => invokeCapability(region,[region],{root,leases:e.leases,inputs:new Map(),maxBindings:0,
    options:e.options, delegated:[], runRegion: () => { ran++; throw Error('must not enter'); }}),completion<ReadonlyMap<string,unknown>>());
  assert.notEqual(r.status,'COMPLETE'); assert.deepEqual([created,ran],[1,0]);
});


test('bound input and output cannot reenter a captured root, preserve actual node acceptance', async () => {
  const e = environment(0);
  let retained!: NativeWorkflowContext, effects = 0;
  const reentries: Promise<StandardWorkflowOutcome<number>>[] = [];
  const tryReenter = () => { reentries.push(retained.invoke(() => ++effects)); };
  const c = bindWorkflowFunction<number, number>({
    id: 'fenced', description: 'synchronous binding fences', inputs: {}, outputs: {},
    input: () => { tryReenter(); return ok(1); },
    node: { id: 'fenced', goal: 'bound function', requiredKnowledge: [], before: () => ok(undefined),
      run: v => ok(v), after: () => ok(undefined), project: () => ({ effect: 'none', detail: null }) },
    output: () => { tryReenter(); return ok(undefined); },
  });
  const s = new StandardWorkflowSession(base, e.control);
  const r = await s.run(root => { retained = root; return invokeCapability(c, [c], {
    root, leases: e.leases, inputs: new Map(), maxBindings: 0, options: e.options,
  }); }, completion<ReadonlyMap<string, unknown>>());
  assert.equal(r.status, 'COMPLETE');
  assert.equal(reentries.length, 2);
  for (const result of await Promise.all(reentries)) assert.notEqual(result.status, 'COMPLETE');
  assert.equal(effects, 0);
});
