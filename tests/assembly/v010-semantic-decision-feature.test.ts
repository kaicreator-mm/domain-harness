/**
 * DomainHarness v0.10 T02 — selected Standard SemanticDecision focused P/N.
 * No fake Kernel Effect authority or physical Host qualification is claimed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildV10App } from '../../tooling/build/dist/index.js';
import { activateV10App } from '../../packages/microkernel/src/internal/activation.js';
import { basicComposition, featureEntry, PlainCasDocStore } from './helpers-v010.js';

// Memoized loader (no top-level await: tests load as CJS through tsx).
type ResolveSemanticDecision = (input: Record<string, any>, ports?: Record<string, any>) => Promise<any>;
let selectedFeature: Promise<{ source: string; resolve: ResolveSemanticDecision }> | undefined;
const loadSelectedFeature = (): Promise<{ source: string; resolve: ResolveSemanticDecision }> =>
  (selectedFeature ??= (async () => {
    const source = await readFile(
      new URL('../../domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs', import.meta.url),
      'utf8',
    );
    const feature = await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64')) as {
      resolveSemanticDecision: ResolveSemanticDecision;
    };
    return { source, resolve: feature.resolveSemanticDecision };
  })());
const schema = { id: 'schema:quote', revision: 'r1', provenanceKey: 'approved:2026-10' };
const basis = { amount: 12, name: 'quote' };
const request = (extra: Record<string, unknown> = {}) => ({
  input: basis, schema, limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 },
  ...extra,
});
const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

test('T02-P0: real T00 BUILD selects optional S feature; Tiny omits it without loading', async () => {
  const { source } = await loadSelectedFeature();
  const selected = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs',
    moduleSourceOverride: source,
    featureExport: 'resolveSemanticDecision',
  });
  const rich = buildV10App(await basicComposition({ features: [selected] }));
  const activated = await activateV10App(rich, { store: new PlainCasDocStore(), now: () => 0 });
  assert.deepEqual(activated.facade.selectedFeatures.map((v) => v.featureKey), ['standard:semantic-decision/1']);
  const live = await activated.facade.invokeSelectedStandardFeature(
    'standard:semantic-decision/1',
    request({ rules: [{ id: 'via-facade', when: { amount: 12 }, decision: { disposition: 'approved' } }] }),
  ) as { kind: string; source: string; decision: { disposition: string } };
  assert.equal(live.kind, 'selected');
  assert.equal(live.source, 'rule');
  assert.equal(live.decision.disposition, 'approved');
  activated.dispose();

  const tiny = buildV10App(await basicComposition());
  const tinyActivated = await activateV10App(tiny, { store: new PlainCasDocStore(), now: () => 0 });
  assert.deepEqual(tinyActivated.facade.selectedFeatures, []);
  await assert.rejects(
    tinyActivated.facade.invokeSelectedStandardFeature('standard:semantic-decision/1', request()),
    code('V10_FEATURE_NOT_SELECTED'),
  );
  tinyActivated.dispose();
});

test('T02-P1: Rule priority avoids Model and external Tool', async () => {
  const { resolve } = await loadSelectedFeature();
  let called = 0;
  const value = await resolve(request({
    rules: [
      { id: 'first-miss', when: { missing: true }, decision: { disposition: 'wrong' } },
      { id: 'quote-rule', when: { amount: 12 }, decision: { disposition: 'approve' } },
    ],
    fallback: { kind: 'model', operationId: 'declared:model' },
  }), { model: async () => { called++; return { disposition: 'fallback' }; } });
  assert.equal(value.kind, 'selected');
  assert.equal(value.source, 'rule');
  assert.equal(value.decision.disposition, 'approve');
  assert.equal(value.evidence.modelCalls, 0);
  assert.equal(called, 0);
  assert.equal(value.evidence.kernelEffectPermit, false);
});

test('T02-P2/N1: canonical key-order reuse only under exact schema/provenance/revision', async () => {
  const { resolve } = await loadSelectedFeature();
  const entry = { schemaId: 'schema:quote', schemaRevision: 'r1', provenanceKey: 'approved:2026-10',
    canonicalInput: '{"amount":12,"name":"quote"}', decision: { disposition: 'cached' } };
  assert.equal((await resolve(request({ reuse: entry }))).source, 'reuse');
  for (const mismatch of [
    { schemaRevision: 'r2' }, { provenanceKey: 'unapproved' }, { canonicalInput: '{"amount":13}' },
  ]) {
    const result = await resolve(request({ reuse: { ...entry, ...mismatch } }));
    assert.equal(result.kind, 'unavailable');
    assert.equal(result.reason, 'no-declared-fallback');
    assert.equal(result.evidence.modelCalls, 0);
  }
});

test('T02-P3/N2: promoted pinned procedure only; unpinned procedure is not invoked', async () => {
  const { resolve } = await loadSelectedFeature();
  let calls = 0;
  const procedures = new Map([['exact', { revision: 'approved:r7', resolve: async (_: unknown) => {
    calls++;
    return { disposition: 'procedure' };
  } }]]);
  const good = await resolve(request({ procedure: { id: 'exact', revision: 'approved:r7' } }), { procedures });
  assert.equal(good.source, 'procedure');
  assert.equal(calls, 1);
  const bad = await resolve(request({ procedure: { id: 'exact', revision: 'wrong' } }), { procedures });
  assert.equal(bad.kind, 'unavailable');
  assert.equal(calls, 1);
});

test('T02-P4/N3: bounded Model/Tool fallback counts real calls and supports no-model', async () => {
  const { resolve } = await loadSelectedFeature();
  let modelCalls = 0;
  const withModel = await resolve(request({
    fallback: { kind: 'model', operationId: 'model:quote' },
  }), { model: async () => { modelCalls++; return { disposition: 'review' }; } });
  assert.equal(withModel.source, 'model');
  assert.equal(withModel.evidence.modelCalls, 1);
  assert.equal(withModel.evidence.modelCallEvidence, 'measured');
  assert.equal(modelCalls, 1);
  const noModel = await resolve(request({
    fallback: { kind: 'model', operationId: 'model:quote' },
  }));
  assert.equal(noModel.kind, 'unavailable');
  assert.equal(noModel.reason, 'model-unavailable');
  assert.equal(noModel.evidence.modelCalls, 0);
  assert.equal(noModel.evidence.modelCallEvidence, 'unmeasured');

  let toolCalls = 0;
  const tool = await resolve(request({ fallback: { kind: 'tool', operationId: 'tool:preview' } }),
    { tool: async () => { toolCalls++; return { disposition: 'tool-result' }; } });
  assert.equal(tool.source, 'tool');
  assert.equal(toolCalls, 1);
  assert.equal(tool.evidence.toolCalls, 1);
  assert.equal(tool.evidence.modelCalls, 0);
});

test('T02-N4: budget/deadline limits are fail-closed with zero fallback calls', async () => {
  const { resolve } = await loadSelectedFeature();
  let calls = 0;
  const bounded = await resolve(request({
    rules: [{ id: 'miss', when: { amount: 99 }, decision: { disposition: 'wrong' } }],
    limits: { maxSteps: 1, maxModelCalls: 1, maxToolCalls: 1 },
    fallback: { kind: 'model', operationId: 'model:x' },
  }), { model: async () => { calls++; return { disposition: 'bad' }; } });
  assert.equal(bounded.kind, 'unavailable');
  assert.equal(bounded.reason, 'budget-exhausted');
  assert.equal(calls, 0);
  const timed = await resolve(request({
    limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1, deadlineEpochMs: 10 },
    fallback: { kind: 'model', operationId: 'model:x' },
  }), { now: () => 11, model: async () => { calls++; return {}; } });
  assert.equal(timed.kind, 'unavailable');
  assert.equal(calls, 0);
  await assert.rejects(() => resolve(request({
    limits: { maxSteps: Number.MAX_SAFE_INTEGER, maxModelCalls: 1, maxToolCalls: 1 },
  })), code('SEMANTIC_BUDGET_INVALID'));
});

test('T02-N5: semantic proposals cannot mint K/effect authority', async () => {
  const { resolve } = await loadSelectedFeature();
  await assert.rejects(() => resolve(request({
    rules: [{ id: 'evil', when: {}, decision: { effectPermit: { action: 'reserve' } } }],
  })), code('SEMANTIC_AUTHORITY_FORBIDDEN'));
  await assert.rejects(() => resolve(request({
    fallback: { kind: 'tool', operationId: 'tool:untrusted' },
  }), { tool: async () => ({ nested: { effectIntents: [{ effectType: 'reserve' }] } }) }),
  code('SEMANTIC_AUTHORITY_FORBIDDEN'));
});

// Every timeout case below keeps an OUTER watchdog so a regression back to
// unbounded waiting fails the suite instead of hanging CI forever.
const hungLimits = () => ({
  maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1, deadlineEpochMs: Date.now() + 25,
});

test('T02-P5/N6: hanging Model settles deadline-exceeded, call counts stay honest', { timeout: 5000 }, async () => {
  const { resolve } = await loadSelectedFeature();
  const result = await resolve(request({
    limits: hungLimits(),
    fallback: { kind: 'model', operationId: 'model:hang' },
  }), { model: () => new Promise(() => {}) });
  assert.equal(result.kind, 'unavailable');
  assert.equal(result.reason, 'deadline-exceeded');
  // The call DID start; racing a timer is not a claim it did not execute.
  assert.equal(result.evidence.modelCalls, 1);
  assert.equal(result.evidence.modelCallEvidence, 'measured');
  assert.deepEqual(result.evidence.timedOutCalls,
    [{ kind: 'model', operationId: 'model:hang', cancellation: 'unsupported' }]);
  assert.equal(result.evidence.kernelEffectPermit, false);
});

test('T02-P6/N7: hanging pinned Procedure settles deadline-exceeded', { timeout: 5000 }, async () => {
  const { resolve } = await loadSelectedFeature();
  let started = 0;
  const procedures = new Map([['hang', { revision: 'approved:r1', resolve: (): Promise<never> => {
    started++;
    return new Promise(() => {});
  } }]]);
  const result = await resolve(request({
    limits: hungLimits(),
    procedure: { id: 'hang', revision: 'approved:r1' },
  }), { procedures });
  assert.equal(result.kind, 'unavailable');
  assert.equal(result.reason, 'deadline-exceeded');
  assert.equal(started, 1);
  assert.equal(result.evidence.modelCalls, 0);
  assert.deepEqual(result.evidence.timedOutCalls,
    [{ kind: 'procedure', operationId: 'hang', cancellation: 'unsupported' }]);
});

test('T02-N8: already-expired deadline never starts the fallback call', { timeout: 5000 }, async () => {
  const { resolve } = await loadSelectedFeature();
  let calls = 0;
  const result = await resolve(request({
    limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1, deadlineEpochMs: 10 },
    fallback: { kind: 'model', operationId: 'model:x' },
  }), { now: () => 11, model: async () => { calls++; return {}; } });
  assert.equal(result.kind, 'unavailable');
  assert.equal(result.reason, 'deadline-exceeded');
  assert.equal(calls, 0);
  assert.equal(result.evidence.modelCalls, 0);
  assert.deepEqual(result.evidence.timedOutCalls, []);
});

test('T02-P7/N9: late Model output cannot override the deadline settlement', { timeout: 5000 }, async () => {
  const { resolve } = await loadSelectedFeature();
  const result = await resolve(request({
    limits: hungLimits(),
    fallback: { kind: 'model', operationId: 'model:late' },
  }), { model: () => new Promise((done) => {
    // Resolves well after the deadline carrying forbidden authority: if the
    // late value were ever adopted the resolver would throw or mint authority.
    setTimeout(() => done({ disposition: 'late', effectPermit: { action: 'reserve' } }), 120);
  }) });
  assert.equal(result.kind, 'unavailable');
  assert.equal(result.reason, 'deadline-exceeded');
  await new Promise((done) => setTimeout(done, 160));
  assert.equal(result.kind, 'unavailable');
  assert.equal(result.reason, 'deadline-exceeded');
  assert.equal(result.evidence.kernelEffectPermit, false);
});

test('T02-P8/N10: trusted timeout signal is passed and aborted; unsupported stays honest', { timeout: 5000 }, async () => {
  const { resolve } = await loadSelectedFeature();
  const aborted: string[] = [];
  const seenSignals: unknown[] = [];
  const result = await resolve(request({
    limits: hungLimits(),
    fallback: { kind: 'tool', operationId: 'tool:hang' },
  }), {
    tool: (payload: { signal?: unknown }) => { seenSignals.push(payload.signal); return new Promise(() => {}); },
    createTimeoutSignal: () => ({
      signal: { marker: 'trusted-cancellation' },
      abort: (reason: string) => { aborted.push(reason); },
    }),
  });
  assert.equal(result.reason, 'deadline-exceeded');
  assert.deepEqual(seenSignals, [{ marker: 'trusted-cancellation' }]);
  assert.deepEqual(aborted, ['deadline-exceeded']);
  assert.deepEqual(result.evidence.timedOutCalls,
    [{ kind: 'tool', operationId: 'tool:hang', cancellation: 'requested' }]);
});
