import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { KernelLifecycle } from '../../src/kernel-lifecycle.js';
import { InteractionElement } from '../../src/standard-interaction.js';
import { StandardWorkflowSession } from '../../src/native-workflow-composition.js';
import type { WorkflowControlOptions, WorkflowCompletionPolicy } from '../../src/workflow-managed-contract.js';
import type { InteractionDecision, InteractionEvent, InteractionPrompt, InteractionPromptSpec, InteractionScope } from '../../src/standard-interaction.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const limits = { maxCalls: 12, maxSteps: 13, maxDepth: 2 };
const managedControl = (signal?: AbortSignal): WorkflowControlOptions => ({
  limits: { maxWork: 2000000, maxEvents: 50, maxActiveScopes: 8, maxNoProgress: 5, maxActiveMs: 10000, maxSettlementMs: 1000 },
  knowledge: { maxItems: 0, current: () => ({ epoch: 0, context: { scope: 'root', revisions: new Map() } }), equal: Object.is },
  current: () => true, ...(signal === undefined ? {} : { signal }),
});
const managedCompletion = <T>(): WorkflowCompletionPolicy<T> => ({
  goal: 'actual interaction result', requiredKnowledge: [], terminalReads: 0, validate: () => ok(undefined),
});

const prompt: InteractionPromptSpec = {
  decisionKey: 'goal', title: 'Choose goal', actions: ['submit', 'revise', 'text', 'no-fit', 'reject', 'cancel'],
  fields: [{ id: 'mode', kind: 'choice', label: 'Mode', required: true, completeness: 'complete',
    options: [{ id: 'current', label: 'Current' }, { id: 'scenario', label: 'Scenario', recommended: true, reason: 'Compare' }],
    prefill: { value: 'current', source: 'default' }, comparison: [{ label: 'Scope', cells: { current: 'live', scenario: 'planning' } }] }],
};
const envelope = (p: InteractionPrompt) => ({ intentId: p.intentId, revision: p.revision, decisionKey: p.decisionKey });
const answer = (p: InteractionPrompt, mode = 'current') => ({ ...envelope(p), action: 'submit', values: { mode } });
const code = (result: StandardWorkflowOutcome<unknown>) => result.status === 'COMPLETE' ? 'COMPLETE' : result.reason.code;
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function pending(element: InteractionElement): Promise<InteractionPrompt> {
  for (let i = 0; i < 20; i++) { const p = element.current(); if (p) return p; await nextTurn(); }
  throw Error('Expected prompt');
}
function decide(_state: number, event: InteractionEvent): StandardWorkflowOutcome<InteractionDecision<number, string>> {
  return event.kind === 'initial' ? ok({ kind: 'clarify', state: 1, prompt }) : ok({ kind: 'ready', intent: 'chosen' });
}

test('明确意图零澄清、单次运行及过期 scope 拒绝', async () => {
  let notices = 0, saved!: InteractionScope;
  const e = new InteractionElement({ onPrompt: () => { notices++; } });
  const result = await e.run({ maxCalls: 2, maxSteps: 3, maxDepth: 0 }, async scope => {
    saved = scope;
    const resolved = await scope.resolve<number, number>(4, value => ok({ kind: 'ready', intent: value }));
    if (resolved.status !== 'COMPLETE') return resolved;
    return scope.step(() => ok(resolved.value * 2));
  });
  assert.deepEqual(result, ok(8)); assert.equal(notices, 0);
  assert.equal(code(await e.run(limits, () => ok(1))), 'INTERACTION_ALREADY_RUN');
  assert.equal(code(await saved.step(() => ok(1))), 'INTERACTION_NOT_RUNNING');
  assert.equal(code(await saved.resolve(0, decide)), 'INTERACTION_NOT_RUNNING');
});

