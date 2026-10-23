/**
 * #1003 FR08 SD1/SD2 + NF05 — SELECTED Standard SDK `semantic-decision`
 * interpretation and Kernel trusted-boundary binding, unit level.
 * ==========================================================================
 *
 * The physical Node/SQLite proof of the same slots (real bootstrap → sealed
 * app → authenticated send through the selected K/S) lives in
 * domain-harness tests/v08-integration/fr08-sd-nf05-physical.test.ts; the
 * BUILD-side compile checks live in semantic-decision-declaration.test.ts
 * (T001). This file owns only the S interpreter semantics and the Kernel
 * wiring-boundary refusals in isolation.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readPayload(name: string): string {
  const dir = name === 'kernel-mechanism-v1.mjs' ? 'kernel/basic' : 'standard/basic';
  return readFileSync(fileURLToPath(new URL(`../../../domain-packages/${dir}/${name}`, import.meta.url)), 'utf8');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function importSource(source: string): Promise<Record<string, any>> {
  return import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
}

const KERNEL_SOURCE = readPayload('kernel-mechanism-v1.mjs');
const kernel = await importSource(KERNEL_SOURCE);
// The S import goes through the same source the sealed packages carry.
const sdk = await importSource(readPayload('standard-sdk-v1.mjs'));

function refuses(code: string, fn: () => unknown) {
  assert.throws(fn, (error: unknown) => (error as { code?: string })?.code === code);
}

// ---------------------------------------------------------------------------
// The compiled SemanticDecision declaration (BUILD vocabulary), mirroring
// the sealed business-semantic-decision fixture.
// ---------------------------------------------------------------------------
function compiledDeclaration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'semantic-decision',
    id: 'rule:sd-unit',
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['SD_QUOTE_DECIDED', 'SD_QUOTE_REJECTED'],
    inputSelection: { amount: 'amount', requestId: 'requestId' },
    resultSchema: {
      required: ['amount', 'requestId'],
      properties: { amount: 'number', requestId: 'string' },
    },
    disposition: {
      mode: 'deterministic',
      outcome: 'approve',
      eventType: 'SD_QUOTE_DECIDED',
      payloadFromInput: { amount: 'amount', requestId: 'requestId' },
    },
    queryCapabilityIds: [],
    policy: { maxSteps: 1 },
    ...overrides,
  };
}

const INPUT = { amount: 30, requestId: 'R-1' };

test('FR08-P-SD1 (S): deterministic declaration resolves model-free with declaration-level zero-call truth', () => {
  const result = sdk.interpret(compiledDeclaration(), INPUT, {});
  assert.equal(result.kind, 'semantic-decision');
  assert.deepEqual(JSON.parse(JSON.stringify(result.structuredDecision)), {
    decision: { outcome: 'approve', data: { amount: 30, requestId: 'R-1' } },
    event: { type: 'SD_QUOTE_DECIDED', payload: { amount: 30, requestId: 'R-1' } },
  });
  // Declaration-level truth values (PRD FR08-P/N-SD1): the declared route
  // contains zero fresh-model steps by construction.
  assert.equal(result.llmAvoided, true);
  assert.equal(result.freshModelCallCount, 0);
  // Plain interpreter (no Host ModelPort bound): no port attestation exists.
  assert.deepEqual(result.modelCallEvidence, { status: 'unsupported' });
  assert.equal(result.source, 'harness-machine');
});

test('FR08-P-SD1 (S): the Host-bound resolver reports measured(0) and never touches the port', () => {
  let portCalls = 0;
  const resolver = sdk.createHostBoundModelResolver({
    invoke: async () => {
      portCalls += 1;
      return { decision: { outcome: 'x' }, event: { type: 'Y' } };
    },
  });
  const result = resolver.interpret(compiledDeclaration(), INPUT, {});
  assert.equal(portCalls, 0, 'the deterministic semantic-decision route must never invoke the ModelPort');
  assert.deepEqual(result.modelCallEvidence, { status: 'measured', count: 0, scope: 'bound-model-port-invocations' });
  assert.equal(result.llmAvoided, true);
  assert.equal(result.freshModelCallCount, 0);
});

test('FR08-N-SD1 (S): declared semantic-unavailability is a typed zero-decision envelope, not an error', () => {
  const result = sdk.interpret(compiledDeclaration({
    id: 'rule:sd-un',
    unavailable: { disposition: 'semantic-unavailable', reason: 'not deployed' },
  }), INPUT, {});
  assert.equal(result.kind, 'semantic-decision');
  assert.equal(result.semanticStatus, 'unavailable');
  assert.deepEqual(result.unavailable, { disposition: 'semantic-unavailable', reason: 'not deployed' });
  assert.equal(Object.hasOwn(result, 'structuredDecision'), false, 'no decision is proposed on the unavailable path');
  assert.equal(result.llmAvoided, true);
  refuses('SDK_SEMANTIC_DECISION_INVALID', () => sdk.interpret(compiledDeclaration({
    id: 'rule:sd-un-bad',
    unavailable: { disposition: 'wrong', reason: 'x' },
  }), INPUT, {}));
});

test('FR08-P/N-SD2 (S): routed declared events resolve; undeclared event/outcome refuse typed', () => {
  const routed = compiledDeclaration({
    id: 'rule:sd-route',
    inputSelection: { amount: 'amount', requestId: 'requestId', proposedOutcome: 'proposedOutcome', proposedEventType: 'proposedEventType' },
    disposition: {
      mode: 'route',
      outcomeFrom: 'proposedOutcome',
      eventTypeFrom: 'proposedEventType',
      payloadFromInput: { amount: 'amount', requestId: 'requestId' },
    },
  });
  const input = { ...INPUT, proposedOutcome: 'reject', proposedEventType: 'SD_QUOTE_REJECTED' };
  const result = sdk.interpret(routed, input, {});
  assert.equal(result.structuredDecision?.decision?.outcome, 'reject');
  assert.equal(result.structuredDecision?.event?.type, 'SD_QUOTE_REJECTED');
  assert.deepEqual({ ...result.structuredDecision?.decision?.data }, { amount: 30, requestId: 'R-1' });
  // SD2-N: the disposition allowlists bound what may be proposed at all.
  refuses('SDK_SEMANTIC_EVENT_UNDECLARED', () => sdk.interpret(routed, { ...input, proposedEventType: 'SD_QUOTE_SECRET' }, {}));
  refuses('SDK_SEMANTIC_OUTCOME_UNDECLARED', () => sdk.interpret(routed, { ...input, proposedOutcome: 'escalate' }, {}));
});

test('NF05 (S): exact input selection and promoted-reference binding fail closed', () => {
  refuses('SDK_PROJECTION_MISSING', () => sdk.interpret(compiledDeclaration(), { amount: 30 }, {}));
  const promoted = compiledDeclaration({
    id: 'rule:sd-promo',
    promotedReference: { artifactId: 'promoted:p', contentDigest: 'd1', required: true },
  });
  refuses('SDK_SEMANTIC_PROMOTION_UNRESOLVED', () => sdk.interpret(promoted, INPUT, {}));
  refuses('SDK_SEMANTIC_PROMOTION_UNRESOLVED', () => sdk.interpret(promoted, INPUT, {
    promotedReferences: { 'promoted:p': { artifactId: 'promoted:p', contentDigest: 'd2' } },
  }));
  const resolved = sdk.interpret(promoted, INPUT, {
    promotedReferences: { 'promoted:p': { artifactId: 'promoted:p', contentDigest: 'd1' } },
  });
  assert.equal(resolved.structuredDecision?.decision?.outcome, 'approve');
});

test('NF05-N-POST (S): a resolver payload violating the declared resultSchema refuses typed', () => {
  // The projected payload resolves, then violates the declared resultSchema
  // (amount is a string where the declaration requires a number) — typed
  // refusal AFTER resolution, BEFORE any Kernel admission.
  refuses('SDK_SEMANTIC_RESULT_INVALID', () => sdk.interpret(compiledDeclaration(), { amount: 'thirty', requestId: 'R-2' }, {}));
});

// ---------------------------------------------------------------------------
// Kernel trusted-boundary binding (unit rig — sync sha port like the
// physical bootstrap; the full physical proof is the integration file).
// ---------------------------------------------------------------------------
function memoryDocs() {
  const docs = new Map<string, { value: any; revision: number }>();
  const clone = (value: any) => JSON.parse(JSON.stringify(value));
  return {
    async get(key: string) {
      const doc = docs.get(key);
      return doc === undefined ? null : { value: clone(doc.value), revision: doc.revision };
    },
    async put(key: string, value: any, conditions: Record<string, unknown> = {}) {
      const existing = docs.get(key);
      if (conditions.mustBeAbsent === true && existing !== undefined) {
        throw Object.assign(new Error(`host doc ${key} exists`), { code: 'HOST_KEY_EXISTS' });
      }
      if (conditions.mustMatchRevision !== undefined && existing?.revision !== conditions.mustMatchRevision) {
        throw Object.assign(new Error(`host doc ${key} CAS conflict`), { code: 'HOST_CAS_CONFLICT' });
      }
      const revision = existing === undefined ? 0 : existing.revision + 1;
      docs.set(key, { value: clone(value), revision });
      return { revision };
    },
    async list(prefix: string) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

const UNIT_DEFINITION = {
  workflowKey: 'sd-unit',
  initialState: 'review',
  initialContext: {},
  guards: [],
  states: [
    {
      stateKey: 'review',
      transitions: [
        { transitionKey: 'approve', trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' }, targetState: 'approved', effectIntents: [] },
      ],
    },
    { stateKey: 'approved', kind: 'final' },
  ],
};

function semanticPolicy(rules: Record<string, unknown>) {
  return {
    packageId: 'business-unit@v08.1.0.0',
    policyId: 'unit-semantic',
    domainId: 'orders',
    workflowDefinition: UNIT_DEFINITION,
    decisionSchema: { isValid: (value: any) => typeof value?.decision?.outcome === 'string' && typeof value?.event?.type === 'string' },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules,
    intentBindings: Object.fromEntries(Object.keys(rules).map((ruleId) => [ruleId, {
      trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' }, ruleId,
    }])),
    effectBindings: {},
  };
}

function unitPorts() {
  return {
    docs: memoryDocs(),
    // The physical bootstrap port returns the digest synchronously; the
    // semantic wiring REQUIRES that (an async digest cannot gate the
    // synchronous trusted load boundary).
    sha256: { digestUtf8(value: string) { return sha256Hex(value); } },
    resources: { async call() { return { ok: true }; }, async callScoped() { return { ok: true }; } },
    clock: () => '2026-10-15T00:00:00.000Z',
  };
}

function withDigest(rule: Record<string, unknown>): Record<string, unknown> {
  const { declarationDigest: _omit, ...body } = rule;
  return { ...rule, declarationDigest: sha256Hex(kernel.canonicalJsonStringify(body)) };
}

const wiredRule = withDigest(compiledDeclaration());
const unavailableRule = withDigest(compiledDeclaration({
  id: 'rule:sd-unit-un',
  unavailable: { disposition: 'semantic-unavailable', reason: 'not deployed' },
}));

test('NF05-N-PRE (K wiring): stale/substituted/malformed declarations fail the load typed', () => {
  const ports = unitPorts();
  const runtime = () => kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
    hostPorts: ports,
    sdkEndpoint: { packageId: 'standard-sdk@v08.1.0.0', interpret: (d: unknown, i: unknown, c: unknown) => sdk.interpret(d, i, c) },
    businessEndpoint: semanticPolicy({ 'rule:sd-unit': wiredRule }),
  });
  assert.equal(typeof runtime().submitOccurrence, 'function', 'the exact compiled declaration wires');

  // Substituted descriptor: another declaration's digest over this body.
  const tampered = { ...compiledDeclaration({ id: 'rule:sd-tamper' }), declarationDigest: (wiredRule as { declarationDigest: string }).declarationDigest };
  assert.throws(() => kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: 'x' },
    hostPorts: ports,
    sdkEndpoint: { packageId: 's', interpret: () => undefined },
    businessEndpoint: semanticPolicy({ 'rule:sd-tamper': tampered }),
  }), (error: unknown) => (error as { code?: string })?.code === 'SEMANTIC_DECISION_INVALID');

  // Missing digest and unsupported keys are both load refusals.
  const { declarationDigest: _missing, ...noDigest } = compiledDeclaration();
  assert.throws(() => kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: 'x' },
    hostPorts: ports,
    sdkEndpoint: { packageId: 's', interpret: () => undefined },
    businessEndpoint: semanticPolicy({ 'rule:sd-nodigest': noDigest }),
  }), (error: unknown) => (error as { code?: string })?.code === 'SEMANTIC_DECISION_INVALID');
  assert.throws(() => kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: 'x' },
    hostPorts: ports,
    sdkEndpoint: { packageId: 's', interpret: () => undefined },
    businessEndpoint: semanticPolicy({ 'rule:sd-extra': withDigest(compiledDeclaration({ extra: 'x' })) }),
  }), (error: unknown) => (error as { code?: string })?.code === 'SEMANTIC_DECISION_INVALID');
});

test('NF05-N (K submit): a post-wiring injected semantic-decision rule never runs', async () => {
  const ports = unitPorts();
  const policy = semanticPolicy({ 'rule:sd-unit': wiredRule });
  const rt = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
    hostPorts: ports,
    sdkEndpoint: { packageId: 'standard-sdk@v08.1.0.0', interpret: (d: unknown, i: unknown, c: unknown) => sdk.interpret(d, i, c) },
    businessEndpoint: policy,
  });
  const target = { workflowId: 'sd-unit', instanceKey: 'u:1' };
  await rt.openInstance({ target, authorityClass: 'PRODUCTION' });
  const admitted = await rt.submitOccurrence({ intentType: 'rule:sd-unit', messageId: 'm1', input: INPUT, target });
  assert.equal(admitted.status, 'admitted');

  // Injected AFTER the trusted boundary — even a digest-consistent rule —
  // is refused: it was never validated at the load boundary.
  policy.rules['rule:sd-injected' as keyof typeof policy.rules] = withDigest(compiledDeclaration({ id: 'rule:sd-injected' }));
  policy.intentBindings['rule:sd-injected' as keyof typeof policy.intentBindings] = {
    trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' }, ruleId: 'rule:sd-injected',
  };
  await assert.rejects(
    () => rt.submitOccurrence({ intentType: 'rule:sd-injected', messageId: 'm2', input: INPUT, target }),
    (error: unknown) => (error as { code?: string })?.code === 'SEMANTIC_DECISION_UNVALIDATED',
  );
});

test('NF05-N (K submit, R1 P1): an in-place mutation of a wired rule object never changes what runs', async () => {
  const ports = unitPorts();
  // A FRESH digest-correct declaration wired through the trusted boundary
  // (the module-level `wiredRule` stays untouched for the other cases).
  const rule = withDigest(compiledDeclaration({ id: 'rule:sd-mutated' }));
  const received: unknown[] = [];
  // A private definition with ONE authorized effect on the approve
  // transition, so the journal below carries exactly the ONE record the
  // approved meaning authorizes (and none from the mutation).
  const policy = {
    ...semanticPolicy({ 'rule:sd-mutated': rule }),
    workflowDefinition: {
      ...UNIT_DEFINITION,
      states: [
        {
          stateKey: 'review',
          transitions: [{
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
            targetState: 'approved',
            effectIntents: [{
              effectType: 'effect:reserve',
              input: { reservation: 'sd-mutated' },
              idempotencyKey: 'reserve:sd-mutated:1',
            }],
          }],
        },
        { stateKey: 'approved', kind: 'final' },
      ],
    },
    effectBindings: {
      'effect:reserve': { semantics: 'non-idempotent', handler: async () => ({ reserved: true }) },
    },
  };
  const rt = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
    hostPorts: ports,
    sdkEndpoint: {
      packageId: 'standard-sdk@v08.1.0.0',
      interpret: (d: unknown, i: unknown, c: unknown) => { received.push(d); return sdk.interpret(d, i, c); },
    },
    businessEndpoint: policy,
  });
  const target = { workflowId: 'sd-unit', instanceKey: 'u:3' };
  await rt.openInstance({ target, authorityClass: 'PRODUCTION' });

  // AFTER wiring, the still-mutable original object is mutated IN PLACE —
  // same object identity, both values flipped inside the pre-approved
  // allowlists (the exact R1 P1 scenario). The WeakMap identity check
  // alone cannot see this mutation.
  const disposition = rule.disposition as Record<string, unknown>;
  disposition.outcome = 'reject';
  disposition.eventType = 'SD_QUOTE_REJECTED';
  assert.equal(rule.disposition.outcome, 'reject');

  const receipt = await rt.submitOccurrence({ intentType: 'rule:sd-mutated', messageId: 'm1', input: INPUT, target });
  // The load-time verified FROZEN declaration is what S received and what
  // ran: the approved meaning (approve / SD_QUOTE_DECIDED) is admitted.
  assert.equal(receipt.status, 'admitted');
  assert.equal(received.length, 1);
  assert.equal(Object.isFrozen(received[0]), true, 'S must receive the deep-frozen verified snapshot, not the mutable original');
  const seen = received[0] as { disposition?: { outcome?: string; eventType?: string } };
  assert.equal(seen.disposition?.outcome, 'approve');
  assert.equal(seen.disposition?.eventType, 'SD_QUOTE_DECIDED');
  const snapshot = await rt.getSnapshot(target);
  assert.equal(snapshot?.state?.stateKey, 'approved');
  // Exactly the ONE authorized journal record of the approved transition —
  // the mutation produced no additional or unauthorized record.
  assert.equal(await ports.docs.list('v08-kernel:effect-journal:').then((keys: string[]) => keys.length), 1);
});

test('FR08-N-SD1 (K submit): declared unavailability terminates typed with zero admission activity', async () => {
  const ports = unitPorts();
  const rt = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
    hostPorts: ports,
    sdkEndpoint: { packageId: 'standard-sdk@v08.1.0.0', interpret: (d: unknown, i: unknown, c: unknown) => sdk.interpret(d, i, c) },
    businessEndpoint: semanticPolicy({ 'rule:sd-unit-un': unavailableRule }),
  });
  const target = { workflowId: 'sd-unit', instanceKey: 'u:2' };
  await rt.openInstance({ target, authorityClass: 'PRODUCTION' });
  const receipt = await rt.submitOccurrence({ intentType: 'rule:sd-unit-un', messageId: 'm1', input: INPUT, target });
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal?.code, 'SEMANTIC_UNAVAILABLE');
  assert.equal(receipt.terminal?.declarationId, 'rule:sd-unit-un');
  assert.equal(await ports.docs.list('v08-kernel:effect-journal:').then((keys: string[]) => keys.length), 0, 'zero journal records on the unavailable path');
  const snapshot = await rt.getSnapshot(target);
  assert.equal(snapshot?.state?.stateKey, 'review', 'no state mutation on the unavailable path');
});
