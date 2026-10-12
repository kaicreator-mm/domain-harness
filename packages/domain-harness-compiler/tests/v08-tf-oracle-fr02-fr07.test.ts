/**
 * WEB-ORACLE-1 — FR02 / FR07 historical usable-behavior differential.
 *
 * SOURCE_PREPARED_ONLY. This file intentionally distinguishes:
 *   1) executable control semantics present on the physically selected v0.8 K/S;
 *   2) historical FR02/FR07 semantics which remain GAP and are represented by
 *      test.todo sentinels rather than fabricated old-API compatibility.
 *
 * Historical authority (version/v0.7):
 *   commit 86110c616b8cb18c730553e4cdab7ef555214521
 *   expression-runtime.ts          c37cf23d4987088df8218a124d5a29efdd758e7c
 *   portable-expression.test.ts    c9cf11e3114ccf5f1174cf77d174032de15cf6c7
 *   harness-machine.ts             f2fe5d49138be550555e6b88863961778cb2ce0f
 *   business-harness-machine.test  0c5622b5206ec15622f3ad706c67a4545f6e418b
 *
 * Current selected v0.8 source-prep base:
 *   v0.8@557e8ba53f90309c9d370d32b77d2dff070b8a5b
 *   standard-sdk-v1.mjs            fa01e3cc70bc9a08bf14bd497dfb3fba79bd067f
 *   kernel-mechanism-v1.mjs        f74f77ba6fbd882f9e4fdf0a6d661ce3fd348555
 *
 * This Web actor does NOT attest that this file has passed Node/Linux/SQLite.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as kernel from '../src/qualified-package/payload/kernel-mechanism-v1.mjs';
import * as sdk from '../src/qualified-package/payload/standard-sdk-v1.mjs';

const V08_BASE = '557e8ba53f90309c9d370d32b77d2dff070b8a5b';
const V08_S_BLOB = 'fa01e3cc70bc9a08bf14bd497dfb3fba79bd067f';
const V08_K_BLOB = 'f74f77ba6fbd882f9e4fdf0a6d661ce3fd348555';

const LEGACY_CLOCK = '2026-09-17T02:00:00.123Z';
const LEGACY_FR02_EXPRESSION =
  '{"value": input.value * 2, "now": $now(), "millis": $millis()}';
const LEGACY_FR02_EXPECTED = Object.freeze({
  value: 42,
  now: LEGACY_CLOCK,
  millis: Date.parse(LEGACY_CLOCK),
});

async function gitBlobSha(url: URL): Promise<string> {
  const bytes = await readFile(url);
  // Git object format is the ASCII header followed by one literal NUL byte.
  const header = Buffer.concat([Buffer.from(`blob ${bytes.byteLength}`, 'utf8'), Buffer.from([0])]);
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function code(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function casError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'HOST_CAS_CONFLICT' });
}

function oracleHostPorts() {
  const store = new Map<string, { value: unknown; revision: number }>();
  return {
    docs: {
      async get(key: string) {
        const row = store.get(key);
        return row === undefined ? null : { value: clone(row.value), revision: row.revision };
      },
      async put(
        key: string,
        value: unknown,
        conditions: { mustBeAbsent?: boolean; mustMatchRevision?: number } = {},
      ) {
        const previous = store.get(key);
        if (conditions.mustBeAbsent === true && previous !== undefined) {
          throw casError(`${key} already exists`);
        }
        if (
          conditions.mustMatchRevision !== undefined
          && previous?.revision !== conditions.mustMatchRevision
        ) {
          throw casError(`${key} revision mismatch`);
        }
        const revision = previous === undefined ? 0 : previous.revision + 1;
        store.set(key, { value: clone(value), revision });
        return { revision };
      },
      async list(prefix: string) {
        return [...store.keys()].filter((key) => key.startsWith(prefix)).sort();
      },
    },
    sha256: {
      async digestUtf8(value: string) {
        return createHash('sha256').update(value, 'utf8').digest('hex');
      },
    },
    clock: () => '2026-10-12T00:00:00.000Z',
    resources: {
      async call() {
        throw new Error('FR07 oracle policy declares no physical effect');
      },
    },
  };
}

function fr07BusinessPolicy() {
  const workflowDefinition = {
    workflowKey: 'oracle-fr07',
    initialState: 'review',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'accept',
            trigger: { kind: 'event', eventType: 'ORACLE_DECIDED' },
            targetState: 'accepted',
          },
        ],
      },
      { stateKey: 'accepted', kind: 'final' },
    ],
  };

  return {
    packageId: 'business:oracle-fr07@1',
    policyId: 'oracle-fr07',
    domainId: 'oracle',
    workflowDefinition,
    decisionSchema: {
      isValid(value: unknown) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
        const row = value as { decision?: { outcome?: unknown }; event?: { type?: unknown } };
        return typeof row.decision?.outcome === 'string' && typeof row.event?.type === 'string';
      },
    },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:oracle-fr07': {
        ruleId: 'rule:oracle-fr07',
        eventType: 'ORACLE_DECIDED',
        payloadFromInput: { value: 'value' },
      },
    },
    intentBindings: {
      submit: {
        trigger: { kind: 'event', eventType: 'ORACLE_DECIDED' },
        ruleId: 'rule:oracle-fr07',
        roles: ['requester'],
      },
    },
    effectBindings: {},
  };
}

function createFr07Runtime() {
  let sdkInterpretCalls = 0;
  let observedSdkPayload: unknown;
  const sdkEndpoint = {
    packageId: sdk.MODULE_ID,
    interpret(declaration: unknown, input: unknown, context: unknown) {
      sdkInterpretCalls += 1;
      const resolved = sdk.interpret(declaration, input, context);
      observedSdkPayload = structuredClone(resolved.structuredDecision.event.payload);
      return resolved;
    },
  };
  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: {
      packageId: 'kernel:oracle-fr07@1',
      moduleSha256: V08_K_BLOB,
    },
    hostPorts: oracleHostPorts(),
    sdkEndpoint,
    businessEndpoint: fr07BusinessPolicy(),
  });
  return { runtime, sdkInterpretCalls: () => sdkInterpretCalls, observedSdkPayload: () => observedSdkPayload };
}

test('WEB-ORACLE-1 META: source prep is bound to the exact physically selected v0.8 K/S blobs', async () => {
  assert.equal(V08_BASE, '557e8ba53f90309c9d370d32b77d2dff070b8a5b');
  assert.equal(
    await gitBlobSha(new URL('../src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url)),
    V08_S_BLOB,
  );
  assert.equal(
    await gitBlobSha(new URL('../src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url)),
    V08_K_BLOB,
  );
  assert.equal(sdk.MODULE_ID, 'standard-sdk@v08.1.0.0');
  assert.equal(kernel.MODULE_ID, 'v08-kernel-mechanism@1.0.0');
});

test('V08-FR02-P-CONTROL-01: physical K preserves deterministic bounded predicate replay for legacy input value=21', () => {
  const predicate = kernel.prepareDomainPredicate({
    op: 'eq',
    left: { source: 'context', path: ['input', 'value'] },
    right: { source: 'literal', value: 21 },
  });
  const context = kernel.prepareDomainPredicateContext({ input: { value: 21 } });
  const event = kernel.prepareDomainPredicateEvent({ type: 'ORACLE', payload: {} });
  const input = kernel.createPreparedDomainPredicateEvaluationInput(context, event);

  const first = kernel.evaluateDomainPredicate(predicate, input);
  const second = kernel.evaluateDomainPredicate(predicate, input);
  assert.equal(first, true);
  assert.equal(second, first);

  // Differential truth: this is a boolean predicate slice only. It is NOT
  // the v0.7 JSONata expression result {value:42, now, millis}.
  assert.equal(typeof first, 'boolean');
  assert.notDeepEqual(first, LEGACY_FR02_EXPECTED);
});

test('V08-FR02-N-CONTROL-01: physical S rejects non-portable JSON and accessor input before Rule interpretation', () => {
  const declaration = {
    id: 'rule:oracle-fr02',
    kind: 'rule',
    eventType: 'ORACLE',
    payloadFromInput: {},
  };

  assert.throws(
    () => sdk.interpret(declaration, { bad: Number.NaN }),
    (error: unknown) => code(error) === 'SDK_DATA_UNSAFE',
  );

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(
    () => sdk.interpret(declaration, cyclic),
    (error: unknown) => code(error) === 'SDK_DATA_BOUNDS',
  );

  let getterReads = 0;
  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, 'value', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 21;
    },
  });
  assert.throws(
    () => sdk.interpret(declaration, accessor),
    (error: unknown) => code(error) === 'SDK_DATA_UNSAFE',
  );
  assert.equal(getterReads, 0);
});

test('V08-FR02-DIFF-01: selected S Kind inventory has no free-form expression/script execution surface', () => {
  assert.deepEqual(
    sdk.STANDARD_KINDS,
    ['schema', 'rule', 'decision', 'workflow', 'operation'],
  );

  // The exact v0.7 positive oracle remains explicit so a future owner cannot
  // substitute boolean predicate success for the richer delivered behavior.
  assert.equal(LEGACY_FR02_EXPRESSION.includes('$now()'), true);
  assert.deepEqual(LEGACY_FR02_EXPECTED, {
    value: 42,
    now: LEGACY_CLOCK,
    millis: Date.parse(LEGACY_CLOCK),
  });
});

test.todo(
  'V08-FR02-P-F01 GAP: reproduce exact v0.7 portable expression result '
  + '{"value":42,"now":"2026-09-17T02:00:00.123Z","millis":1789610400123} '
  + 'through an authority-approved current v0.8 Rule/Operation + Host sandbox path',
);

test.todo(
  'V08-FR02-N-F02 GAP: current v0.8 equivalent of v0.7 $eval/$random/clock-argument policy denials',
);

test.todo(
  'V08-FR02-N-F03 GAP: current v0.8 expression timeout + UTF-8 input/output byte-limit semantics',
);

test('V08-FR07-P-CONTROL-01: physical K→S executes exactly one bounded occurrence and commits only Business-owned target state', async () => {
  const { runtime, sdkInterpretCalls } = createFr07Runtime();
  const target = { workflowId: 'oracle-fr07', instanceKey: 'case:positive' };
  await runtime.openInstance({ target, correlationId: 'corr:oracle-fr07' });

  const receipt = await runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType: 'submit',
    target,
    messageId: 'msg:oracle-fr07:1',
    input: { value: 21 },
    caller: { role: 'requester' },
  });

  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.transitionKey, 'accept');
  assert.equal(receipt.admitted.targetState, 'accepted');
  assert.equal(sdkInterpretCalls(), 1);
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'accepted');
});

test('V08-FR07-N-CONTROL-01: caller/model-shaped authority fields do not override physical K Business state authority', async () => {
  const { runtime, sdkInterpretCalls, observedSdkPayload } = createFr07Runtime();
  const target = { workflowId: 'oracle-fr07', instanceKey: 'case:smuggling' };
  await runtime.openInstance({ target, correlationId: 'corr:oracle-fr07-smuggling' });

  const receipt = await runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType: 'submit',
    target,
    messageId: 'msg:oracle-fr07:smuggle',
    input: {
      value: 21,
      nextState: 'pwned',
      transition: { targetState: 'pwned' },
      mutation: { state: 'pwned' },
      promotion: { approved: true },
      activation: { enabled: true },
      governanceBaseline: { authority: 'caller' },
      privateReasoning: 'must never become runtime authority',
    },
    caller: { role: 'requester' },
  });

  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.targetState, 'accepted');
  assert.equal(sdkInterpretCalls(), 1);
  // The admitted receipt contains authoritative admission metadata, NOT the raw SDK result.
  // Observe the real selected S interpreter result at its scoped invocation boundary.
  assert.deepEqual(observedSdkPayload(), { value: 21 });
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'accepted');
});

test('V08-FR07-N-CONTROL-02: unauthorized role is denied before S interpretation', async () => {
  const { runtime, sdkInterpretCalls } = createFr07Runtime();
  const target = { workflowId: 'oracle-fr07', instanceKey: 'case:role-deny' };
  await runtime.openInstance({ target, correlationId: 'corr:oracle-fr07-role' });

  const receipt = await runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType: 'submit',
    target,
    messageId: 'msg:oracle-fr07:role',
    input: { value: 21 },
    caller: { role: 'auditor' },
  });

  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'business-caller-role');
  assert.equal(sdkInterpretCalls(), 0);
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'review');
});

test.todo(
  'V08-FR07-P-F01 GAP: exact v0.7 bounded model→query→model final loop with two model turns, '
  + 'query observation/dependency capture, QUOTE decision and QUOTE_REQUESTED event',
);

test.todo(
  'V08-FR07-N-F02 GAP: exact v0.7 unknown-query + mutation-query denials on a current v0.8 Harness query surface',
);

test.todo(
  'V08-FR07-N-F03 GAP: exact v0.7 maxSteps exhaustion / active model-query cancellation semantics',
);

test.todo(
  'V08-FR07-N-F04 GAP: exact v0.7 query failure recovery + invalid query-output typed failure semantics',
);
