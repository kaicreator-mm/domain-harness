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
  assert.deepEqual(payload.budget, { maxSteps: 8, deadlineEpochMs: null });
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

test('1267-F2: factory — a non-thenable feature return is refused without consumption; a hostile thenable value never enters the mapping', { timeout: 8000 }, async () => {
  // A feature export returning a FUNCTION (not a thenable): contract
  // violation, refused before the value is ever consumed.
  const harness = await factoryDispatcher(async () => async () => 'unused');
  const refused = await harness.interpret(boundDeclaration('a'.repeat(64)), { amount: 1 });
  assert.equal(refused.semanticStatus, 'unavailable');
  assert.equal(refused.unavailable.reason, 'feature-result-invalid');

  // An async export whose resolution value is a thenable-shaped record: the
  // await adopts it (promise semantics), so the DECLARED deadline bounds the
  // wait; the smuggled value never enters the dispatcher's mapping lane.
  const thenableValue = await factoryDispatcher(
    async () => ({
      kind: 'selected', source: 'rule',
      decision: { disposition: 'approved' },
      evidence: { modelCallEvidence: 'unmeasured', modelCalls: 0 },
      then: () => 'smuggled',
    }),
    { now: () => Date.now() },
    'a'.repeat(64),
    { limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1, deadlineEpochMs: Date.now() + 60 } },
  );
  const refusedThenable = await thenableValue.interpret(boundDeclaration('a'.repeat(64)), { amount: 1 });
  assert.equal(refusedThenable.semanticStatus, 'unavailable');
  assert.equal(refusedThenable.unavailable.reason, 'deadline-exceeded');
  assert.equal(JSON.stringify(refusedThenable).includes('smuggled'), false);
  assert.equal(refusedThenable.structuredDecision, undefined);
  await new Promise((resolve) => setTimeout(resolve, 120));
});

test('1267-F3: factory — a never-settling feature settles at the declared deadline; a late value is never adopted', { timeout: 8000 }, async () => {
  const sdk = await loadSdk();
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
        limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1, deadlineEpochMs: Date.now() + 40 },
      },
      outcomeField: 'disposition',
      outcomeEvents: { approved: 'EV_OK' },
      eventPayloadFromInput: {},
      allowedOutcomes: ['approved'],
      allowedEventTypes: ['EV_OK'],
      inputSelection: { amount: 'amount' },
    }],
    deps: { now: () => Date.now() },
  });
  const result = await expired.interpret(boundDeclaration('d'.repeat(64)), { amount: 1 }) as Record<string, any>;
  assert.equal(result.semanticStatus, 'unavailable');
  assert.equal(result.unavailable.reason, 'deadline-exceeded');
  assert.equal(result.structuredDecision, undefined, 'no decision exists for a refused dispatch');
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
