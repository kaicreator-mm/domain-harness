import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { NativeWorkflowContext, StandardWorkflowOutcome, WorkflowControlOptions,
  WorkflowCompletionPolicy, WorkflowObservation, WorkflowTerminalContext } from '@kaicreator/domain-harness';
import type { EvidenceObservation } from '../../src/standard-evidence.js';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const fail = (code: string): StandardWorkflowOutcome<never> => ({ status: 'FAILED', reason: { code, message: 'failure' } });
const rootWork = 99086; // frozen (4+3*(256+4*8192)) + validate1 + K(0) + 8*F(0)
const childWork = 99080;
const complete = <T>(): WorkflowCompletionPolicy<T> => ({
  goal: 'verify actual goal', requiredKnowledge: [], terminalReads: 0, validate: () => ok(undefined),
});
const options = (patch: Partial<WorkflowControlOptions> = {}): WorkflowControlOptions => ({
  limits: { maxWork: 1000000, maxEvents: 100, maxActiveScopes: 10, maxNoProgress: 5,
    maxActiveMs: 10000, maxSettlementMs: 1000 },
  knowledge: { maxItems: 0, current: () => ({ epoch: 0, context: { scope: 'root', revisions: new Map() } }),
    equal: Object.is },
  current: () => true, ...patch,
});
const minimal = (patch: Partial<WorkflowControlOptions['limits']> = {}) => options({
  limits: { ...options().limits, maxWork: rootWork, maxEvents: 3, maxActiveScopes: 1, ...patch },
});
const base = { maxCalls: 20, maxSteps: 30, maxDepth: 3 };
const codeOf = (r: StandardWorkflowOutcome<unknown>) => r.status === 'COMPLETE' ? r.status : r.reason.code;
const deferred = () => { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; };

test('exact root pre-reservation and actual candidate/disposition; no user callback after publication', async () => {
  const records: WorkflowObservation[] = [];
  const control = minimal();
  const session = new StandardWorkflowSession({ maxCalls: 1, maxSteps: 2, maxDepth: 0 }, {
    ...control, observe: r => { records.push(r); },
  });
  let retained!: NativeWorkflowContext;
  const result = await session.run(root => {
    retained = root;
    assert.deepEqual(root.remaining(), { calls: 0, steps: 0, maxDescendantDepth: 0 });
    return ok(7n);
  }, complete<bigint>());
  assert.deepEqual(result, ok(7n));
  assert.equal(records.length, 2);
  const final = session.dispositions();
  assert.equal(final.length, 1);
  const record = final[0];
  assert.ok(record?.kind === 'scope');
  if (record.kind === 'scope') {
    assert.equal(record.phase, 'closed');
    assert.equal(record.outcome?.status, 'COMPLETE');
    assert.equal(record.candidateSeq, records[1]?.seq);
    assert.equal(record.scopeId, retained.scopeId);
    assert.equal(record.runId, retained.runId);
    assert.equal(record.localQuiescent, true);
  }
  assert.ok(Object.isFrozen(final) && Object.isFrozen(final[0]));
  assert.equal(codeOf(await retained.work(1, () => ok('bad'))), 'WORKFLOW_SCOPE_CLOSED');
  assert.equal(codeOf(await session.run(() => ok(2), complete<number>())), 'WORKFLOW_ALREADY_RUN');
});

for (const [name, calls, steps, patch] of [
  ['calls', 0, 2, {}], ['steps', 1, 1, {}], ['work', 1, 2, { maxWork: rootWork - 1 }],
  ['events', 1, 2, { maxEvents: 2 }], ['active slots', 1, 2, { maxActiveScopes: 0 }],
] as const) {
  test('one short root rejects before any guard/observer/action: ' + name, async () => {
    let entered = 0;
    const c = minimal(patch);
    const session = new StandardWorkflowSession({ maxCalls: calls, maxSteps: steps, maxDepth: 0 }, {
      ...c, current: () => { entered++; return true; }, observe: () => { entered++; },
    });
    const result = await session.run(() => { entered++; return ok(1); }, complete<number>());
    assert.notEqual(result.status, 'COMPLETE');
    assert.equal(entered, 0);
    assert.equal(session.dispositions().length, 0);
  });
}