test('动态两轮、响应关联与冻结记录、同根精确预算', async () => {
  const e = new InteractionElement(); let effects = 0;
  const follow: InteractionPromptSpec = { decisionKey: 'calendar', title: 'Calendar', actions: ['submit', 'revise'], fields: [{ id: 'slot', kind: 'number', label: 'Slot', required: true, min: 1, max: 4 }] };
  const run = e.run({ maxCalls: 6, maxSteps: 7, maxDepth: 0 }, async scope => {
    const resolved = await scope.resolve<number, number>(0, (state, event, root) => {
      if (event.kind === 'initial') return ok({ kind: 'clarify', state: 1, prompt });
      assert.ok(Object.isFrozen(event.records));
      if (state === 1) {
        assert.equal(event.records.length, 1); assert.ok(event.records[0]?.valid);
        assert.equal(event.response.action, 'submit');
        if (event.response.action !== 'submit') throw Error('unexpected response');
        assert.equal(event.response.values.mode, 'scenario');
        assert.deepEqual(root.remaining(), { calls: 3, steps: 3, maxDescendantDepth: 0 });
        return ok({ kind: 'clarify', state: 2, prompt: follow });
      }
      assert.equal(event.records.length, 2); assert.ok(event.records.every(record => record.valid));
      if (event.response.action !== 'submit') throw Error('unexpected response');
      assert.equal(event.response.values.slot, 3);
      const values = event.response.values; assert.throws(() => Object.assign(values, { slot: 4 }), TypeError);
      return ok({ kind: 'ready', intent: 3 });
    });
    if (resolved.status !== 'COMPLETE') return resolved;
    const result = await scope.step(() => { effects++; return ok(resolved.value); });
    assert.deepEqual(scope.root.remaining(), { calls: 0, steps: 0, maxDescendantDepth: 0 });
    return result;
  });
  const p = await pending(e); assert.ok(Object.isFrozen(p.fields[0]));
  assert.deepEqual(e.submit({ ...answer(p), intentId: 'other' }), { accepted: false, code: 'WRONG_INTENT' });
  assert.equal(e.submit({ ...answer(p), values: {} }).accepted, false);
  assert.equal(e.submit(answer(p, 'unlisted')).accepted, false);
  const response = answer(p, 'scenario'); assert.equal(e.submit(response).accepted, true);
  response.values.mode = 'current'; assert.equal(e.submit(answer(p)).accepted, false);
  const second = await pending(e); assert.equal(second.revision, p.revision + 1);
  assert.deepEqual(e.submit(answer(p)), { accepted: false, code: 'STALE_RESPONSE' });
  assert.equal(e.submit({ ...envelope(second), action: 'submit', values: { slot: 5 } }).accepted, false);
  assert.equal(e.submit({ ...envelope(second), action: 'submit', values: { slot: 3 } }).accepted, true);
  assert.deepEqual(await run, ok(3)); assert.equal(effects, 1); assert.equal(e.current(), undefined);
});

for (const [name, budget, expected, notices] of [
  ['wait-short', { maxCalls: 1, maxSteps: 5, maxDepth: 0 }, 'WORKFLOW_CALL_BUDGET', 0],
  ['reply-short', { maxCalls: 2, maxSteps: 5, maxDepth: 0 }, 'WORKFLOW_CALL_BUDGET', 1],
  ['effect-call-short', { maxCalls: 3, maxSteps: 5, maxDepth: 0 }, 'WORKFLOW_CALL_BUDGET', 1],
  ['effect-step-short', { maxCalls: 4, maxSteps: 4, maxDepth: 0 }, 'WORKFLOW_STEP_BUDGET', 1],
  ['exact', { maxCalls: 4, maxSteps: 5, maxDepth: 0 }, 'COMPLETE', 1],
] as const) {
  test('同根预算门禁：' + name, async () => {
    let shown = 0, effects = 0, analyzed = 0;
    const e = new InteractionElement({ onPrompt: p => { shown++; assert.equal(e.submit(answer(p)).accepted, true); } });
    const result = await e.run(budget, async scope => {
      const recognized = await scope.resolve(0, (state, event) => { analyzed++; return decide(state, event); });
      if (recognized.status !== 'COMPLETE') return recognized;
      return scope.step(() => { effects++; return ok('effect'); });
    });
    assert.equal(code(result), expected); assert.equal(shown, notices);
    assert.equal(effects, expected === 'COMPLETE' ? 1 : 0);
    assert.equal(analyzed, name === 'wait-short' || name === 'reply-short' ? 1 : 2);
  });
}

