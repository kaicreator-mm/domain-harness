import assert from 'node:assert/strict';
import test from 'node:test';
import { InteractionElement } from '../../src/standard-interaction.js';
import type { InteractionDecision } from '../../src/standard-interaction.js';
import type { InteractionEvent, InteractionPrompt } from '../../src/interaction-protocol.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';
import { runInteractiveRecognitionHandling } from '../../src/standard-interactive-recognition.js';
import { resolveEvidence } from '../../src/standard-evidence.js';
import type { EvidenceObservation } from '../../src/standard-evidence.js';
import { selectNextDecision } from '../../src/standard-decision.js';
import { prepareCandidates } from '../../src/standard-candidates.js';
import { buildClarification, mapClarificationResponse } from '../../src/standard-clarification.js';
import type { ClarificationPreparation } from '../../src/standard-clarification.js';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const stop = (status: 'REJECT' | 'ASK' | 'WAIT' | 'UNKNOWN' | 'FAILED', code = 'DOMAIN'): StandardWorkflowOutcome<never> => ({ status, reason: { code, message: code } });
const limits = (calls: number, steps = calls + 1) => ({ maxCalls: calls, maxSteps: steps, maxDepth: 0 });
const envelope = (p: InteractionPrompt) => ({ intentId: p.intentId, revision: p.revision, decisionKey: p.decisionKey });
const ready = (n: number): StandardWorkflowOutcome<InteractionDecision<number, number>> => ok({ kind: 'ready', intent: n });
const ask = (n: number): StandardWorkflowOutcome<InteractionDecision<number, number>> => ok({ kind: 'clarify', state: n, prompt: { decisionKey: 'x', title: 'X', actions: ['submit'], fields: [{ id: 'x', kind: 'number', label: 'X', required: true }] } });
const answer = (event: InteractionEvent) => event.kind === 'response' && event.response.action === 'submit' ? Number(event.response.values.x) : 0;

test('完全识别及处理共根，精确2/3，差一调用或步骤不进入处理', async () => {
  for (const [calls, steps] of [[2, 3], [1, 3], [2, 2]] as const) {
    let handled = 0, analyzed = 0;
    const result = await runInteractiveRecognitionHandling(new InteractionElement(), limits(calls, steps), 3,
      (n, _event, root) => { analyzed++; assert.equal(root.depth, 0); return ready(n); },
      (intent, scope) => { handled++; assert.deepEqual(scope.root.remaining(), { calls: 0, steps: 0, maxDescendantDepth: 0 }); return ok(intent * 2); });
    assert.equal(analyzed, 1); assert.equal(handled, calls === 2 && steps === 3 ? 1 : 0);
    assert.deepEqual(result.status === 'COMPLETE' ? result.value : result.reason.code, calls === 2 && steps === 3 ? 6 : calls === 1 ? 'WORKFLOW_CALL_BUDGET' : 'WORKFLOW_STEP_BUDGET');
  }
});

test('识别与处理的非成功结果保持对象身份，不进入自动澄清或重试', async () => {
  for (const status of ['ASK', 'WAIT', 'REJECT', 'UNKNOWN', 'FAILED'] as const) {
    const denied = stop(status);
    let handled = 0;
    assert.equal(await runInteractiveRecognitionHandling(new InteractionElement(), limits(2), 1, () => denied, () => { handled++; return ok(1); }), denied);
    assert.equal(handled, 0);
    assert.equal(await runInteractiveRecognitionHandling(new InteractionElement(), limits(2), 1, ready, () => { handled++; return denied; }), denied);
    assert.equal(handled, 1);
  }
});

test('一次澄清4/5、两轮6/7、差一预算阻止处理，根不重置', async () => {
  for (const rounds of [1, 2]) for (const short of [false, true]) {
    let prompted = 0, analyzed = 0, handled = 0;
    const e = new InteractionElement({ onPrompt: p => { prompted++; assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { x: prompted } }).accepted, true); } });
    const result = await runInteractiveRecognitionHandling(e, limits(2 + 2 * rounds - Number(short)), 0,
      (n, event) => { analyzed++; return n < rounds ? ask(n + 1) : ready(answer(event)); },
      (intent, scope) => { handled++; assert.equal(scope.root.remaining().calls, 0); return ok(intent); });
    assert.equal(prompted, rounds); assert.equal(analyzed, rounds + 1); assert.equal(handled, Number(!short));
    assert.equal(result.status, short ? 'FAILED' : 'COMPLETE');
  }
});