test('missing/malformed completion, preaborted and zero time reject without action', async () => {
  let entered = 0;
  const action = () => { entered++; return ok(1); };
  assert.notEqual((await new StandardWorkflowSession(base, options()).run(action)).status, 'COMPLETE');
  assert.notEqual((await new StandardWorkflowSession(base, options()).run(action, {
    ...complete<number>(), requiredKnowledge: [{ key: 'x', accepts: ['authority'] }],
  })).status, 'COMPLETE');
  const abort = new AbortController(); abort.abort();
  assert.notEqual((await new StandardWorkflowSession(base, options({ signal: abort.signal })).run(action, complete<number>())).status, 'COMPLETE');
  assert.notEqual((await new StandardWorkflowSession(base, minimal({ maxActiveMs: 0 })).run(action, complete<number>())).status, 'COMPLETE');
  assert.equal(entered, 0);
});

test('child actual ownership, shared ledger, active cap released only after join', async () => {
  const gate = deferred(), entered = deferred();
  const session = new StandardWorkflowSession(base, minimal({
    maxWork: rootWork + 2 + 2 * childWork + 5, maxEvents: 9, maxActiveScopes: 2,
  }));
  const result = await session.run(async root => {
    let child!: NativeWorkflowContext;
    const first = root.child(0, async scope => {
      child = scope; entered.release(); await gate.promise;
      return scope.work(1, () => ok(3));
    });
    await entered.promise;
    let blocked = 0;
    assert.equal(codeOf(await root.child(0, () => { blocked++; return ok(0); })), 'WORKFLOW_ACTIVE_SCOPE_LIMIT');
    assert.equal(blocked, 0);
    assert.equal(child.runId, root.runId);
    assert.notEqual(child.scopeId, root.scopeId);
    gate.release();
    assert.deepEqual(await first, ok(3));
    assert.equal(codeOf(await child.invoke(() => 1)), 'WORKFLOW_SCOPE_CLOSED');
    assert.deepEqual(await root.child(0, () => ok(4)), ok(4));
    return ok(7);
  }, complete<number>());
  assert.deepEqual(result, ok(7));
  assert.equal(session.dispositions().length, 3);
});

test('managed work/leaf reservations precede callbacks and no double charge', async () => {
  const session = new StandardWorkflowSession({ maxCalls: 3, maxSteps: 4, maxDepth: 0 },
    minimal({ maxWork: rootWork + 10 }));
  let entered = 0;
  const result = await session.run(async root => {
    assert.equal(codeOf(await root.work(7, () => { entered++; return ok(0); })), 'WORKFLOW_WORK_BUDGET');
    assert.equal(codeOf(await root.leaf({ start: () => { entered++; }, run: () => ok(1), end: () => { entered++; } })), 'WORKFLOW_CALL_BUDGET');
    assert.equal(entered, 0);
    assert.deepEqual(await root.leaf({ start: () => { entered++; }, run: () => ok(++entered) }), ok(2));
    assert.equal(root.remaining().calls, 0);
    return ok(2);
  }, complete<number>());
  assert.deepEqual(result, ok(2));
  assert.equal(entered, 2);
});

test('actual root abort closes admission, waits for cleanup and rejects late COMPLETE', async () => {
  const abort = new AbortController();
  const gate = deferred(), entered = deferred();
  let root!: NativeWorkflowContext;
  let ran = false, ended = false, returned = false;
  const session = new StandardWorkflowSession(base, options({ signal: abort.signal }));
  const pending = session.run(ctx => {
    root = ctx;
    return ctx.leaf({
      run: async () => { entered.release(); await gate.promise; ran = true; return ok(9); },
      end: () => { ended = true; },
    });
  }, complete<number>());
  void pending.then(() => { returned = true; });
  await entered.promise;
  abort.abort();
  assert.equal(root.signal.aborted, true);
  assert.equal(codeOf(await root.invoke(() => 3)), 'WORKFLOW_SCOPE_CLOSED');
  await sleep(10);
  assert.equal(returned, false);
  gate.release();
  assert.notEqual((await pending).status, 'COMPLETE');
  assert.equal(ran && ended, true);
  assert.equal(session.dispositions().length, 1);
});

