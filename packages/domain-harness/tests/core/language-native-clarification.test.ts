import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClarification, mapClarificationResponse } from '../../src/standard-clarification.js';
import type { ClarificationField, ClarificationPreparation } from '../../src/standard-clarification.js';
import { resolveEvidence, invalidateEvidence } from '../../src/standard-evidence.js';
import type { EvidenceObservation, EvidenceRequirement } from '../../src/standard-evidence.js';
import { selectNextDecision } from '../../src/standard-decision.js';
import type { DecisionDescription } from '../../src/standard-decision.js';
import { prepareCandidates } from '../../src/standard-candidates.js';
import { makePrompt } from '../../src/interaction-protocol.js';
import type { InteractionEvent, InteractionPrompt, InteractionPromptSpec, InteractionResponse } from '../../src/interaction-protocol.js';
import { InteractionElement } from '../../src/standard-interaction.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

const limits = { maxItems: 32, maxDependencies: 64 };
const current = { scope: 'tenant-a', revision: 'r1' };
const source = { id: 'domain', ...current };
const context = { scope: current.scope, revisions: new Map([[source.id, source.revision]]) };
const known = <K extends string>(key: K, value: string, origin: EvidenceObservation<K, string>['origin']): EvidenceObservation<K, string> => ({ key, value, origin, source, state: 'known' });
const resolve = <K extends string>(requirements: readonly EvidenceRequirement<K>[], observations: readonly EvidenceObservation<K, string>[]) =>
  resolveEvidence(requirements, observations, context, { equal: (_key, a, b) => a === b }, 32);
const decision = <K extends string>(key: K, overrides: Partial<Omit<DecisionDescription<K>, 'key'>> = {}): DecisionDescription<K> => ({ key, applicable: 'yes', required: 'yes', satisfied: 'no', dependsOn: [], priority: 0, ...overrides });
const select = <K extends string>(ds: readonly DecisionDescription<K>[]) => selectNextDecision(ds, limits);
const template = (key = 'choose', actions: InteractionPromptSpec['actions'] = ['submit']): Omit<InteractionPromptSpec, 'fields'> => ({ decisionKey: key, title: 'Choose', actions });
const field = <K extends string>(key: K, overrides: Partial<ClarificationField<K, string>> = {}): ClarificationField<K, string> => ({ field: { kind: 'string', id: key, label: key, required: true }, evidenceKey: key, applicable: 'yes', confirmation: 'accepted', ...overrides });
const projection = (observation: { value: string }) => ({ value: observation.value, source: 'domain display' });
const candidates = (ids: readonly string[], version = current, status: 'complete' | 'incomplete' = 'complete') => prepareCandidates({ ...version, status, entries: ids.map(id => ({ ...version, id, value: { name: id, privatePath: '/private/' + id } })) }, version,
  { comparisonLabels: ['Name'], assess: () => ({ status: 'eligible' }), project: entry => ({ label: entry.value.name, priority: 1, reason: 'Domain preference', recommended: true, cells: [entry.value.name] }) }, { maxVisited: 16, maxReturned: 16 });
const choice = <K extends string>(key: K, ids: readonly string[], overrides: Partial<ClarificationField<K, string>> = {}): ClarificationField<K, string> => field(key, { field: { kind: 'choice', id: key, label: key, required: true, options: [], completeness: 'incomplete' }, confirmation: 'user', projectPrefill: projection, candidates: { current, result: candidates(ids) }, ...overrides });
const next = select([decision('choose')]);
const req = [{ key: 'x', accepts: ['user'] }] as const;
const missing = resolve(req, []);
function prompt<K extends string>(result: ClarificationPreparation<K>) { if (result.status !== 'prompt') assert.fail(result.status); return result; }
function event(response: InteractionResponse, valid = true): InteractionEvent { return { kind: 'response', response, records: [{ response, valid }] }; }
const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const envelope = (p: InteractionPrompt) => ({ intentId: p.intentId, revision: p.revision, decisionKey: p.decisionKey });