test('修订失效、再次 resolve 保留历史及选择性失效', async () => {
  const e = new InteractionElement();
  const run = e.run(limits, async scope => {
    const first = await scope.resolve(0, decide); if (first.status !== 'COMPLETE') return first;
    const second = await scope.resolve<number, string>(0, (state, event) => {
      if (event.kind === 'initial') { assert.equal(event.records.length, 1); return ok({ kind: 'clarify', state: 1, prompt: { ...prompt, decisionKey: 'change' } }); }
      if (state === 1) { assert.equal(event.records[0]?.valid, false); assert.equal(event.response.action, 'revise');
        return ok({ kind: 'clarify', state: 2, prompt }); }
      assert.equal(event.records[0]?.valid, false); assert.equal(event.records[1]?.valid, true);
      return ok({ kind: 'ready', intent: 'new', invalidate: ['change'] });
    });
    if (second.status !== 'COMPLETE') return second;
    return scope.resolve<number, string>(0, (_state, event) => {
      assert.deepEqual(event.records.map(record => record.valid), [false, false, true]);
      return ok({ kind: 'ready', intent: second.value });
    });
  });
  const p1 = await pending(e); assert.equal(e.submit(answer(p1)).accepted, true);
  const p2 = await pending(e); assert.equal(e.submit({ ...envelope(p2), action: 'revise', text: 'Change goal' }).accepted, true);
  const p3 = await pending(e); assert.equal(e.submit(answer(p3)).accepted, true);
  assert.deepEqual(await run, ok('new'));
});

test('字段与不可信数据校验，错误输入不消费等待或业务额度', async () => {
  const e = new InteractionElement();
  const spec: InteractionPromptSpec = { decisionKey: 'fields', title: 'Fields', actions: ['submit'], fields: [
    { id: 'text', kind: 'text', label: 'Text', required: true, minLength: 2, maxLength: 4 },
    { id: 'file', kind: 'file', label: 'File', required: true }, { id: 'flag', kind: 'boolean', label: 'Flag', required: true },
    { id: 'multi', kind: 'multi-choice', label: 'Options', required: true, completeness: 'incomplete', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
  ] };
  let seen!: InteractionScope;
  const run = e.run(limits, scope => { seen = scope; return scope.resolve<number, string>(0, (_state, event) => event.kind === 'initial'
    ? ok({ kind: 'clarify', state: 1, prompt: spec }) : ok({ kind: 'ready', intent: 'valid' })); });
  const p = await pending(e), before = seen.root.remaining();
  const valid = { text: 'ab', file: 'file-1', flag: false, multi: ['a', 'b'] };
  for (const values of [{ ...valid, text: 'a' }, { ...valid, text: 'abcde' }, { ...valid, file: '' }, { ...valid, flag: 0 }, { ...valid, multi: ['a', 'a'] }, { ...valid, multi: ['c'] }, { ...valid, multi: [] }, { ...valid, extra: true }, { ...valid, text: 'x'.repeat(70_000) }]) {
    assert.deepEqual(e.submit({ ...envelope(p), action: 'submit', values }), { accepted: false, code: 'INVALID_RESPONSE' });
  }
  let getter = 0;
  const accessor = { ...envelope(p), action: 'submit', get values() { getter++; return valid; } };
  assert.equal(e.submit(accessor).accepted, false); assert.equal(getter, 0);
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  assert.equal(e.submit({ ...envelope(p), action: 'submit', values: cycle }).accepted, false);
  assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { ...valid, flag: NaN } }).accepted, false);
  assert.deepEqual(seen.root.remaining(), before); assert.equal(e.current(), p);
  assert.equal(e.submit({ ...envelope(p), action: 'submit', values: valid }).accepted, true);
  assert.deepEqual(await run, ok('valid'));
});