test('actual active deadline aborts in-flight callback and still waits for it', async () => {
  const session = new StandardWorkflowSession(base, options({
    limits: { ...options().limits, maxActiveMs: 25 },
  }));
  let sawAbort = false;
  const result = await session.run(root => root.invoke(async () => {
    if (!root.signal.aborted) await new Promise<void>(resolve => root.signal.addEventListener('abort', () => { resolve(); }, { once: true }));
    sawAbort = root.signal.aborted;
    await sleep(5);
    return 2;
  }), complete<number>());
  assert.equal(sawAbort, true);
  assert.notEqual(result.status, 'COMPLETE');
});

function knowledgeCase() {
  let epoch = 1, price = 60, asOf = 5;
  const control = options({ knowledge: { maxItems: 2, equal: (_key, a, b) => a === b,
    current: () => ({ epoch, context: { scope: 'procurement', revisions: new Map([['quote', String(epoch)]]), asOf } }),
  } });
  const observation = (): EvidenceObservation<string, unknown> => ({ key: 'price', origin: 'authority',
    source: { id: 'quote', scope: 'procurement', revision: String(epoch), validity: { from: 0, until: 10 } },
    state: 'known', value: price });
  return { control, observation, change: (next: number) => { epoch++; price = next; }, expire: () => { asOf = 10; } };
}

test('root final knowledge is independently read after action; stale candidate rejected, unchanged goal allowed', async () => {
  for (const [next, expected] of [[72, 'FAILED'], [60, 'COMPLETE']] as const) {
    const facts = knowledgeCase();
    let read = 0;
    const session = new StandardWorkflowSession(base, facts.control);
    const policy: WorkflowCompletionPolicy<number> = {
      goal: 'current price equals selected total', requiredKnowledge: [{ key: 'price', accepts: ['authority'] }], terminalReads: 1,
      observe: (_value, scope) => scope.read(() => { read++; return ok([facts.observation()]); }),
      validate: (value, view) => {
        const item = view.knowledge?.complete ? view.knowledge.items[0] : undefined;
        return item?.status === 'resolved' && item.value === value ? ok(undefined) : fail('PRICE_CHANGED');
      },
    };
    const result = await session.run(() => { facts.change(next); return ok(60); }, policy);
    assert.equal(result.status, expected);
    assert.equal(read, 1);
  }
});

test('missing, foreign, expired required knowledge fail before root acceptance', async () => {
  for (const mode of ['missing', 'foreign', 'expired'] as const) {
    const facts = knowledgeCase();
    let validate = 0;
    const policy: WorkflowCompletionPolicy<number> = {
      goal: 'valid quote', requiredKnowledge: [{ key: 'price', accepts: ['authority'] }], terminalReads: 0,
      observe: () => {
        if (mode === 'missing') return ok([]);
        const actual = facts.observation();
        if (mode === 'expired') facts.expire();
        return ok([mode === 'foreign' ? { ...actual, source: { ...actual.source, scope: 'other' } } : actual]);
      },
      validate: () => { validate++; return ok(undefined); },
    };
    const result = await new StandardWorkflowSession(base, facts.control).run(() => ok(60), policy);
    assert.notEqual(result.status, 'COMPLETE');
    if (mode !== 'expired') assert.equal(validate, 0);
  }
});