test('完整决策无需表单，非成功证据/决策与未知冲突不冒充ready', () => {
  assert.deepEqual(buildClarification(missing, select([decision('choose', { satisfied: 'yes' })]), template(), []), { status: 'ready' });
  assert.deepEqual(buildClarification({ complete: false, reason: 'LIMIT' }, next, template(), []), { status: 'failed', reason: 'EVIDENCE_FAILED' });
  assert.deepEqual(buildClarification(missing, { complete: false, reason: 'LIMIT' }, template(), []), { status: 'failed', reason: 'DECISION_FAILED' });
  for (const [condition, status] of [['unknown', 'unresolved'], ['conflict', 'conflict']] as const) {
    assert.deepEqual(buildClarification(missing, select([decision('choose', { satisfied: condition })]), template(), [field('x')]), { status, reason: 'DECISION' });
  }
  const blocked = select([decision<string>('parent', { applicable: 'no' }), decision<string>('choose', { dependsOn: ['parent'] })]);
  assert.deepEqual(buildClarification(missing, blocked, template(), [field('x')]), { status: 'blocked', reason: 'DECISION' });
});

test('已确定信息跳过，默认/推荐只预填，用户来源才满足user条件', () => {
  const requirements: EvidenceRequirement<string>[] = [{ key: 'known', accepts: ['authority'] }, { key: 'x', accepts: ['default', 'user'] }];
  const initial = resolve(requirements, [known('known', 'fact', 'authority'), known('x', 'proposal', 'default')]);
  const fields = [field<string>('known'), field<string>('x', { confirmation: 'user', projectPrefill: projection })];
  const before = JSON.stringify(fields);
  const prepared = prompt(buildClarification(initial, next, template(), fields));
  assert.deepEqual(prepared.prompt.fields.map(f => f.id), ['x']);
  assert.equal(prepared.prompt.fields[0]?.prefill?.value, 'proposal');
  assert.equal(prepared.prompt.fields[0]?.prefill?.source, 'default:domain display');
  assert.deepEqual(prepared.bindings, [{ fieldId: 'x', key: 'x' }]);
  assert.equal(JSON.stringify(fields), before);
  assert.ok(Object.isFrozen(prepared.prompt) && Object.isFrozen(prepared.prompt.fields) && Object.isFrozen(prepared.prompt.fields[0]?.prefill));
  const p = makePrompt(prepared.prompt, 'intent', 1);
  assert.equal(mapClarificationResponse(prepared, p, event({ ...envelope(p), action: 'submit', values: {} })).status, 'failed');
  const user = resolve(requirements, [known('known', 'fact', 'authority'), known('x', 'proposal', 'user')]);
  assert.deepEqual(buildClarification(user, next, template(), fields), { status: 'unresolved', reason: 'NO_FIELDS' });
  const recommendation = resolve(req, [known('x', 'proposed', 'recommendation')]);
  assert.equal(prompt(buildClarification(recommendation, next, template(), [field('x', { confirmation: 'user', projectPrefill: projection })])).prompt.fields[0]?.prefill?.source, 'recommendation:domain display');
  const ambiguous = resolve(req, [known('x', 'a', 'recommendation'), known('x', 'b', 'recommendation')]);
  assert.equal(prompt(buildClarification(ambiguous, next, template(), [field('x', { projectPrefill: projection })])).prompt.fields[0]?.prefill, undefined);
});

test('当前D候选与比较进入A字段，旧版本/旧选择拒绝或重新询问', () => {
  const initial = resolve(req, [known('x', 'old', 'user')]);
  const prepared = prompt(buildClarification(initial, next, template(), [choice('x', ['new'])]));
  const f = prepared.prompt.fields[0];
  assert.equal(f?.kind, 'choice');
  if (f?.kind !== 'choice') assert.fail('choice');
  assert.deepEqual(f.options.map(o => o.id), ['new']); assert.equal(f.prefill, undefined);
  assert.equal(f.comparison?.[0]?.cells.new, 'new'); assert.ok(!JSON.stringify(prepared).includes('/private/'));
  assert.deepEqual(buildClarification(initial, next, template(), [choice('x', ['old'])]), { status: 'unresolved', reason: 'NO_FIELDS' });
  const v2 = { ...current, revision: 'r2' };
  assert.deepEqual(buildClarification(missing, next, template(), [choice('x', [], { candidates: { current: v2, result: candidates(['new']) } })]), { status: 'failed', reason: 'STALE_CANDIDATES' });
  const partial = prompt(buildClarification(missing, next, template(), [choice('x', [], { candidates: { current, result: candidates(['new'], current, 'incomplete') } })]));
  const partialField = partial.prompt.fields[0];
  if (partialField?.kind !== 'choice') assert.fail('choice');
  assert.equal(partialField.completeness, 'incomplete'); assert.equal(partialField.options[0]?.recommended, undefined);
  assert.deepEqual(buildClarification(missing, next, template(), [choice('x', [], { candidates: { current, result: { status: 'failed', complete: false, reason: 'SOURCE_FAILED' } } })]), { status: 'failed', reason: 'CANDIDATE_FAILED' });
});