test('无效 prompt 不发布：重复字段/候选、非法约束、超限和非 JSON', async () => {
  const malformed: unknown[] = [
    { ...prompt, fields: [...prompt.fields, ...prompt.fields] },
    { ...prompt, fields: [{ id: 'x', label: 'X', kind: 'choice', completeness: 'complete', options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }] },
    { ...prompt, fields: [{ id: 'x', label: 'X', kind: 'number', min: 5, max: 1 }] },
    { ...prompt, fields: Array.from({ length: 257 }, (_, i) => ({ id: 'f' + i, kind: 'boolean', label: 'X' })) },
    { ...prompt, actions: ['submit', 'submit'] }, { ...prompt, title: 'x'.repeat(70_000) }, { ...prompt, description: () => 'bad' },
  ];
  for (const invalid of malformed) {
    let notices = 0; const e = new InteractionElement({ onPrompt: () => { notices++; } });
    const result = await e.run(limits, scope => scope.resolve<number, string>(0, () => ok({ kind: 'clarify', state: 1, prompt: invalid as InteractionPromptSpec })));
    assert.equal(code(result), 'INTERACTION_INVALID_PROMPT'); assert.equal(notices, 0); assert.equal(e.current(), undefined);
  }
});

for (const kind of ['throw', 'async', 'self', 'then-getter'] as const) {
  test('通知异常不交付同步响应：' + kind, { timeout: 3000 }, async () => {
    let analyzed = 0;
    const e = new InteractionElement({ onPrompt: p => {
      assert.equal(e.submit(answer(p)).accepted, true);
      if (kind === 'throw') throw Error('PRIVATE_MARKER');
      if (kind === 'async') return Promise.reject(new Error('PRIVATE_MARKER'));
      if (kind === 'self') return run;
      return { get then() { throw Error('PRIVATE_MARKER'); } };
    } });
    const run: Promise<StandardWorkflowOutcome<string>> = e.run(limits, scope => scope.resolve(0, (state, event) => { analyzed++; return decide(state, event); }));
    const result = await run; await nextTurn();
    assert.equal(code(result), 'INTERACTION_NOTIFICATION_FAILED'); assert.equal(analyzed, 1);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_MARKER')); assert.equal(e.current(), undefined);
  });
}

test('拒绝/取消、文本及 no-fit；非成功领域结果不被包装', async () => {
  for (const action of ['reject', 'cancel', 'text', 'no-fit'] as const) {
    const e = new InteractionElement(); let analyzed = 0;
    const domain = { status: 'UNKNOWN', reason: { code: 'DOMAIN_UNKNOWN', message: 'Unknown' } } as const;
    const run = e.run(limits, scope => scope.resolve<number, string>(0, (_state, event) => {
      analyzed++; return event.kind === 'initial' ? ok({ kind: 'clarify', state: 1, prompt }) : domain;
    }));
    const p = await pending(e); assert.equal(e.submit({ ...envelope(p), action, ...(action === 'text' ? { text: 'other' } : {}) }).accepted, true);
    const result = await run;
    if (action === 'text' || action === 'no-fit') { assert.strictEqual(result, domain); assert.equal(analyzed, 2); }
    else { assert.equal(result.status, 'REJECT'); assert.equal(analyzed, 1); }
  }
  const cancelled = new InteractionElement(); cancelled.cancel();
  assert.equal(code(await cancelled.run(limits, () => { throw Error('must not enter'); })), 'CANCELLED');
});