test('candidate delivered then required sink fails or changes frame: final disposition cannot accept', async () => {
  for (const mode of ['failure', 'changed'] as const) {
    const facts = knowledgeCase();
    const delivered: WorkflowObservation[] = [];
    const session = new StandardWorkflowSession(base, { ...facts.control, evidence: { required: true, emit: r => {
      delivered.push(r);
      if (r.kind === 'scope' && r.phase === 'candidate') {
        if (mode === 'failure') return fail('SINK');
        facts.change(72);
      }
      return ok(undefined);
    } } });
    const result = await session.run(() => ok(60), complete<number>());
    assert.notEqual(result.status, 'COMPLETE');
    assert.equal(delivered.length, 2);
    const candidate = delivered[1], final = session.dispositions()[0];
    assert.ok(candidate?.kind === 'scope' && candidate.phase === 'candidate' && candidate.outcome?.status === 'COMPLETE');
    assert.ok(final?.kind === 'scope' && final.phase === 'closed' && final.outcome?.status !== 'COMPLETE'
      && final.candidateSeq === candidate.seq);
    assert.equal(final.delivery, mode === 'failure' ? 'failed' : 'satisfied');
  }
});

test('child required sink failure is not masked by parent returning COMPLETE', async () => {
  const session = new StandardWorkflowSession(base, options({ evidence: { required: true, emit: r =>
    r.kind === 'scope' && r.phase === 'candidate' && r.parentScopeId !== undefined ? fail('SINK') : ok(undefined) } }));
  const result = await session.run(async root => {
    assert.notEqual((await root.child(0, () => ok(1))).status, 'COMPLETE');
    return ok(2);
  }, complete<number>());
  assert.notEqual(result.status, 'COMPLETE');
  assert.equal(session.dispositions().length, 2);
});

test('terminal read ticket is finite, expires on closure and cannot invoke ordinary work', async () => {
  const facts = knowledgeCase();
  let retained!: WorkflowTerminalContext, root!: NativeWorkflowContext, reads = 0;
  const policy: WorkflowCompletionPolicy<number> = {
    goal: 'current quote', requiredKnowledge: [{ key: 'price', accepts: ['authority'] }], terminalReads: 1,
    observe: async (_value, terminal) => {
      retained = terminal;
      assert.equal(codeOf(await root.invoke(() => { reads++; return 1; })), 'WORKFLOW_SCOPE_CLOSED');
      return terminal.read(() => { reads++; return ok([facts.observation()]); });
    },
    validate: () => ok(undefined),
  };
  const result = await new StandardWorkflowSession(base, facts.control).run(ctx => { root = ctx; return ok(60); }, policy);
  assert.deepEqual(result, ok(60));
  assert.equal(reads, 1);
  assert.notEqual((await retained.read(() => { reads++; return ok(0); })).status, 'COMPLETE');
  assert.equal(reads, 1);
});

test('over-limit terminal read is denied and cannot be ignored for success', async () => {
  let reads = 0;
  const policy: WorkflowCompletionPolicy<number> = {
    ...complete<number>(), terminalReads: 0, observe: async (_value, terminal) => {
      assert.notEqual((await terminal.read(() => { reads++; return ok(0); })).status, 'COMPLETE');
      return ok([]);
    },
  };
  const result = await new StandardWorkflowSession(base, options()).run(() => ok(1), policy);
  assert.notEqual(result.status, 'COMPLETE');
  assert.equal(reads, 0);
});

test('reentrant callback cannot admit new work, optional observer failure diagnosed', async () => {
  let root: NativeWorkflowContext | undefined, calls = 0;
  const pending: Promise<StandardWorkflowOutcome<number>>[] = [];
  const session = new StandardWorkflowSession(base, options({ observe: r => {
    if (r.kind === 'scope' && r.phase === 'candidate' && root) {
      pending.push(root.invoke(() => ++calls));
      throw Error('diagnostic');
    }
  } }));
  const result = await session.run(ctx => { root = ctx; return ok(1); }, complete<number>());
  assert.deepEqual(result, ok(1));
  assert.equal(calls, 0);
  assert.notEqual((await pending[0]!).status, 'COMPLETE');
  const final = session.dispositions()[0];
  assert.ok(final?.kind === 'scope' && final.reason === 'WORKFLOW_OBSERVER_FAILED');
});