test('动态适用性、无合法候选及替代动作不会自动ready', () => {
  assert.deepEqual(buildClarification(missing, next, template(), [field('x', { applicable: 'no' })]), { status: 'unresolved', reason: 'NO_FIELDS' });
  assert.deepEqual(buildClarification(missing, next, template(), [field('x', { applicable: 'unknown' })]), { status: 'unresolved', reason: 'FIELD_APPLICABILITY' });
  assert.deepEqual(buildClarification(missing, next, template(), [field('x', { applicable: 'conflict' })]), { status: 'conflict', reason: 'FIELD_APPLICABILITY' });
  const na = resolve(req, [{ key: 'x', state: 'not-applicable', origin: 'user', source }]);
  assert.deepEqual(buildClarification(na, next, template(), [field('x')]), { status: 'unresolved', reason: 'EVIDENCE_NOT_APPLICABLE' });
  for (const status of ['complete', 'incomplete'] as const) {
    const binding = choice('x', [], { candidates: { current, result: candidates([], current, status) } });
    assert.deepEqual(buildClarification(missing, next, template(), [binding]), { status: 'unresolved', reason: 'NO_SUBMISSION' });
    const prepared = prompt(buildClarification(missing, next, template('choose', ['submit', 'no-fit']), [binding]));
    const p = makePrompt(prepared.prompt, 'intent', 1);
    assert.deepEqual(mapClarificationResponse(prepared, p, event({ ...envelope(p), action: 'no-fit' })), { status: 'other', action: 'no-fit' });
  }
});

test('映射仅当前有效A响应的显式字段，旧关联、额外字段、失效记录与其他表单拒绝', () => {
  const prepared = prompt(buildClarification(missing, next, template('choose', ['submit', 'revise', 'text']), [field('x')]));
  const p = makePrompt(prepared.prompt, 'intent', 2);
  const response: InteractionResponse = { ...envelope(p), action: 'submit', values: { x: 'answer' } };
  assert.deepEqual(mapClarificationResponse(prepared, p, event(response)), { status: 'values', action: 'submit', values: [{ key: 'x', origin: 'user', value: 'answer' }] });
  assert.equal(mapClarificationResponse(prepared, p, event({ ...response, revision: 1 })).status, 'failed');
  assert.equal(mapClarificationResponse(prepared, p, event({ ...response, intentId: 'other' })).status, 'failed');
  assert.equal(mapClarificationResponse(prepared, p, event({ ...response, values: { x: 'answer', authority: true } })).status, 'failed');
  assert.equal(mapClarificationResponse(prepared, p, event(response, false)).status, 'failed');
  assert.equal(mapClarificationResponse(prepared, p, { kind: 'response', response, records: [{ response: { ...response }, valid: true }] }).status, 'failed');
  assert.equal(mapClarificationResponse(prepared, makePrompt({ ...prepared.prompt, title: 'Different' }, 'intent', 2), event(response)).status, 'failed');
  assert.deepEqual(mapClarificationResponse(prepared, p, event({ ...envelope(p), action: 'revise', values: { x: 'revised' } })), { status: 'values', action: 'revise', values: [{ key: 'x', origin: 'user', value: 'revised' }] });
  assert.deepEqual(mapClarificationResponse(prepared, p, event({ ...envelope(p), action: 'text', text: 'clarify' })), { status: 'other', action: 'text' });
});