test('同一 KDP 激活独立等待、关联结果、取消及关闭等待异步 end', { timeout: 5000 }, async () => {
  const app = new KernelLifecycle([{ packageMeta: { id: 'kdp', role: 'core', order: 0 } }]); await app.start({ appId: 'interaction' });
  const a = new InteractionElement(), b = new InteractionElement(), c = new InteractionElement();
  const endEntered = gate(), endRelease = gate(); const events: string[] = [];
  const ar = app.execute(() => a.run(limits, async scope => {
    const result = await scope.resolve(0, decide);
    if (result.status !== 'COMPLETE') { await scope.root.leaf({ run: () => result, end: async () => { endEntered.release(); await endRelease.promise; events.push('end'); } }); }
    return result;
  }));
  const dependent = app.execute(async () => { const outcome = await ar; events.push('dependent'); return outcome; });
  try {
    const ap = await pending(a);
    const br = app.execute(() => b.run(limits, scope => scope.resolve(0, decide))); const bp = await pending(b);
    assert.notEqual(ap.intentId, bp.intentId); assert.equal(b.submit(answer(ap)).accepted, false);
    assert.deepEqual(await app.execute(() => c.run(limits, scope => scope.step(() => ok('C')))), ok('C'));
    assert.equal(b.submit(answer(bp)).accepted, true); assert.deepEqual(await br, ok('chosen'));
    a.cancel(); await endEntered.promise; assert.equal(a.submit(answer(ap)).accepted, false);
    let closed = false; const close = app[Symbol.asyncDispose]().then(() => { closed = true; });
    await nextTurn(); assert.equal(closed, false); assert.deepEqual(events, []);
    endRelease.release(); assert.equal(code(await ar), 'CANCELLED'); assert.equal(code(await dependent), 'CANCELLED');
    await close; assert.deepEqual(events, ['end', 'dependent']); assert.equal(closed, true);
  } finally { a.cancel(); b.cancel(); c.cancel(); endRelease.release(); await Promise.allSettled([ar, dependent]); await app[Symbol.asyncDispose](); }
});

test('取消已进入 step 保留结果并拒绝新操作，不提早收敛', { timeout: 3000 }, async () => {
  const e = new InteractionElement(); const entered = gate(), release = gate(); let settled = false, next = 0;
  const actual = { status: 'UNKNOWN', reason: { code: 'EFFECT_UNCERTAIN', message: 'Uncertain' } } as const;
  const run = e.run(limits, async scope => {
    const result = await scope.step(async () => { entered.release(); await release.promise; return actual; });
    assert.equal(code(await scope.step(() => { next++; return ok(1); })), 'CANCELLED'); return result;
  });
  void run.then(() => { settled = true; });
  try { await entered.promise; e.cancel(); await nextTurn(); assert.equal(settled, false); }
  finally { release.release(); }
  assert.strictEqual(await run, actual); assert.equal(next, 0);
});

test('并发 resolve 拒绝、未汇合等待撤销且不虚报完成', async () => {
  const e = new InteractionElement();
  const result = await e.run(limits, async scope => {
    void scope.resolve(0, decide);
    assert.equal(code(await scope.resolve(0, decide)), 'INTERACTION_RESOLVE_ACTIVE');
    return ok('unjoined');
  });
  assert.equal(code(result), 'INTERACTION_UNJOINED_WORK'); assert.equal(e.current(), undefined);
});