test('处理checkpoint显式再次澄清，原处理不重跑，后续操作另计费', async () => {
  for (const calls of [6, 5]) {
    const trace: string[] = [];
    const e = new InteractionElement({ onPrompt: p => { trace.push('prompt'); assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { x: 7 } }).accepted, true); } });
    const receipt = Object.freeze({ id: 'previous', state: 'UNKNOWN' });
    const result = await runInteractiveRecognitionHandling(e, limits(calls), 1, ready, async (_intent, scope) => {
      trace.push('checkpoint');
      const clarified = await scope.resolve(0, (_state, event) => event.kind === 'initial' ? ask(1) : ready(answer(event)));
      if (clarified.status !== 'COMPLETE') return clarified;
      return scope.step(() => { trace.push('next'); return ok({ receipt, next: clarified.value }); });
    });
    assert.deepEqual(trace, calls === 6 ? ['checkpoint', 'prompt', 'next'] : ['checkpoint', 'prompt']);
    if (calls === 6) { assert.equal(result.status, 'COMPLETE'); if (result.status === 'COMPLETE') { assert.equal(result.value.receipt, receipt); assert.equal(result.value.next, 7); } }
    else assert.deepEqual(result.status === 'COMPLETE' ? result.value : result.reason.code, 'WORKFLOW_CALL_BUDGET');
  }
});

test('等待局部取消，独立意图完成；已进入处理的UNKNOWN不被取消覆盖', async () => {
  let notified!: () => void;
  const waiting = new Promise<void>(resolve => { notified = resolve; });
  let handled = 0;
  const a = new InteractionElement({ onPrompt: () => { notified(); } });
  const active = runInteractiveRecognitionHandling(a, limits(4), 0, () => ask(1), () => { handled++; return ok(0); });
  await waiting;
  assert.deepEqual(await runInteractiveRecognitionHandling(new InteractionElement(), limits(2), 9, ready, n => ok(n)), ok(9));
  a.cancel(); assert.equal((await active).status, 'REJECT'); assert.equal(handled, 0);
  const b = new InteractionElement(); const receipt = stop('UNKNOWN', 'ACK_LOST');
  const result = await runInteractiveRecognitionHandling(b, limits(3), 1, ready, async (_intent, scope) => {
    b.cancel();
    const denied = await scope.step(() => { handled++; return ok(1); });
    assert.equal(denied.status, 'REJECT'); return receipt;
  });
  assert.equal(result, receipt); assert.equal(handled, 0);
});