test('限界、稀疏、非法映射、协议超限与预填失败无部分表单', () => {
  const sparse = new Array<ClarificationField<'x', string>>(1);
  const inherited = new Array<ClarificationField<'x', string>>(1);
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype) as object, { 0: field('x') }));
  for (const fields of [sparse, inherited, [field('x'), field('x')], [field('x', { field: { id: 'x', label: 'X', kind: 'string', prefill: { value: 'x', source: 'unbound' } } })]])
    assert.deepEqual(buildClarification(missing, next, template(), fields), { status: 'failed', reason: 'INVALID_MAPPING' });
  assert.deepEqual(buildClarification(missing, next, template('other'), [field('x')]), { status: 'failed', reason: 'INVALID_MAPPING' });
  assert.deepEqual(buildClarification(missing, next, template(), new Array<ClarificationField<'x', string>>(257)), { status: 'failed', reason: 'LIMIT' });
  assert.deepEqual(buildClarification(missing, next, { ...template(), title: 'x'.repeat(65536) }, [field('x')]), { status: 'failed', reason: 'INVALID_PROMPT' });
  assert.deepEqual(buildClarification(missing, next, template(), [field('x', { field: { kind: 'file', id: 'x', label: 'X', required: true, maxLength: 0 } })]), { status: 'failed', reason: 'INVALID_PROMPT' });
  const recommended = resolve(req, [known('x', 'v', 'recommendation')]);
  assert.deepEqual(buildClarification(recommended, next, template(), [field('x', { projectPrefill: () => { throw new Error('secret'); } })]), { status: 'failed', reason: 'PREFILL_FAILED' });
});

// 固定逐项询问对照：使用同一真实A运行，但不使用E的跳过与组织机制；
// 领域薄Oracle仍以真实给定的scope/policy/calendar为准，重复询问不能产生权威。
async function fixedMediaBaseline() {
  const order = ['scope', 'first', 'second', 'policy'] as const;
  const answers = { scope: 'tenant-a', first: 'photo-a', second: 'video-b', policy: 'archive-v1' };
  const asked: string[] = [];
  const confirmed = new Map<string, string>();
  const e = new InteractionElement({ onPrompt: p => {
    const key = order[asked.length]!; asked.push(key);
    assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { [key]: answers[key] } }).accepted, true);
  } });
  const result = await e.run({ maxCalls: 9, maxSteps: 10, maxDepth: 0 }, scope => scope.resolve(0, (index, input) => {
    if (input.kind === 'response') {
      assert.equal(input.response.action, 'submit');
      if (input.response.action !== 'submit') assert.fail('submit');
      const key = order[index - 1]!;
      const value = input.response.values[key];
      assert.equal(value, answers[key]); confirmed.set(key, answers[key]);
    }
    if (index === order.length) {
      assert.equal(confirmed.get('scope'), 'tenant-a'); assert.equal(confirmed.get('policy'), 'archive-v1');
      assert.notEqual(confirmed.get('first'), confirmed.get('second'));
      return ok({ kind: 'ready', intent: [confirmed.get('first'), confirmed.get('second')] });
    }
    const key = order[index]!;
    return ok({ kind: 'clarify', state: index + 1, prompt: { ...template(key), fields: [{ kind: 'string', id: key, label: key, required: true }] } });
  }));
  return { result, asked };
}