test('同一决策重新提交只保留最新有效表达，原模板与响应隔离', async () => {
  const mutable = { decisionKey: 'repeat', title: 'Original', actions: ['submit'] as const,
    fields: [{ id: 'name', label: 'Name', kind: 'string' as const, required: true }] };
  const e = new InteractionElement();
  const run = e.run(limits, scope => scope.resolve<number, string>(0, (state, event) => {
    if (event.kind === 'initial') return ok({ kind: 'clarify', state: 1, prompt: mutable });
    if (state === 1) return ok({ kind: 'clarify', state: 2, prompt: mutable });
    assert.deepEqual(event.records.map(record => record.valid), [false, true]);
    assert.equal(event.response.action, 'submit');
    if (event.response.action !== 'submit') throw Error('expected submit');
    assert.equal(Object.hasOwn(event.response.values, 'toString'), false);
    assert.equal(event.response.values.toString, undefined);
    return ok({ kind: 'ready', intent: String(event.response.values.name) });
  }));
  const first = await pending(e); mutable.title = 'Changed';
  assert.equal(first.title, 'Original'); assert.equal(e.submit({ ...envelope(first), action: 'submit', values: { name: 'old' } }).accepted, true);
  const second = await pending(e); assert.equal(second.title, 'Changed');
  assert.equal(e.submit({ ...envelope(second), action: 'submit', values: { name: 'new' } }).accepted, true);
  assert.deepEqual(await run, ok('new'));
});

test('不可满足的纯提交表单在等待扣费前拒绝，无通知或后续分析', async () => {
  const fields: InteractionPromptSpec['fields'] = [
    { id: 'x', label: 'X', required: true, kind: 'choice', options: [], completeness: 'complete' },
    { id: 'x', label: 'X', required: true, kind: 'choice', options: [], completeness: 'incomplete' },
    { id: 'x', label: 'X', required: true, kind: 'multi-choice', options: [], completeness: 'complete' },
    { id: 'x', label: 'X', required: true, kind: 'multi-choice', options: [], completeness: 'incomplete' },
    { id: 'x', label: 'X', required: true, kind: 'file', maxLength: 0 },
  ];
  for (const field of fields) {
    let noticed = 0, analyzed = 0, handled = 0;
    const e = new InteractionElement({ onPrompt: () => { noticed++; e.cancel(); } });
    const result = await e.run(limits, async scope => {
      const resolved = await scope.resolve<number, string>(0, () => {
        analyzed++;
        return ok({ kind: 'clarify', state: 1, prompt: { decisionKey: 'impossible', title: 'Impossible', fields: [field], actions: ['submit'] } });
      });
      assert.deepEqual(scope.root.remaining(), { calls: 11, steps: 11, maxDescendantDepth: 2 });
      if (resolved.status !== 'COMPLETE') return resolved;
      return scope.step(() => { handled++; return ok('unexpected'); });
    });
    assert.equal(code(result), 'INTERACTION_INVALID_PROMPT');
    assert.equal(noticed, 0); assert.equal(analyzed, 1); assert.equal(handled, 0);
    assert.equal(e.current(), undefined);
  }
});

test('合法的可选空选项、纯提交及显式替代动作不被拒绝', async () => {
  for (const [field, action, values] of [
    [{ id: 'x', label: 'X', kind: 'choice', options: [], completeness: 'complete' }, 'submit', {}],
    [{ id: 'x', label: 'X', kind: 'multi-choice', options: [], completeness: 'incomplete' }, 'submit', { x: [] }],
    [{ id: 'x', label: 'X', required: true, kind: 'choice', options: [{ id: 'a', label: 'A' }], completeness: 'complete' }, 'submit', { x: 'a' }],
    [{ id: 'x', label: 'X', required: true, kind: 'file', maxLength: 0 }, 'no-fit', {}],
    [{ id: 'x', label: 'X', required: true, kind: 'choice', options: [], completeness: 'incomplete' }, 'no-fit', {}],
  ] as const satisfies readonly (readonly [InteractionPromptSpec['fields'][number], 'submit' | 'no-fit', object])[]) {
    let noticed = 0, analyzed = 0;
    const e = new InteractionElement({ onPrompt: p => {
      noticed++;
      const response = action === 'submit' ? { ...envelope(p), action, values } : { ...envelope(p), action };
      assert.equal(e.submit(response).accepted, true);
    } });
    const result = await e.run({ maxCalls: 3, maxSteps: 4, maxDepth: 0 }, scope => scope.resolve<number, string>(0, (_state, event) => {
      analyzed++;
      if (event.kind === 'initial') return ok({ kind: 'clarify', state: 1, prompt: {
        decisionKey: 'possible', title: 'Possible', fields: [field], actions: action === 'submit' ? ['submit'] : ['submit', 'no-fit'],
      } });
      assert.equal(event.response.action, action);
      return action === 'submit' ? ok({ kind: 'ready', intent: 'valid' }) : { status: 'UNKNOWN', reason: { code: 'NO_FIT', message: 'No fit' } };
    }));
    assert.equal(code(result), action === 'submit' ? 'COMPLETE' : 'NO_FIT');
    assert.equal(noticed, 1); assert.equal(analyzed, 2); assert.equal(e.current(), undefined);
  }
});