// 真实B/C/D/E+A薄消费：只使用明确领域词表、实际字段形状；不模拟专业计算成功。
type Key = 'authority' | 'goal' | 'scenario';
type Input = string | Readonly<{ goal?: string; scenario?: string }>;
async function fixture(kind: 'media' | 'workshop', input: Input, authority: boolean, responses: readonly string[]) {
  const context = { scope: kind, revisions: new Map([['facts', 'v1']]) };
  const source = { id: 'facts', scope: kind, revision: 'v1' };
  const observations: EvidenceObservation<Key, string>[] = [];
  const add = (key: Key, value: string, origin: 'authority' | 'user') => { observations.push({ key, value, origin, state: 'known', source }); };
  if (authority) add('authority', kind === 'media' ? 'archive-v1' : 'shop-v2', 'authority');
  let prepared: Extract<ClarificationPreparation<Key>, { status: 'prompt' }> | undefined, current: InteractionPrompt | undefined;
  let asked = 0, handled = 0;
  const e = new InteractionElement({ onPrompt: p => { current = p; const value = responses[asked++]!; assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { [p.fields[0]!.id]: value } }).accepted, true); } });
  const decide = (state: Readonly<Input>, event: InteractionEvent): StandardWorkflowOutcome<InteractionDecision<Input, Readonly<{ goal: string; scenario?: string; authority: string }>>> => {
    if (event.kind === 'initial') {
      if (typeof state === 'string') {
        const allowed = kind === 'media' ? /^归档 photo-a(?: (video-b|photo-c))?$/u : /^排程(?: (current|what-if)(?: (shop-v1|shop-v2))?)?$/u;
        const match = state.match(allowed); if (!match) return stop('UNKNOWN', 'UNSUPPORTED_INPUT');
        if (kind === 'media') { if (match[1]) add('goal', match[1], 'user'); }
        else { if (match[1]) add('goal', match[1], 'user'); if (match[2]) add('scenario', match[2], 'user'); }
      } else { if (state.goal !== undefined) add('goal', state.goal, 'user'); if (state.scenario !== undefined) add('scenario', state.scenario, 'user'); }
    } else {
      if (!prepared || !current) assert.fail('binding');
      const mapped = mapClarificationResponse(prepared, current, event);
      if (mapped.status !== 'values') return stop('UNKNOWN');
      for (const item of mapped.values) { if (typeof item.value !== 'string') return stop('REJECT'); add(item.key, item.value, 'user'); }
    }
    const facts = resolveEvidence<Key, string>([{ key: 'authority', accepts: ['authority'] }, { key: 'goal', accepts: ['user'] }, { key: 'scenario', accepts: ['user'] }], observations, context, { equal: (_k, a, b) => a === b }, 16);
    if (!facts.complete) return stop('FAILED');
    const values = new Map(facts.items.filter(row => row.status === 'resolved').map(row => [row.key, row.value]));
    const goal = values.get('goal'), scenario = values.get('scenario'), fact = values.get('authority');
    if (!fact) return stop('UNKNOWN', 'AUTHORITY_MISSING');
    const goals = kind === 'media' ? ['video-b', 'photo-c'] : ['current', 'what-if'];
    const scenarios = ['shop-v1', 'shop-v2'];
    if (goal !== undefined && !goals.includes(goal) || scenario !== undefined && !scenarios.includes(scenario)) return stop('REJECT', 'INVALID_INPUT');
    const selected = selectNextDecision<Key>([{ key: 'goal', applicable: 'yes', required: 'yes', satisfied: goal ? 'yes' : 'no', dependsOn: [], priority: 2 },
      { key: 'scenario', applicable: goal === 'what-if' ? 'yes' : 'no', required: 'yes', satisfied: scenario ? 'yes' : 'no', dependsOn: ['goal'], priority: 1 }], { maxItems: 8, maxDependencies: 8 });
    if (!selected.complete) return stop('FAILED');
    const key = selected.status === 'next' ? selected.key : 'goal';
    const ids = key === 'scenario' ? scenarios : goals;
    const candidateContext = { scope: kind, revision: key };
    const candidates = prepareCandidates({ ...candidateContext, status: 'complete', entries: ids.map(id => ({ ...candidateContext, id, value: id })) }, candidateContext,
      { assess: () => ({ status: 'eligible' }), comparisonLabels: [], project: entry => ({ label: entry.value, priority: 0, cells: [] }) }, { maxVisited: 8, maxReturned: 8 });
    const built = buildClarification(facts, selected, { decisionKey: key, title: key, actions: ['submit'] }, [{ field: { kind: 'choice', id: key, label: key, required: true, options: [], completeness: 'incomplete' }, evidenceKey: key, applicable: 'yes', confirmation: 'user', candidates: { current: candidateContext, result: candidates } }]);
    if (built.status === 'ready' && goal) return ok({ kind: 'ready', intent: { goal, authority: fact, ...(goal === 'what-if' && scenario ? { scenario } : {}) } });
    if (built.status !== 'prompt') return stop('UNKNOWN');
    prepared = built; return ok({ kind: 'clarify', state, prompt: built.prompt });
  };
  const result = await runInteractiveRecognitionHandling(e, limits(2 + responses.length * 2), input, decide, (intent, scope) => {
    handled++; assert.equal(scope.root.remaining().calls, 0); return ok(intent);
  });
  return { result, asked, handled };
}

test('媒体文本/结构化完整零问、部分只问第二件，缺权威或不支持不处理', async () => {
  const expected = { result: ok({ goal: 'video-b', authority: 'archive-v1' }), asked: 0, handled: 1 };
  assert.deepEqual(await fixture('media', '归档 photo-a video-b', true, []), expected);
  assert.deepEqual(await fixture('media', { goal: 'video-b' }, true, []), expected);
  assert.deepEqual(await fixture('media', '归档 photo-a', true, ['video-b']), { ...expected, asked: 1 });
  assert.deepEqual(await fixture('media', '归档 photo-a video-b', false, []), { result: stop('UNKNOWN', 'AUTHORITY_MISSING'), asked: 0, handled: 0 });
  assert.deepEqual(await fixture('media', '任意请求', true, []), { result: stop('UNKNOWN', 'UNSUPPORTED_INPUT'), asked: 0, handled: 0 });
});

test('维修当前日历与假设情景分支，同一真实组合两轮及明确结构化输入', async () => {
  assert.deepEqual(await fixture('workshop', '排程 current', true, []), { result: ok({ goal: 'current', authority: 'shop-v2' }), asked: 0, handled: 1 });
  const expected = { result: ok({ goal: 'what-if', authority: 'shop-v2', scenario: 'shop-v1' }), asked: 0, handled: 1 };
  assert.deepEqual(await fixture('workshop', { goal: 'what-if', scenario: 'shop-v1' }, true, []), expected);
  assert.deepEqual(await fixture('workshop', '排程', true, ['what-if', 'shop-v1']), { ...expected, asked: 2 });
  assert.deepEqual(await fixture('workshop', { goal: 'invalid' }, true, []), { result: stop('REJECT', 'INVALID_INPUT'), asked: 0, handled: 0 });
});