// 真实A/B/C/D/E组合，专业文件/求解与授权仍由后续领域实现独立验证。
test('媒体：只问第二件，一次选择确定配对，和固定逐项基线得到同一薄领域意图', async () => {
  const baseline = await fixedMediaBaseline();
  assert.deepEqual(baseline.asked, ['scope', 'first', 'second', 'policy']);
  assert.deepEqual(baseline.result, ok(['photo-a', 'video-b']));
  for (const complete of [false, true]) {
    type K = 'scope' | 'first' | 'second' | 'policy';
    const requirements: EvidenceRequirement<K>[] = [{ key: 'scope', accepts: ['authority'] }, { key: 'first', accepts: ['user'] }, { key: 'second', accepts: ['user'] }, { key: 'policy', accepts: ['authority'] }];
    const observations: EvidenceObservation<K, string>[] = [known<K>('scope', 'tenant-a', 'authority'), known<K>('first', 'photo-a', 'user'), known<K>('policy', 'archive-v1', 'authority'), known<K>('second', 'video-b', complete ? 'user' : 'recommendation')];
    let prepared: Extract<ClarificationPreparation<K>, { status: 'prompt' }> | undefined, currentPrompt: InteractionPrompt | undefined;
    const asked: string[] = [];
    const e = new InteractionElement({ onPrompt: p => { currentPrompt = p; asked.push(...p.fields.map(f => f.id));
      assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { second: 'video-b', scope: 'wrong' } }).accepted, false);
      assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { second: 'video-b' } }).accepted, true);
    } });
    const result = await e.run({ maxCalls: complete ? 1 : 3, maxSteps: complete ? 2 : 4, maxDepth: 0 }, scope => scope.resolve(0, (_state, input) => {
      if (input.kind === 'response') {
        if (!prepared || !currentPrompt) assert.fail('current binding');
        const mapped = mapClarificationResponse(prepared, currentPrompt, input);
        if (mapped.status !== 'values') assert.fail('map');
        for (const item of mapped.values) { assert.equal(item.key, 'second'); assert.equal(item.origin, 'user'); assert.equal(item.value, 'video-b'); observations.push(known<K>('second', 'video-b', 'user')); }
      }
      const evidence = resolve(requirements, observations);
      if (!evidence.complete) assert.fail('evidence');
      const values = new Map(evidence.items.filter(r => r.status === 'resolved').map(r => [r.key, r.value]));
      const selection = select([decision('pair', { satisfied: values.has('second') ? 'yes' : 'no' })]);
      const built = buildClarification(evidence, selection, template('pair'), [field<K>('scope'), field<K>('first'), field<K>('policy'), choice<K>('second', ['video-b', 'photo-c'])]);
      if (built.status === 'ready') {
        assert.equal(values.get('scope'), 'tenant-a'); assert.equal(values.get('policy'), 'archive-v1'); assert.notEqual(values.get('first'), values.get('second'));
        return ok({ kind: 'ready', intent: [values.get('first'), values.get('second')] });
      }
      prepared = prompt(built);
      return ok({ kind: 'clarify', state: 1, prompt: prepared.prompt });
    }));
    assert.deepEqual(result, baseline.result);
    assert.deepEqual(asked, complete ? [] : ['second']);
    const necessary = complete ? 0 : 1;
    const derived: number = Number(result.status === 'COMPLETE' && Array.isArray(result.value) && result.value.length === 2);
    const baselineDerived: number = Number(baseline.result.status === 'COMPLETE' && Array.isArray(baseline.result.value) && baseline.result.value.length === 2);
    assert.deepEqual({ necessary, repeated: baseline.asked.length - necessary, derived: baselineDerived, skipped: 0 },
      { necessary, repeated: complete ? 4 : 3, derived: 1, skipped: 0 });
    assert.deepEqual({ necessary: asked.length, repeated: 0, derived, skipped: baseline.asked.length - asked.length },
      { necessary, repeated: 0, derived: 1, skipped: complete ? 4 : 3 });
  }
});

async function fixedWorkshopBaseline() {
  const order = ['goal', 'calendar', 'scenario'] as const;
  const asked: string[] = [];
  let goal: string | undefined;
  const e = new InteractionElement({ onPrompt: p => {
    const key = order[asked.length]!; asked.push(key);
    const env = envelope(p);
    const response = key === 'scenario' ? { ...env, action: 'revise', text: 'current' } :
      { ...env, action: 'submit', values: { [key]: key === 'goal' ? 'what-if' : 'shop-v2' } };
    assert.equal(e.submit(response).accepted, true);
  } });
  const result = await e.run({ maxCalls: 7, maxSteps: 8, maxDepth: 0 }, scope => scope.resolve(0, (index, input) => {
    if (input.kind === 'response') {
      if (index === 1) {
        assert.equal(input.response.action, 'submit');
        if (input.response.action !== 'submit') assert.fail('submit');
        assert.equal(input.response.values.goal, 'what-if'); goal = 'what-if';
      } else if (index === 2) {
        assert.equal(input.response.action, 'submit');
        if (input.response.action !== 'submit') assert.fail('submit');
        assert.equal(input.response.values.calendar, 'shop-v2');
      } else {
        assert.equal(goal, 'what-if'); assert.equal(input.response.action, 'revise');
        if (input.response.action !== 'revise' || !('text' in input.response)) assert.fail('revise');
        assert.equal(input.response.text, 'current'); goal = 'current';
      }
    }
    if (index === order.length) {
      assert.equal(goal, 'current');
      return ok({ kind: 'ready', intent: { goal, calendar: 'shop-v2' } });
    }
    const key = order[index]!;
    return ok({ kind: 'clarify', state: index + 1, prompt: { ...template(key, ['submit', 'revise']), fields: [{ kind: 'string', id: key, label: key, required: true }] } });
  }));
  return { result, asked };
}