test('managed Interaction attaches actual root, shares exact call and step allowance and closes borrowed scope', async () => {
  for (const short of [false, true]) {
    const e = new InteractionElement();
    const s = new StandardWorkflowSession({ maxCalls: 6 - Number(short), maxSteps: 8, maxDepth: 1 }, managedControl());
    let retained!: InteractionScope;
    let effects = 0;
    const run = s.run(async root => {
      assert.deepEqual(await root.invoke(() => 'before'), ok('before'));
      const attached = await e.runIn(root, async scope => {
        retained = scope;
        assert.equal(scope.root.runId, root.runId);
        assert.notEqual(scope.root.scopeId, root.scopeId);
        const recognized = await scope.resolve(0, decide);
        if (recognized.status !== 'COMPLETE') return recognized;
        return scope.step(() => { effects++; return ok(recognized.value); });
      });
      assert.equal(code(await retained.root.invoke(() => 'late')), 'WORKFLOW_SCOPE_CLOSED');
      assert.equal(root.remaining().calls, 0);
      return attached;
    }, managedCompletion<string>());
    const p = await pending(e);
    assert.equal(e.submit(answer(p)).accepted, true);
    assert.equal((await run).status === 'COMPLETE', !short);
    assert.equal(effects, short ? 0 : 1);
    assert.equal(e.current(), undefined);
  }
});

test('attached cancel is local; parent abort ends actual pending wait, independent root continues', async () => {
  for (const parentCancel of [false, true]) {
    const abort = new AbortController();
    const e = new InteractionElement();
    const s = new StandardWorkflowSession(limits, managedControl(abort.signal));
    const separate = new StandardWorkflowSession(limits, managedControl());
    let retained!: InteractionScope;
    let parentEffects = 0;
    const run = s.run(async root => {
      const attached = await e.runIn(root, scope => {
        retained = scope;
        return scope.resolve(0, decide);
      });
      assert.notEqual(attached.status, 'COMPLETE');
      assert.equal(retained.root.signal.aborted, true);
      const sibling = await root.invoke(() => ++parentEffects);
      assert.equal(sibling.status === 'COMPLETE', !parentCancel);
      return attached;
    }, managedCompletion<string>());
    const p = await pending(e);
    assert.deepEqual(await separate.run(root => root.invoke(() => 9), managedCompletion<number>()), ok(9));
    if (parentCancel) abort.abort(); else e.cancel();
    assert.notEqual((await run).status, 'COMPLETE');
    assert.equal(parentEffects, parentCancel ? 0 : 1);
    assert.equal(e.current(), undefined);
    assert.equal(e.submit(answer(p)).accepted, false);
  }
});

test('attached Interaction denies unmanaged root or depth exhaustion before work', async () => {
  let entered = 0;
  const work = () => { entered++; return ok(1); };
  const legacy = new StandardWorkflowSession(limits);
  assert.notEqual((await legacy.run(root => new InteractionElement().runIn(root, work))).status, 'COMPLETE');
  const controlled = new StandardWorkflowSession({ ...limits, maxDepth: 0 }, managedControl());
  assert.notEqual((await controlled.run(root => new InteractionElement().runIn(root, work), managedCompletion<number>())).status, 'COMPLETE');
  assert.equal(entered, 0);
});
