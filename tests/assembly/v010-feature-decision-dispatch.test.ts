/**
 * DomainHarness v0.10 #1267 — BUILD-bound decision S Features dispatched by
 * the S Primary inside the K turn. Focused P/N over the REAL selected payload
 * bytes and the REAL kernel admission path. No physical-host qualification is
 * claimed; the in-memory CAS store is honestly in-process.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildV10App,
  activateV10App,
  V10_TARGET_PROFILE,
  V10_DECISION_FEATURE_KEYS,
  V10BuildError,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { ActivateV10AppOptions, V10ModuleInput, V10RouteRowInput, BuildV10AppOptions } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { featureEntry, PlainCasDocStore, sha256HexSource, AUDIENCE } from './helpers-v010.js';

const SEMANTIC_KEY = 'standard:semantic-decision/1';
const FD_INTENT = 'submitFeatureDecision';
const FD_REVIEW_INTENT = 'submitFeatureReview';
const PLAIN_INTENT = 'submitPlainDecision';
const LEDGER_ROUTE = { operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' };

type ResolveSemanticDecision = (request: Record<string, any>, deps?: Record<string, any>) => Promise<any>;
interface SdkPayload {
  createFeatureDecisionDispatcher: (wiring: unknown) => { interpret: (d: unknown, i: unknown, c: unknown, ctl: unknown) => Promise<Record<string, unknown>> };
  DECISION_FEATURE_KEYS: readonly string[];
  interpret: (d: unknown, i: unknown, c?: unknown) => Record<string, unknown>;
}

let t02Promise: Promise<{ source: string; entry: V10ModuleInput; resolve: ResolveSemanticDecision }> | undefined;
const loadT02 = (): Promise<{ source: string; entry: V10ModuleInput; resolve: ResolveSemanticDecision }> =>
  (t02Promise ??= (async () => {
    const source = await readFile(
      new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/sfeature-semantic-decision-v1.mjs', import.meta.url),
      'utf8',
    );
    return {
      source,
      entry: await featureEntry({ fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: source, featureExport: 'resolveSemanticDecision' }),
      resolve: ((await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64')) as { resolveSemanticDecision: ResolveSemanticDecision }).resolveSemanticDecision),
    };
  })());

let sdkPromise: Promise<SdkPayload> | undefined;
const loadSdk = (): Promise<SdkPayload> =>
  (sdkPromise ??= (async () => {
    const source = await readFile(
      new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url),
      'utf8',
    );
    return await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64')) as SdkPayload;
  })());

const readFixture = (name: string): Promise<string> =>
  readFile(new URL(`./fixtures-v010/${name}`, import.meta.url), 'utf8');

/** The kernel + standard core of the assembly helpers, with the #1267 business. */
async function fdComposition(options: {
  featureModule: V10ModuleInput;
  routes: readonly V10RouteRowInput[];
  omitFeature?: boolean;
  buildId?: string;
}): Promise<BuildV10AppOptions> {
  const [kernel, sdk, router, business, capability] = await Promise.all([
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url), 'utf8'),
    readFixture('business-feature-decision-v1.mjs'),
    readFile(new URL('../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  const routerBody = router.replace(/^export /gm, '');
  const standard = `${sdk}
// v0.10 #1267 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
  const omitFeature = options.omitFeature === true;
  return {
    appId: 'app:v010-1267',
    audience: AUDIENCE,
    targetProfile: V10_TARGET_PROFILE,
    modules: [
      {
        packageId: 'v08-kernel-mechanism@1.0.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
        moduleSource: kernel, moduleSha256: sha256HexSource(kernel),
        endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
      },
      {
        packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
        moduleSource: standard, moduleSha256: sha256HexSource(standard),
        endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
      },
      {
        packageId: 'business-feature-decision@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
        moduleSource: business, moduleSha256: sha256HexSource(business),
        endpoint: 'business-policy', dependencies: [],
        provides: ['business:policy/1', `intent:${FD_INTENT}`, `intent:${FD_REVIEW_INTENT}`, `intent:${PLAIN_INTENT}`], requires: [],
      },
      {
        packageId: 'capability-quote-tools@v08.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
        moduleSource: capability, moduleSha256: sha256HexSource(capability),
        endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:ledger/1'], requires: [],
        capabilityId: 'ledger',
        handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
      },
      ...(omitFeature ? [] : [options.featureModule]),
    ],
    routes: options.routes.map((row) => omitFeature
      ? { intentId: row.intentId, operationId: row.operationId, capabilityId: row.capabilityId, handlerId: row.handlerId }
      : row),
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: options.buildId ?? 'v010-1267',
  };
}

const boundRoute: V10RouteRowInput = { intentId: FD_INTENT, ...LEDGER_ROUTE, featureKey: SEMANTIC_KEY };
const boundReviewRoute: V10RouteRowInput = { intentId: FD_REVIEW_INTENT, ...LEDGER_ROUTE, featureKey: SEMANTIC_KEY };
const plainRoute: V10RouteRowInput = { intentId: PLAIN_INTENT, ...LEDGER_ROUTE };

interface Harness {
  facade: Awaited<ReturnType<typeof activateV10App>>['facade'];
  store: PlainCasDocStore;
  dispose(): void;
}

async function activate(options: BuildV10AppOptions, deps: Partial<ActivateV10AppOptions> = {}): Promise<Harness> {
  const store = new PlainCasDocStore();
  const activated = await activateV10App(buildV10App(options), { store, now: () => 0, ...deps });
  return { facade: activated.facade, store, dispose: () => activated.dispose() };
}

const send = (facade: Harness['facade'], suffix: string, input: Record<string, unknown>, intentType = FD_INTENT, messageId = `msg:${suffix}`) =>
  facade.send({ intentType, instanceKey: `instance:${suffix}`, messageId, input });

const journalCount = (store: PlainCasDocStore): number =>
  [...store.keys()].filter((key) => key.includes('effect-journal')).length;

const errorCode = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const FEATURE_DISPATCH = { dispatch: 's-primary-feature', featureKey: SEMANTIC_KEY };

// ===========================================================================
// P — the bound decision paths admit exactly the mapped event and cite the
// feature dispatch in the receipt resolver evidence.
// ===========================================================================

test('1267-P1: rule path admits exactly the mapped event; receipt cites source + feature key', async () => {
  const t02 = await loadT02();
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }));
  const receipt = await send(app.facade, 'p1', { amount: 30, requestId: 'R-p1' }) as {
    status: string;
    admitted: { transitionKey: string; targetState: string; effects: unknown[]; resolver: Record<string, unknown> };
  };
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.transitionKey, 'approve');
  assert.equal(receipt.admitted.targetState, 'approved');
  assert.equal(receipt.admitted.effects.length, 1);
  assert.deepEqual(receipt.admitted.resolver, {
    source: 'rule',
    llmAvoided: true,
    modelCallEvidence: { status: 'unmeasured' },
    cacheRead: 'disabled',
    telemetryEventCount: 0,
    featureDispatch: FEATURE_DISPATCH,
  });
  assert.equal(journalCount(app.store), 1);
  app.dispose();
});

test('1267-P2: exact-reuse path maps its outcome to its OWN declared event', async () => {
  const t02 = await loadT02();
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }));
  const receipt = await send(app.facade, 'p2', { amount: 12, requestId: 'R-reuse' }, FD_REVIEW_INTENT) as {
    status: string;
    admitted: { transitionKey: string; targetState: string; resolver: Record<string, unknown> };
  };
  assert.equal(receipt.status, 'admitted');
  // The 'review' outcome maps to QUOTE_REVIEWED — a DIFFERENT admitted event
  // than the rule path's QUOTE_DECIDED, observably landing in 'escalated'.
  assert.equal(receipt.admitted.transitionKey, 'escalate');
  assert.equal(receipt.admitted.targetState, 'escalated');
  assert.equal(receipt.admitted.resolver.source, 'reuse');
  assert.equal(receipt.admitted.resolver.cacheRead, 'hit');
  assert.deepEqual(receipt.admitted.resolver.featureDispatch, FEATURE_DISPATCH);
  assert.equal(journalCount(app.store), 0, 'the escalate transition carries no effect');
  app.dispose();
});

test('1267-P3: pinned procedure path through Host-wired deps', async () => {
  const t02 = await loadT02();
  let procedureCalls = 0;
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }), {
    decisionDependencies: {
      procedures: new Map([['fd-proc', {
        revision: 'approved:r1',
        resolve: async () => {
          procedureCalls += 1;
          return { disposition: 'approved' };
        },
      }]]),
    },
  });
  const receipt = await send(app.facade, 'p3', { amount: 31, requestId: 'R-p3' }) as {
    status: string;
    admitted: { targetState: string; resolver: Record<string, unknown> };
  };
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.targetState, 'approved');
  assert.equal(receipt.admitted.resolver.source, 'procedure');
  assert.equal(procedureCalls, 1);
  assert.deepEqual(receipt.admitted.resolver.featureDispatch, FEATURE_DISPATCH);
  app.dispose();
});

test('1267-P4: model fallback with Host-wired deps admits with measured model calls; the feature sees no K port', async () => {
  const t02 = await loadT02();
  const modelPayloads: unknown[] = [];
  let modelCalls = 0;
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }), {
    decisionDependencies: {
      model: async (payload: unknown) => {
        modelCalls += 1;
        modelPayloads.push(structuredClone(payload));
        return { disposition: 'approved' };
      },
    },
  });
  const receipt = await send(app.facade, 'p4', { amount: 42, requestId: 'R-p4', injected: { rules: [], fallback: { kind: 'model', operationId: 'evil' } } }) as {
    status: string;
    admitted: { targetState: string; resolver: Record<string, unknown> };
  };
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.targetState, 'approved');
  assert.equal(receipt.admitted.resolver.source, 'model');
  assert.equal(receipt.admitted.resolver.llmAvoided, false);
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, {
    status: 'measured', count: 1, scope: 'v10-feature-dispatch-model-port',
  });
  assert.deepEqual(receipt.admitted.resolver.featureDispatch, FEATURE_DISPATCH);
  assert.equal(modelCalls, 1);
  // The feature request the model received: the projected declared input and
  // the DECLARED material only — caller-injected rules/fallback are gone and
  // no K port can ride the payload.
  const payload = modelPayloads[0] as Record<string, any>;
  assert.deepEqual(payload.input, { amount: 42, requestId: 'R-p4' });
  assert.equal(payload.operationId, 'model:fd-quote');
  assert.deepEqual(payload.schema, { id: 'schema:fd-quote', revision: 'r1', provenanceKey: 'approved:2026-10' });
  // [#1267 F2] The per-turn deadline computed from the sealed relative
  // timeoutMs overrides the feature request: T02's own budget logic races
  // the same absolute instant and stops its model call.
  assert.equal(payload.budget.maxSteps, 8);
  assert.ok(Number.isFinite(payload.budget.deadlineEpochMs) && payload.budget.deadlineEpochMs >= Date.now(),
    'the feature request carries the computed per-turn deadline');
  for (const forbidden of ['docs', 'store', 'cas', 'resources', 'hostPorts', 'permit', 'submitOccurrence', 'createOccurrenceRuntime']) {
    assert.equal(payload[forbidden], undefined, `no ${forbidden} port may reach the feature/model boundary`);
  }
  app.dispose();
});

test('1267-P5/N-BASE: unbound intents stay byte-identical — base-vs-head receipt equivalence', async () => {
  const t02 = await loadT02();
  // HEAD: the dispatcher-wired App (bound sibling intent + selected feature).
  const wired = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }));
  assert.equal(wired.facade.boundDecisionFeatureOf(FD_INTENT)?.featureKey, SEMANTIC_KEY);
  assert.equal(wired.facade.boundDecisionFeatureOf(PLAIN_INTENT), undefined);
  const headReceipt = await wired.facade.send({
    intentType: PLAIN_INTENT, instanceKey: 'instance:base', messageId: 'msg:base', input: { amount: 30, requestId: 'R-base' },
  }) as Record<string, unknown>;
  wired.dispose();

  // BASE: the same App with NO bound route and NO selected feature.
  const unwired = await activate(await fdComposition({
    featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute], omitFeature: true,
  }));
  const baseReceipt = await unwired.facade.send({
    intentType: PLAIN_INTENT, instanceKey: 'instance:base', messageId: 'msg:base', input: { amount: 30, requestId: 'R-base' },
  }) as Record<string, unknown>;
  unwired.dispose();

  // Byte-identical receipts (the clock is pinned), including the base resolver
  // shape with NO feature dispatch citation.
  assert.equal(JSON.stringify(baseReceipt), JSON.stringify(headReceipt));
  assert.equal(JSON.stringify((headReceipt.admitted as Record<string, unknown>).resolver),
    '{"source":"harness-machine","llmAvoided":true,"modelCallEvidence":{"status":"unsupported"},"cacheRead":"disabled","telemetryEventCount":0}');
  assert.ok(!JSON.stringify(headReceipt).includes('featureDispatch'));
});

test('1267-P6: guard denial on the bound path carries the resolver evidence on the denial', async () => {
  const t02 = await loadT02();
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }));
  const receipt = await send(app.facade, 'p6', { amount: 75, requestId: 'R-p6' }) as {
    status: string;
    denial: { reason: string; resolver: Record<string, unknown> };
  };
  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'guard');
  assert.equal(receipt.denial.resolver.source, 'rule');
  assert.deepEqual(receipt.denial.resolver.featureDispatch, FEATURE_DISPATCH);
  assert.equal(journalCount(app.store), 0);
  app.dispose();
});

// ===========================================================================
// N — fail-closed behavior: unavailable terminals, zero effects, no caller
// injection, honest replay, BUILD refusals.
// ===========================================================================

test('1267-N1: model fallback without Host deps terminates SEMANTIC_UNAVAILABLE with zero Journal/Effect', async () => {
  const t02 = await loadT02();
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }));
  const receipt = await send(app.facade, 'n1', { amount: 42, requestId: 'R-n1' }) as {
    status: string;
    terminal: { code: string };
    resolver: Record<string, unknown>;
  };
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'SEMANTIC_UNAVAILABLE');
  assert.equal(receipt.resolver.modelCallEvidence.status, 'unmeasured');
  assert.equal(receipt.resolver.llmAvoided, true);
  assert.deepEqual(receipt.resolver.featureDispatch, FEATURE_DISPATCH);
  assert.equal(journalCount(app.store), 0);
  app.dispose();
});

test('1267-N2: replay of an admitted model turn returns the original receipt with zero new feature/model calls', async () => {
  const t02 = await loadT02();
  let modelCalls = 0;
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }), {
    decisionDependencies: { model: async () => { modelCalls += 1; return { disposition: 'approved' }; } },
  });
  const first = await send(app.facade, 'n2', { amount: 42, requestId: 'R-n2' }, FD_INTENT, 'msg:n2-once');
  const second = await send(app.facade, 'n2', { amount: 42, requestId: 'R-n2' }, FD_INTENT, 'msg:n2-once');
  assert.equal(first.status, 'admitted');
  assert.equal(second.status, 'admitted');
  assert.equal(second.idempotentReplay, true, 'the second send is the Kernel original-receipt replay');
  assert.equal((second.admitted as Record<string, unknown>).durableControlTurnId,
    (first.admitted as Record<string, unknown>).durableControlTurnId);
  assert.deepEqual((second.admitted as Record<string, unknown>).resolver,
    (first.admitted as Record<string, unknown>).resolver, 'the replay carries the ORIGINAL resolver evidence');
  assert.equal(modelCalls, 1, 'the replay performs ZERO new model calls');
  assert.equal(journalCount(app.store), 1, 'the replay performs ZERO new effects');
  app.dispose();
});

test('1267-N3: hostile feature results are never admitted as given', async () => {
  const forgedSource = await readFixture('sfeature-forged-decision-v1.mjs');
  const forged = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: forgedSource,
    featureExport: 'resolveSemanticDecision',
  });
  const cases: readonly [string, 'unavailable' | 'admitted', string][] = [
    ['permit-in-decision', 'unavailable', 'no authority field inside a decision may be admitted'],
    ['top-level-permit', 'unavailable', 'no authority field at the result top level may be admitted'],
    ['status-claim', 'admitted', 'forged K claims are ignored; only the mapped event through the real gates counts'],
    ['feature-throws', 'unavailable', 'a throwing selected feature is a refused dispatch'],
    ['unmapped-outcome', 'unavailable', 'an outcome with no declared event is unavailable'],
    ['bad-count-claim', 'unavailable', 'a malformed measured claim is never carried nor admitted'],
  ];
  for (const [directive, expected, why] of cases) {
    const app = await activate(await fdComposition({ featureModule: forged, routes: [boundRoute, boundReviewRoute, plainRoute] }));
    (globalThis as Record<string, unknown>).__forgedDirective = directive;
    try {
      const receipt = await send(app.facade, 'n3', { amount: 30, requestId: `R-${directive}` }) as Record<string, any>;
      if (expected === 'unavailable') {
        assert.equal(receipt.status, 'terminated', `${directive}: ${why}`);
        assert.equal(receipt.terminal.code, 'SEMANTIC_UNAVAILABLE');
        assert.deepEqual(receipt.resolver.featureDispatch, FEATURE_DISPATCH);
        assert.equal(journalCount(app.store), 0, `${directive}: zero effects`);
      } else {
        assert.equal(receipt.status, 'admitted', `${directive}: ${why}`);
        assert.equal(receipt.admitted.transitionKey, 'approve');
        assert.equal(receipt.admitted.resolver.source, 'rule');
        assert.equal(JSON.stringify(receipt).includes('FORGED'), false, 'no forged terminal claim may surface');
      }
    } finally {
      delete (globalThis as Record<string, unknown>).__forgedDirective;
      app.dispose();
    }
  }
});

test('1267-N4: the K turn refuses feature results carrying throwing getters or hostile Proxy traps without inspecting them', async () => {
  const forgedSource = await readFixture('sfeature-forged-decision-v1.mjs');
  const forged = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: forgedSource,
    featureExport: 'resolveSemanticDecision',
  });
  for (const directive of ['accessor-decision', 'hostile-proxy']) {
    const app = await activate(await fdComposition({ featureModule: forged, routes: [boundRoute, boundReviewRoute, plainRoute] }));
    (globalThis as Record<string, unknown>).__forgedDirective = directive;
    try {
      const receipt = await send(app.facade, 'n4', { amount: 30, requestId: `R-${directive}` }) as Record<string, any>;
      assert.equal(receipt.status, 'terminated');
      assert.equal(receipt.terminal.code, 'SEMANTIC_UNAVAILABLE');
      assert.equal(journalCount(app.store), 0);
    } finally {
      delete (globalThis as Record<string, unknown>).__forgedDirective;
      app.dispose();
    }
  }
  assert.deepEqual((globalThis as { __forgedGetterCalls?: string[] }).__forgedGetterCalls ?? [], [],
    'a throwing getter must never be invoked');
  assert.deepEqual((globalThis as { __forgedProxyGetCalls?: string[] }).__forgedProxyGetCalls ?? [], [],
    'a hostile Proxy get trap must never fire');
});

test('1267-N5: a public caller cannot inject model deps or decision material through intent input', async () => {
  const t02 = await loadT02();
  let modelCalls = 0;
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }), {
    decisionDependencies: { model: async () => { modelCalls += 1; return { disposition: 'declined' }; } },
  });
  // The caller input carries dependency-shaped and material-shaped fields;
  // the exact input selection projects them away and the DECLARED rule wins.
  const receipt = await send(app.facade, 'n5', {
    amount: 30, requestId: 'R-n5',
    model: { injected: 'not-a-port' },
    procedures: { fd: 'not-a-registry' },
    rules: [{ id: 'forged', when: {}, decision: { disposition: 'declined' } }],
    fallback: { kind: 'model', operationId: 'caller:evil' },
  }) as Record<string, any>;
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.targetState, 'approved', 'the DECLARED rule decided, not caller material');
  assert.equal(receipt.admitted.resolver.source, 'rule');
  assert.equal(modelCalls, 0, 'the caller cannot invoke or replace the model boundary');
  app.dispose();
});

test('1267-N6: BUILD rejects unknown, non-decision-capable and unselected featureKey bindings (typed)', async () => {
  const t02 = await loadT02();
  const notCapable: V10RouteRowInput = { intentId: FD_INTENT, ...LEDGER_ROUTE, featureKey: 'standard:unknown-feature/1' };
  const notCapableApp = await fdComposition({ featureModule: t02.entry, routes: [notCapable, plainRoute] });
  assert.throws(
    () => buildV10App(notCapableApp),
    (error: unknown) => error instanceof V10BuildError && error.code === 'V10_ROUTE_INVALID'
      && /not a decision-capable Standard feature/.test(error.message),
  );
  // Decision-capable but NOT selected in this composition: the route keeps
  // its BUILD-bound featureKey while the feature module is absent.
  const unselected: V10RouteRowInput = { intentId: FD_INTENT, ...LEDGER_ROUTE, featureKey: SEMANTIC_KEY };
  const composed = await fdComposition({ featureModule: t02.entry, routes: [unselected, plainRoute] });
  assert.throws(
    () => buildV10App({ ...composed, modules: composed.modules.filter((module) => module.role !== 'standard-feature') }),
    (error: unknown) => error instanceof V10BuildError && error.code === 'V10_ROUTE_INVALID'
      && /not selected in this composition/.test(error.message),
  );
  // An unknown route-row field still refuses (strict-fields boundary).
  const unknownFieldApp = await fdComposition({
    featureModule: t02.entry,
    routes: [{ intentId: FD_INTENT, ...LEDGER_ROUTE, featureKey: SEMANTIC_KEY, extra: 1 } as V10RouteRowInput],
  });
  assert.throws(
    () => buildV10App(unknownFieldApp),
    (error: unknown) => error instanceof V10BuildError && error.code === 'BUILD_GRAPH_INVALID',
  );
});

test('1267-N7: malformed policy material for a bound route fails the K turn typed, before any admission', async () => {
  const t02 = await loadT02();
  // Strip the featureDecisions material: the sealed business bytes are
  // replaced by a variant whose policy carries no material for the intent.
  const business = await readFixture('business-feature-decision-v1.mjs');
  const stripped = business.replace(/const FEATURE_DECISIONS = \{[\s\S]*?\n\};/, 'const FEATURE_DECISIONS = {};');
  assert.notEqual(stripped, business, 'the fixture variant must actually drop the material');
  const app = await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] });
  const businessEntry = app.modules.find((module) => module.role === 'business') as V10ModuleInput & { moduleSource: string };
  businessEntry.moduleSource = stripped;
  businessEntry.moduleSha256 = sha256HexSource(stripped);
  // The dispatch wiring is validated when the business runtime is composed —
  // lazily at the first K turn — and refuses typed BEFORE any admission.
  const store = new PlainCasDocStore();
  const activated = await activateV10App(buildV10App(app), { store, now: () => 0 });
  await assert.rejects(
    activated.facade.send({
      intentType: FD_INTENT, instanceKey: 'instance:n7', messageId: 'msg:n7', input: { amount: 30, requestId: 'R-n7' },
    }),
    errorCode('V10_BUSINESS_POLICY_INVALID'),
  );
  activated.dispose();
});

// ===========================================================================
// Parity + dispatcher-factory isolation regressions (hostile values at the
// factory level, with their own watchdogs).
// ===========================================================================

test('1267-PARITY: the compiler closed set mirrors the S Primary dispatcher set byte-for-byte', async () => {
  const sdk = await loadSdk();
  assert.deepEqual([...sdk.DECISION_FEATURE_KEYS], [...V10_DECISION_FEATURE_KEYS]);
  assert.ok(Object.isFrozen(sdk.DECISION_FEATURE_KEYS));
  assert.ok(Object.isFrozen(V10_DECISION_FEATURE_KEYS));
});

interface DispatcherHarness {
  interpret: (declaration: unknown, input: unknown, context?: unknown) => Promise<Record<string, any>>;
}

/** One factory-built dispatcher bound to ONE stub feature at ONE digest. */
async function factoryDispatcher(feature: (request: unknown, deps: unknown) => unknown, deps: Record<string, unknown> = {}, digest = 'a'.repeat(64), extraRequest: Record<string, unknown> = {}): Promise<DispatcherHarness> {
  const sdk = await loadSdk();
  const dispatcher = sdk.createFeatureDecisionDispatcher({
    decisions: [{
      declarationDigest: digest,
      declarationId: 'rule:unit',
      featureKey: SEMANTIC_KEY,
      invoke: feature,
      featureRequest: {
        schema: { id: 'schema:u', revision: 'r1', provenanceKey: 'p' },
        rules: [],
        limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 },
        ...extraRequest,
      },
      outcomeField: 'disposition',
      outcomeEvents: { approved: 'EV_OK' },
      eventPayloadFromInput: { amount: 'amount' },
      allowedOutcomes: ['approved'],
      allowedEventTypes: ['EV_OK'],
      inputSelection: { amount: 'amount' },
      timeoutMs: 250,
    }],
    ...(Object.keys(deps).length === 0 ? {} : { deps }),
  });
  return {
    interpret: (declaration: unknown, input: unknown, context?: unknown) =>
      dispatcher.interpret(declaration, input, context ?? {}, undefined),
  };
}

const boundDeclaration = (digest: string) => ({ declarationDigest: digest, id: 'rule:unit', kind: 'semantic-decision' });

test('1267-F1: factory — throwing getter and hostile Proxy traps are refused without inspection', async () => {
  let getterCalls = 0;
  let proxyGetCalls = 0;
  const refusing = async () => {
    const decision = {};
    Object.defineProperty(decision, 'disposition', { enumerable: true, get() { getterCalls += 1; return 'approved'; } });
    return { kind: 'selected', source: 'rule', decision, evidence: { kernelEffectPermit: false, modelCallEvidence: 'unmeasured', modelCalls: 0 } };
  };
  const hostile = async () => ({
    kind: 'selected', source: 'rule',
    decision: new Proxy(Object.defineProperty({}, 'disposition', {
      enumerable: true,
      get() {
        proxyGetCalls += 1;
        return 'approved';
      },
    }), {
      get() {
        proxyGetCalls += 1;
        return 'approved';
      },
    }),
    evidence: { kernelEffectPermit: false, modelCallEvidence: 'unmeasured', modelCalls: 0 },
  });
  for (const [feature, expected] of [[refusing, () => getterCalls], [hostile, () => proxyGetCalls]] as const) {
    const harness = await factoryDispatcher(feature);
    const result = await harness.interpret(boundDeclaration('a'.repeat(64)), { amount: 1 });
    assert.equal(result.semanticStatus, 'unavailable');
    assert.equal(result.unavailable.reason, 'feature-result-invalid');
    assert.deepEqual(result.featureDispatch, { dispatch: 's-primary-feature', featureKey: SEMANTIC_KEY });
    assert.equal(expected(), 0, 'descriptor-only inspection must never invoke the hostile accessor/trap');
  }
});

test('1267-F2: factory — the feature promise is adopted; the settled value is still snapshotted and the wait is bounded', { timeout: 8000 }, async () => {
  // [#1267 F4 wording] The feature's promise IS adopted — its `then` runs
  // (it is the selected Standard feature export, trusted Standard code).
  // The guarantees are: (a) the settled VALUE is consumed only through the
  // descriptor-safe snapshot + authority scan; (b) the wait is bounded by
  // the mandatory per-turn timeoutMs. A feature export returning a FUNCTION
  // (not a thenable) is a contract violation, refused before the value is
  // ever consumed.
  const harness = await factoryDispatcher(async () => async () => 'unused');
  const refused = await harness.interpret(boundDeclaration('a'.repeat(64)), { amount: 1 });
  assert.equal(refused.semanticStatus, 'unavailable');
  assert.equal(refused.unavailable.reason, 'feature-result-invalid');

  // An adopted thenable that resolves hostile authority: the settled value
  // is still snapshotted — the authority scan refuses it without admission.
  const adoptedAuthority = await factoryDispatcher(async () => ({
    then: (resolve: (v: unknown) => void) => resolve({
      kind: 'selected', source: 'rule',
      decision: { disposition: 'approved', permit: { action: 'reserve' } },
      evidence: { modelCallEvidence: 'unmeasured', modelCalls: 0 },
    }),
  }));
  const refusedAuthority = await adoptedAuthority.interpret(boundDeclaration('a'.repeat(64)), { amount: 1 });
  assert.equal(refusedAuthority.semanticStatus, 'unavailable');
  assert.equal(refusedAuthority.unavailable.reason, 'feature-authority-refused');
  assert.equal(refusedAuthority.structuredDecision, undefined);

  // An adopted thenable that settles LATE (after the per-turn timeout): the
  // deadline wins, the late settlement is never adopted, nothing surfaces
  // as unhandledRejection.
  const adoptedLate = await factoryDispatcher(
    async () => ({
      then: (resolve: (v: unknown) => void) => {
        setTimeout(() => resolve({ kind: 'selected', source: 'rule', decision: { disposition: 'approved' }, evidence: { modelCallEvidence: 'unmeasured', modelCalls: 0 } }), 500);
      },
    }),
    {},
    'a'.repeat(64),
  );
  const started = Date.now();
  const timedOut = await adoptedLate.interpret(boundDeclaration('a'.repeat(64)), { amount: 1 });
  const elapsed = Date.now() - started;
  assert.equal(timedOut.semanticStatus, 'unavailable');
  assert.equal(timedOut.unavailable.reason, 'deadline-exceeded');
  assert.equal(timedOut.structuredDecision, undefined);
  assert.ok(elapsed < 250 + 2000, `the wait is bounded by timeoutMs (elapsed ${String(elapsed)}ms)`);
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(timedOut.semanticStatus, 'unavailable', 'the late adopted settlement is never re-read');
});

test('1267-F3: factory — a never-settling feature settles deadline-exceeded at the per-turn timeout; a late value is never adopted', { timeout: 8000 }, async () => {
  const sdk = await loadSdk();
  const started = Date.now();
  const expired = sdk.createFeatureDecisionDispatcher({
    decisions: [{
      declarationDigest: 'd'.repeat(64),
      declarationId: 'rule:expired',
      featureKey: SEMANTIC_KEY,
      invoke: () => new Promise((resolve) => {
        setTimeout(() => resolve({ kind: 'selected', source: 'rule', decision: { disposition: 'approved' }, evidence: { modelCallEvidence: 'unmeasured', modelCalls: 0 } }), 500);
      }),
      featureRequest: {
        schema: { id: 'schema:x', revision: 'r1', provenanceKey: 'p' },
        limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 },
      },
      outcomeField: 'disposition',
      outcomeEvents: { approved: 'EV_OK' },
      eventPayloadFromInput: {},
      allowedOutcomes: ['approved'],
      allowedEventTypes: ['EV_OK'],
      inputSelection: { amount: 'amount' },
      timeoutMs: 120,
    }],
    deps: { now: () => Date.now() },
  });
  const result = await expired.interpret(boundDeclaration('d'.repeat(64)), { amount: 1 }) as Record<string, any>;
  const elapsed = Date.now() - started;
  assert.equal(result.semanticStatus, 'unavailable');
  assert.equal(result.unavailable.reason, 'deadline-exceeded');
  assert.equal(result.structuredDecision, undefined, 'no decision exists for a refused dispatch');
  assert.ok(elapsed < 120 + 2000, `the per-turn timeout bounds the wait (elapsed ${String(elapsed)}ms)`);
  // The late settlement (500ms) must never be adopted and must not surface
  // as an unhandled rejection: wait past it and re-assert.
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(result.semanticStatus, 'unavailable');
});

test('1267-F4: factory — unbound declarations take the plain interpreter path byte-for-byte', async () => {
  const sdk = await loadSdk();
  let featureCalls = 0;
  const dispatcher = sdk.createFeatureDecisionDispatcher({
    decisions: [{
      declarationDigest: 'e'.repeat(64),
      declarationId: 'rule:bound',
      featureKey: SEMANTIC_KEY,
      invoke: async () => { featureCalls += 1; return { kind: 'selected', source: 'rule', decision: { disposition: 'approved' }, evidence: {} }; },
      featureRequest: { schema: { id: 'schema:y', revision: 'r1', provenanceKey: 'p' } },
      outcomeField: 'disposition',
      outcomeEvents: { approved: 'EV_OK' },
      eventPayloadFromInput: {},
      allowedOutcomes: ['approved'],
      allowedEventTypes: ['EV_OK'],
      inputSelection: { amount: 'amount' },
      timeoutMs: 250,
    }],
  });
  // A plain (non-semantic) declaration with no matching digest: routed to the
  // plain interpreter, which produces the plain rule result.
  const plain = await dispatcher.interpret(
    { ruleId: 'rule:plain', eventType: 'EV_OK', payloadFromInput: { amount: 'amount' } },
    { amount: 5 },
  ) as Record<string, any>;
  assert.equal(plain.kind, 'rule');
  assert.equal(JSON.stringify(plain.structuredDecision.event), '{"type":"EV_OK","payload":{"amount":5}}');
  assert.equal(featureCalls, 0);
  // The bound declaration dispatches to EXACTLY the selected feature.
  const bound = await dispatcher.interpret(boundDeclaration('e'.repeat(64)), { amount: 5 }) as Record<string, any>;
  assert.equal(featureCalls, 1);
  assert.equal(bound.source, 'rule');
  assert.equal(bound.structuredDecision.event.type, 'EV_OK');
});

test('1267-F5: factory — incoherent or forged wiring refuses typed at the trusted boundary', async () => {
  const sdk = await loadSdk();
  const goodEntry = {
    declarationDigest: 'f'.repeat(64),
    declarationId: 'rule:x',
    featureKey: SEMANTIC_KEY,
    invoke: async () => ({ kind: 'selected', source: 'rule', decision: { disposition: 'approved' }, evidence: {} }),
    featureRequest: { schema: { id: 's', revision: 'r', provenanceKey: 'p' } },
    outcomeField: 'disposition',
    outcomeEvents: { approved: 'EV_OK' },
    eventPayloadFromInput: {},
    allowedOutcomes: ['approved'],
    allowedEventTypes: ['EV_OK'],
    inputSelection: { amount: 'amount' },
    timeoutMs: 250,
  };
  const bad = (label: string, mutate: (entry: Record<string, unknown>) => Record<string, unknown>) =>
    ({ decisions: [mutate({ ...goodEntry })] });
  const cases: readonly [string, Record<string, unknown>][] = [
    ['unknown feature key', bad('k', (entry) => ({ ...entry, featureKey: 'standard:other/1' }))],
    ['duplicate digest', { decisions: [goodEntry, { ...goodEntry, declarationId: 'rule:y' }] }],
    ['outcome outside the declaration vocabulary', bad('v', (entry) => ({ ...entry, outcomeEvents: { declined: 'EV_OK' } }))],
    ['event type outside the declaration vocabulary', bad('e', (entry) => ({ ...entry, outcomeEvents: { approved: 'EV_OTHER' } }))],
    ['payload key outside the input selection', bad('p', (entry) => ({ ...entry, eventPayloadFromInput: { sku: 'sku' } }))],
    ['non-callable invoke', bad('i', (entry) => ({ ...entry, invoke: 'not-a-function' }))],
    ['missing timeoutMs', bad('t', (entry) => { const { timeoutMs: _dropped, ...rest } = entry; return rest; })],
    ['sub-ranging timeoutMs', bad('t0', (entry) => ({ ...entry, timeoutMs: 0 }))],
    ['oversize timeoutMs', bad('t1', (entry) => ({ ...entry, timeoutMs: 60_001 }))],
    ['fractional timeoutMs', bad('t2', (entry) => ({ ...entry, timeoutMs: 1.5 }))],
    ['unknown entry field', bad('u', (entry) => ({ ...entry, decisionFallback: 'x' }))],
    ['unbounded limits', bad('l', (entry) => ({ ...entry, featureRequest: { schema: { id: 's', revision: 'r', provenanceKey: 'p' }, limits: { maxSteps: 999 } } }))],
  ];
  for (const [label, wiring] of cases) {
    assert.throws(() => sdk.createFeatureDecisionDispatcher(wiring), (error: unknown) =>
      typeof error === 'object' && error !== null && (error as { code?: string }).code === 'SDK_DISPATCH_WIRING_INVALID', label);
  }
  // Unknown deps members refuse (no smuggled boundaries).
  assert.throws(() => sdk.createFeatureDecisionDispatcher({
    decisions: [goodEntry],
    deps: { docs: {} },
  }), (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'SDK_DISPATCH_WIRING_INVALID');
});

// ===========================================================================
// [#1267 Follow-up 2] F1 liveness (cancellation), F2 liveness (mandatory
// per-turn timeout), F3 own-property outcome lookup.
// ===========================================================================

interface MemoryDocsPort {
  docs: {
    get(key: string): Promise<{ value: unknown; revision: number } | null>;
    put(key: string, value: unknown, conditions?: Record<string, unknown>): Promise<{ revision: number }>;
    list(prefix: string): Promise<readonly string[]>;
  };
  effectCalls: unknown[];
}

function memoryDocs(): MemoryDocsPort {
  const documents = new Map<string, { value: unknown; revision: number }>();
  const effectCalls: unknown[] = [];
  const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
  return {
    docs: {
      async get(key) {
        const doc = documents.get(key);
        return doc === undefined ? null : { value: clone(doc.value), revision: doc.revision };
      },
      async put(key, value, conditions = {}) {
        if ((conditions as { mustBeAbsent?: boolean }).mustBeAbsent === true && documents.has(key)) {
          throw Object.assign(new Error(`host doc ${key} exists`), { code: 'HOST_KEY_EXISTS' });
        }
        const expected = (conditions as { mustMatchRevision?: number }).mustMatchRevision;
        if (expected !== undefined && documents.get(key)?.revision !== expected) {
          throw Object.assign(new Error(`host doc ${key} CAS conflict`), { code: 'HOST_CAS_CONFLICT' });
        }
        const revision = documents.get(key) === undefined ? 0 : (documents.get(key) as { revision: number }).revision + 1;
        documents.set(key, { value: clone(value), revision });
        return { revision };
      },
      async list(prefix) {
        return [...documents.keys()].filter((key) => key.startsWith(prefix)).sort();
      },
    },
    effectCalls,
  };
}

/** The real selected kernel payload, imported through the installer discipline. */
let kernelPromise: Promise<Record<string, any>> | undefined;
const loadKernel = (): Promise<Record<string, any>> =>
  (kernelPromise ??= (async () => {
    const source = await readFile(
      new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url),
      'utf8',
    );
    return await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64')) as Record<string, any>;
  })());

interface CancelRig {
  submit(input: Record<string, unknown>, messageId: string, control?: { signal: AbortSignal }): Promise<Record<string, any>>;
  journalBegins(): number;
  effectCount(): number;
}

/**
 * The KH2 cancellation rig: the REAL selected kernel + the REAL dispatcher
 * over the REAL T02 feature and the SAME sealed business material, entered
 * through `runtime.submitOccurrence(request, control)` — the same mechanism
 * the FR07-KH2 cancellation tests use (the facade's `send` carries no
 * control surface; it cannot express a mid-turn cancellation).
 */
async function cancelRig(model: (payload: unknown) => Promise<unknown>): Promise<CancelRig> {
  const [kernel, sdk, t02, businessModule] = await Promise.all([
    loadKernel(),
    loadSdk(),
    loadT02(),
    import(new URL('./fixtures-v010/business-feature-decision-v1.mjs', import.meta.url).href) as Promise<{ getPolicy: () => Record<string, any> }>,
  ]);
  const policy = businessModule.getPolicy();
  const material = policy.featureDecisions.submitFeatureDecision;
  const rule = policy.rules['rule:fd-approve'];
  const dispatcher = sdk.createFeatureDecisionDispatcher({
    decisions: [{
      declarationDigest: rule.declarationDigest,
      declarationId: 'rule:fd-approve',
      featureKey: SEMANTIC_KEY,
      invoke: t02.resolve,
      featureRequest: material.featureRequest,
      outcomeField: material.outcomeField,
      outcomeEvents: material.outcomeEvents,
      eventPayloadFromInput: material.eventPayloadFromInput,
      allowedOutcomes: rule.allowedOutcomes,
      allowedEventTypes: rule.allowedEventTypes,
      inputSelection: rule.inputSelection,
      timeoutMs: material.timeoutMs,
    }],
    deps: { model },
  });
  const ports = memoryDocs();
  const kernelSource = await readFile(
    new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url),
    'utf8',
  );
  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'v08-kernel-mechanism@1.0.0', moduleSha256: sha256HexSource(kernelSource) },
    hostPorts: {
      docs: ports.docs,
      sha256: { digestUtf8: (value: string) => sha256HexSource(value) },
      resources: { call: async (_resourceKey: string, _operation: string, payload: unknown) => { ports.effectCalls.push(payload); return { reserved: true }; } },
      clock: (): string => new Date().toISOString(),
    },
    sdkEndpoint: { packageId: 'standard-sdk@v08.1.0.0', interpret: dispatcher.interpret },
    businessEndpoint: policy,
  });
  const target = { workflowId: 'order-quote', instanceKey: 'instance:cancel' };
  await runtime.openInstance({ target, correlationId: 'corr:f1', authorityClass: 'PRODUCTION' });
  return {
    submit: (input, messageId, control) => runtime.submitOccurrence({
      kind: 'v08/tc-intent', intentType: FD_INTENT, target, messageId, input, caller: { role: 'requester' },
    }, control),
    journalBegins: () => runtime.counters.journalBegins as number,
    effectCount: () => ports.effectCalls.length,
  };
}

test('1267-F1: cancelling a bound turn with a hanging Host model terminates CANCELLED, releases the lane, and never adopts the late settlement', { timeout: 15000 }, async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  let releaseModel: (decision: { disposition: string }) => void = () => {};
  const modelSettled = new Promise<{ disposition: string }>((resolve) => { releaseModel = resolve; });
  let modelStarted = 0;
  const rig = await cancelRig(async () => {
    modelStarted += 1;
    return await modelSettled;
  });
  try {
    const controller = new AbortController();
    const pendingTurn = rig.submit({ amount: 42, requestId: 'R-f1' }, 'msg:f1-cancel', { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(modelStarted, 1, 'the model fallback started inside the K turn');
    controller.abort();
    const receipt = await pendingTurn as Record<string, any>;
    assert.equal(receipt.status, 'terminated', JSON.stringify(receipt));
    assert.equal(receipt.terminal.code, 'CANCELLED');
    assert.equal(receipt.terminal.inFlightTurnDiscarded, true);
    assert.equal(rig.journalBegins(), 0, 'zero Journal for a cancelled turn');
    assert.equal(rig.effectCount(), 0, 'zero Effects for a cancelled turn');
    // The late settlement (a forged decision, after the turn already ended)
    // is never adopted; it must not surface as an unhandledRejection either.
    releaseModel({ disposition: 'approved' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    // The lane is released: a following message on the SAME instance is
    // processed (the rule path, no model involved).
    const next = await rig.submit({ amount: 30, requestId: 'R-f1-next' }, 'msg:f1-next') as Record<string, any>;
    assert.equal(next.status, 'admitted');
    assert.equal(next.admitted.targetState, 'approved');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(unhandled, [], 'no unhandledRejection from the discarded in-flight turn');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('1267-F2: a hanging selected feature on a bound intent ends deadline-exceeded within the bound through a real facade.send; the lane is released', { timeout: 15000 }, async () => {
  const forgedSource = await readFixture('sfeature-forged-decision-v1.mjs');
  const forged = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: forgedSource,
    featureExport: 'resolveSemanticDecision',
  });
  const app = await activate(await fdComposition({ featureModule: forged, routes: [boundRoute, boundReviewRoute, plainRoute] }));
  (globalThis as Record<string, unknown>).__forgedDirective = 'never-settling';
  try {
    const started = Date.now();
    const receipt = await send(app.facade, 'f2-hang', { amount: 42, requestId: 'R-f2' }) as Record<string, any>;
    const elapsed = Date.now() - started;
    assert.equal(receipt.status, 'terminated');
    assert.equal(receipt.terminal.code, 'SEMANTIC_UNAVAILABLE');
    assert.deepEqual(receipt.resolver.featureDispatch, FEATURE_DISPATCH);
    assert.ok(elapsed < 1000 + 2000, `the per-turn timeout bounds the facade turn (elapsed ${String(elapsed)}ms)`);
    assert.equal(journalCount(app.store), 0, 'zero Journal/Effect for the timed-out turn');
    // The lane is released: the NEXT message on the same instance is processed.
    (globalThis as Record<string, unknown>).__forgedDirective = 'feature-throws';
    const next = await send(app.facade, 'f2-hang', { amount: 30, requestId: 'R-f2-next' }) as Record<string, any>;
    assert.equal(next.status, 'terminated', 'the next turn runs (lane released; this directive is refused, not stuck)');
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    delete (globalThis as Record<string, unknown>).__forgedDirective;
    app.dispose();
  }
});

test('1267-F2: two turns at different wall-clock times each get a fresh per-turn deadline', { timeout: 15000 }, async () => {
  const t02 = await loadT02();
  let modelCalls = 0;
  const app = await activate(await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] }), {
    decisionDependencies: { model: async () => { modelCalls += 1; return { disposition: 'approved' }; } },
  });
  const first = await send(app.facade, 'f2-a', { amount: 42, requestId: 'R-f2a' }, FD_INTENT, 'msg:f2-a') as Record<string, any>;
  assert.equal(first.status, 'admitted');
  await new Promise((resolve) => setTimeout(resolve, 60));
  const second = await send(app.facade, 'f2-b', { amount: 42, requestId: 'R-f2b' }, FD_INTENT, 'msg:f2-b') as Record<string, any>;
  assert.equal(second.status, 'admitted', JSON.stringify(second));
  assert.equal(modelCalls, 2, 'the second turn is NOT pre-expired: its deadline was computed fresh');
  app.dispose();
});

test('1267-F2: a missing timeout refuses the wiring typed; an absolute deadlineEpochMs in sealed material is refused at wiring', async () => {
  const t02 = await loadT02();
  // Through the REAL composition: the sealed business material without the
  // mandatory timeoutMs refuses the K turn typed before any admission.
  const business = await readFixture('business-feature-decision-v1.mjs');
  const stripped = business.replace(/^(\s*)timeoutMs: 1000,$/gm, '');
  assert.notEqual(stripped, business, 'the fixture variant must actually drop the timeouts');
  const app = await fdComposition({ featureModule: t02.entry, routes: [boundRoute, boundReviewRoute, plainRoute] });
  const businessEntry = app.modules.find((module) => module.role === 'business') as V10ModuleInput & { moduleSource: string };
  businessEntry.moduleSource = stripped;
  businessEntry.moduleSha256 = sha256HexSource(stripped);
  const store = new PlainCasDocStore();
  const activated = await activateV10App(buildV10App(app), { store, now: () => 0 });
  await assert.rejects(
    activated.facade.send({ intentType: FD_INTENT, instanceKey: 'instance:f9', messageId: 'msg:f9', input: { amount: 30, requestId: 'R-f9' } }),
    errorCode('V10_BUSINESS_POLICY_INVALID'),
  );
  activated.dispose();
  // An absolute deadlineEpochMs in sealed material is meaningless and is
  // refused at the trusted wiring boundary.
  const sdk = await loadSdk();
  assert.throws(() => sdk.createFeatureDecisionDispatcher({
    decisions: [{
      declarationDigest: 'f'.repeat(64),
      declarationId: 'rule:abs',
      featureKey: SEMANTIC_KEY,
      invoke: async () => ({ kind: 'selected', source: 'rule', decision: { disposition: 'approved' }, evidence: {} }),
      featureRequest: { schema: { id: 's', revision: 'r', provenanceKey: 'p' }, limits: { maxSteps: 1, deadlineEpochMs: Date.now() + 60_000 } },
      outcomeField: 'disposition',
      outcomeEvents: { approved: 'EV_OK' },
      eventPayloadFromInput: {},
      allowedOutcomes: ['approved'],
      allowedEventTypes: ['EV_OK'],
      inputSelection: { amount: 'amount' },
      timeoutMs: 250,
    }],
  }), (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: string }).code === 'SDK_DISPATCH_WIRING_INVALID');
});

test('1267-F3: an inherited-object outcome name resolves to NOTHING — own-property outcome lookup only', async () => {
  const sdk = await loadSdk();
  const OUTCOME_FIELD = 'disposition';
  const hostile = async (outcome: string) => sdk.createFeatureDecisionDispatcher({
    decisions: [{
      declarationDigest: '9'.repeat(64),
      declarationId: 'rule:proto',
      featureKey: SEMANTIC_KEY,
      invoke: async () => ({ kind: 'selected', source: 'rule', decision: { [OUTCOME_FIELD]: outcome }, evidence: { modelCallEvidence: 'unmeasured', modelCalls: 0 } }),
      featureRequest: { schema: { id: 's', revision: 'r', provenanceKey: 'p' } },
      outcomeField: OUTCOME_FIELD,
      outcomeEvents: { approved: 'EV_OK' },
      eventPayloadFromInput: {},
      allowedOutcomes: ['approved'],
      allowedEventTypes: ['EV_OK'],
      inputSelection: { amount: 'amount' },
      timeoutMs: 250,
    }],
  });
  // `constructor` passes the identifier grammar but must resolve to nothing
  // (the outcome map is a null-prototype own-property map, never [[Get]]).
  const constructorResult = await (await hostile('constructor')).interpret(boundDeclaration('9'.repeat(64)), { amount: 1 }) as Record<string, any>;
  assert.equal(constructorResult.semanticStatus, 'unavailable');
  assert.equal(constructorResult.unavailable.reason, 'outcome-unmapped');
  assert.equal(constructorResult.structuredDecision, undefined);
  assert.equal(JSON.stringify(constructorResult).includes('function'), false, 'no inherited function shape may surface');
  // `__proto__` is refused by the identifier grammar even earlier.
  const protoResult = await (await hostile('__proto__')).interpret(boundDeclaration('9'.repeat(64)), { amount: 1 }) as Record<string, any>;
  assert.equal(protoResult.semanticStatus, 'unavailable');
  assert.equal(protoResult.unavailable.reason, 'outcome-invalid');
  assert.equal(protoResult.structuredDecision, undefined);
});