test('维修：实际前置选择后增加情景字段，revision拒旧，修订回current使旧表达失效', async () => {
  const baseline = await fixedWorkshopBaseline();
  assert.deepEqual(baseline.asked, ['goal', 'calendar', 'scenario']);
  assert.deepEqual(baseline.result, ok({ goal: 'current', calendar: 'shop-v2' }));
  type K = 'goal' | 'calendar' | 'scenario';
  const requirements: EvidenceRequirement<K>[] = [{ key: 'goal', accepts: ['user'] }, { key: 'calendar', accepts: ['authority'] }, { key: 'scenario', accepts: ['user'] }];
  let observations: EvidenceObservation<K, string>[] = [known<K>('calendar', 'shop-v2', 'authority')];
  let prepared: Extract<ClarificationPreparation<K>, { status: 'prompt' }> | undefined, p1: InteractionPrompt | undefined, p2: InteractionPrompt | undefined;
  const asked: string[][] = [];
  const e = new InteractionElement({ onPrompt: p => { asked.push(p.fields.map(f => f.id));
    if (!p1) { p1 = p; assert.equal(e.submit({ ...envelope(p), action: 'submit', values: { goal: 'what-if' } }).accepted, true); }
    else { p2 = p; assert.equal(e.submit({ ...envelope(p1), action: 'submit', values: { goal: 'current' } }).accepted, false);
      assert.equal(e.submit({ ...envelope(p), action: 'revise', text: 'current' }).accepted, true); }
  } });
  const result = await e.run({ maxCalls: 5, maxSteps: 6, maxDepth: 0 }, scope => scope.resolve(0, (_state, input) => {
    if (input.kind === 'response') {
      if (!prepared || !p1) assert.fail('binding');
      const mapped = mapClarificationResponse(prepared, p2 ?? p1, input);
      if (mapped.status === 'values') observations.push(known<K>('goal', 'what-if', 'user'));
      else { assert.deepEqual(mapped, { status: 'other', action: 'revise' }); assert.equal(input.records[0]?.valid, false);
        const invalidated = invalidateEvidence<K>(['goal', 'calendar', 'scenario'], ['goal'], [{ key: 'goal', dependsOn: [] }, { key: 'calendar', dependsOn: [] }, { key: 'scenario', dependsOn: ['goal'] }], limits);
        if (!invalidated.complete) assert.fail('invalidate');
        observations = observations.filter(o => invalidated.retained.includes(o.key)); observations.push(known<K>('goal', 'current', 'user'));
      }
    }
    const evidence = resolve(requirements, observations);
    if (!evidence.complete) assert.fail('evidence');
    const values = new Map(evidence.items.filter(r => r.status === 'resolved').map(r => [r.key, r.value]));
    const goal = values.get('goal');
    const selection = select([decision<K>('goal', { satisfied: goal ? 'yes' : 'no', priority: 9 }), decision<K>('calendar', { satisfied: values.has('calendar') ? 'yes' : 'unknown' }),
      decision<K>('scenario', { dependsOn: ['goal'], applicable: goal === 'what-if' ? 'yes' : 'no', satisfied: values.has('scenario') ? 'yes' : 'no' })]);
    const built = buildClarification(evidence, selection, template(goal === 'what-if' ? 'scenario' : 'goal', ['submit', 'revise']), [choice<K>('goal', ['current', 'what-if']), field<K>('calendar'), choice<K>('scenario', ['shop-v1', 'shop-v2'], { applicable: goal === 'what-if' ? 'yes' : 'no' })]);
    if (built.status === 'ready') { assert.equal(goal, 'current'); assert.equal(values.get('calendar'), 'shop-v2'); assert.equal(values.has('scenario'), false); return ok({ kind: 'ready', intent: { goal, calendar: values.get('calendar') } }); }
    prepared = prompt(built); return ok({ kind: 'clarify', state: 1, prompt: prepared.prompt });
  }));
  assert.deepEqual(result, baseline.result);
  assert.deepEqual(asked, [['goal'], ['scenario']]);
  const necessary = asked.flat().length;
  const derived: number = Number(result.status === 'COMPLETE' && typeof result.value === 'object' && result.value !== null && !Object.hasOwn(result.value, 'scenario'));
  assert.deepEqual({ necessary, repeated: baseline.asked.length - necessary, derived, skipped: 0 }, { necessary: 2, repeated: 1, derived: 1, skipped: 0 });
  assert.deepEqual({ necessary, repeated: 0, derived, skipped: baseline.asked.length - necessary }, { necessary: 2, repeated: 0, derived: 1, skipped: 1 });
});


test('真实异步预填回调不启动，意外Promise拒绝被观察而不接受', async () => {
  const recommended = resolve(req, [known('x', 'v', 'recommendation')]);
  type Projection = NonNullable<ClarificationField<'x', string>['projectPrefill']>;
  let called = 0;
  const asyncProject = (async () => { called++; return { value: 'v', source: 'unsafe' }; }) as unknown as Projection;
  const promiseProject = (() => Promise.reject(new Error('PRIVATE'))) as unknown as Projection;
  for (const projectPrefill of [asyncProject, promiseProject]) {
    assert.deepEqual(buildClarification(recommended, next, template(), [field('x', { projectPrefill })]), { status: 'failed', reason: 'PREFILL_FAILED' });
  }
  assert.equal(called, 0);
  await new Promise<void>(resolve => setImmediate(resolve));
});

test('复用A字段加选项总数上限，精确255个选项通过而256个拒绝', () => {
  for (const size of [255, 256]) {
    const result = prepareCandidates({ ...current, status: 'complete', entries: Array.from({ length: size }, (_, i) => ({ ...current, id: 'c' + i, value: i })) }, current,
      { comparisonLabels: [], assess: () => ({ status: 'eligible' }), project: entry => ({ label: entry.id, priority: 1, cells: [] }) }, { maxVisited: 256, maxReturned: 256 });
    const built = buildClarification(missing, next, template(), [choice('x', [], { candidates: { current, result } })]);
    assert.equal(built.status, size === 255 ? 'prompt' : 'failed');
    if (size === 256) assert.deepEqual(built, { status: 'failed', reason: 'INVALID_PROMPT' });
  }
});


test('字段ID与领域key不同，映射只能产生显式用户表达', () => {
  const prepared = prompt(buildClarification(missing, next, template(), [field('x', { field: { kind: 'string', id: 'answer', label: 'Answer', required: true } })]));
  const p = makePrompt(prepared.prompt, 'intent', 1);
  assert.deepEqual(mapClarificationResponse(prepared, p, event({ ...envelope(p), action: 'submit', values: { answer: 'v' } })),
    { status: 'values', action: 'submit', values: [{ key: 'x', origin: 'user', value: 'v' }] });
  assert.equal(mapClarificationResponse(prepared, p, event({ ...envelope(p), action: 'submit', values: { x: 'v' } })).status, 'failed');
});

test('多选已确认值只在当前候选全部合法时跳过，旧ID及重复选择不能跳过', () => {
  type V = readonly string[];
  const binding: ClarificationField<'x', V> = { field: { kind: 'multi-choice', id: 'x', label: 'X', required: true, options: [], completeness: 'incomplete' },
    evidenceKey: 'x', applicable: 'yes', confirmation: 'user', projectPrefill: observation => ({ value: observation.value, source: 'selection' }), candidates: { current, result: candidates(['a', 'b']) } };
  for (const value of [['a', 'b'], ['a', 'old'], ['a', 'a'], []] as const) {
    const evidence = resolveEvidence<'x', V>(req, [{ key: 'x', state: 'known', origin: 'user', value, source }], context, { equal: (_key, a, b) => a === b }, 32);
    const prepared = buildClarification(evidence, next, template(), [binding]);
    if (value.length === 2 && value[1] === 'b') assert.deepEqual(prepared, { status: 'unresolved', reason: 'NO_FIELDS' });
    else assert.equal(prompt(prepared).prompt.fields[0]?.prefill, undefined);
  }
});
